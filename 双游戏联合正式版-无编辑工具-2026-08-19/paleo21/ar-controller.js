import { MindARThree } from "./vendor/mindar/mindar-image-three.prod.js";

const STORAGE_KEY = "paleo21:ar-player-slots:v1";
const TARGETS = [
  { terrain: "shrub", name: "灌木", image: "../ar-assets/上排_01_灌木.png" },
  { terrain: "blank", name: "裸地", image: "../ar-assets/上排_02_裸地.png" },
  { terrain: "snow", name: "雪地", image: "../ar-assets/下排_01_雪地.png" },
  { terrain: "grass", name: "草地", image: "../ar-assets/下排_02_草地.png" },
];

let arena = null;
let host = null;
let panel = null;
let mindar = null;
let running = false;
let phase = "idle";
let boardFound = false;
let currentTarget = null;
let currentInverted = false;
let orientationOverridden = false;
let scanArmed = true;
let slots = loadSlots();

function loadSlots() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      Array.isArray(value) &&
      value.length === 5 &&
      value.every((item) => TARGETS.some((target) => target.terrain === item.terrain))
    ) {
      return value.map((item) => ({ terrain: item.terrain, inverted: !!item.inverted }));
    }
  } catch {}
  return [];
}

function saveSlots() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
}

function syncCameraButton(active) {
  document.querySelectorAll("[data-ar-camera-button]").forEach((button) => {
    button.textContent = active ? "关闭 AR 相机" : "开启相机";
    button.setAttribute("aria-pressed", String(active));
    button.disabled = false;
  });
}

function setLegacyStatus(state, title, detail) {
  if (!arena) return;
  const status = arena.querySelector("[data-ar-board-status]");
  if (!status) return;
  status.dataset.state = state;
  const titleNode = status.querySelector("b");
  const detailNode = status.querySelector("span");
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
}

function ensurePanel(targetArena) {
  arena = targetArena;
  const emptyState = arena.querySelector(".ar-empty-simulation");
  if (!emptyState) throw new Error("AR 容器尚未准备好");
  emptyState.dataset.mindarMounted = "true";
  host = emptyState.querySelector("[data-mindar-host]");
  panel = emptyState.querySelector("[data-ar-scan-panel]");
  if (!host) {
    host = document.createElement("div");
    host.className = "mindar-camera-host";
    host.dataset.mindarHost = "true";
    emptyState.append(host);
  }
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ar-scan-panel";
    panel.dataset.arScanPanel = "true";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <span class="ar-scan-kicker">PALEO 21 · 实物底板识别</span>
      <h2 data-ar-scan-title>准备识别底板</h2>
      <p data-ar-scan-detail>先对准底板下方的猛犸象图标，再逐槽识别五张地形牌。</p>
      <div class="ar-target-preview" data-ar-target-preview hidden>
        <img data-ar-target-image alt="" />
        <div><b data-ar-target-name></b><span data-ar-target-side></span></div>
      </div>
      <div class="ar-slot-progress" data-ar-slot-progress aria-label="地形卡槽识别进度"></div>
      <div class="ar-scan-actions">
        <button type="button" class="secondary" data-ar-action="previous" hidden>上一槽</button>
        <button type="button" class="secondary" data-ar-action="invert" hidden>改为逆位</button>
        <button type="button" class="primary" data-ar-action="primary" disabled>等待识别猛犸象</button>
      </div>
      <p class="ar-scan-note" data-ar-scan-note>底板背景图不参与识别；下方猛犸象负责定位。</p>
    `;
    panel.addEventListener("click", handlePanelClick);
    emptyState.append(panel);
  }
  renderProgress();
}

function title(text) {
  const node = panel?.querySelector("[data-ar-scan-title]");
  if (node) node.textContent = text;
}

function detail(text) {
  const node = panel?.querySelector("[data-ar-scan-detail]");
  if (node) node.textContent = text;
}

function note(text, error = false) {
  const node = panel?.querySelector("[data-ar-scan-note]");
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("is-error", error);
}

function primary(text, enabled = true) {
  const button = panel?.querySelector('[data-ar-action="primary"]');
  if (!button) return;
  button.textContent = text;
  button.disabled = !enabled;
}

function renderProgress() {
  const progress = panel?.querySelector("[data-ar-slot-progress]");
  if (!progress) return;
  progress.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const item = slots[index];
    const chip = document.createElement("span");
    chip.className = item ? "is-complete" : index === slots.length ? "is-current" : "";
    chip.textContent = item
      ? `${index + 1} ${TARGETS.find((target) => target.terrain === item.terrain)?.name || "地形"}${item.inverted ? "·逆" : "·正"}`
      : `${index + 1}`;
    progress.append(chip);
  }
  const previous = panel.querySelector('[data-ar-action="previous"]');
  if (previous) previous.hidden = phase !== "terrain" || slots.length === 0;
}

function showDetectedTarget(index) {
  const target = TARGETS[index];
  const preview = panel?.querySelector("[data-ar-target-preview]");
  if (!preview || !target) return;
  preview.hidden = false;
  preview.querySelector("[data-ar-target-image]").src = target.image;
  preview.querySelector("[data-ar-target-image]").alt = `${target.name}识别标识`;
  preview.querySelector("[data-ar-target-name]").textContent = target.name;
  preview.querySelector("[data-ar-target-side]").textContent = currentInverted ? "逆位" : "正位";
  const invert = panel.querySelector('[data-ar-action="invert"]');
  if (invert) {
    invert.hidden = false;
    invert.textContent = currentInverted ? "改为正位" : "改为逆位";
  }
}

function hideDetectedTarget() {
  const preview = panel?.querySelector("[data-ar-target-preview]");
  if (preview) preview.hidden = true;
  const invert = panel?.querySelector('[data-ar-action="invert"]');
  if (invert) invert.hidden = true;
}

function estimateInverted(anchor) {
  const matrix = anchor?.group?.matrix?.elements;
  if (!matrix) return false;
  const angle = Math.atan2(matrix[1], matrix[0]);
  return Math.cos(angle) < 0;
}

function handleTargetFound(index, anchor) {
  if (phase === "board" || phase === "play") {
    boardFound = true;
    arena?.classList.add("ar-board-recognized");
    setLegacyStatus("recognized", "已识别猛犸象底板标识", "底板定位稳定");
    if (phase === "board") {
      title("猛犸象定位成功");
      detail("底板已经定位。下一步按 1—5 号卡槽逐张扫描地形牌。");
      note("同一种地形最多记录两张；重复图案也可以逐槽识别。");
      primary("开始扫描五个卡槽", true);
    }
    return;
  }
  if (phase !== "terrain" || !scanArmed || slots.length >= 5) return;
  currentTarget = index;
  orientationOverridden = false;
  currentInverted = estimateInverted(anchor);
  showDetectedTarget(index);
  title(`识别到${TARGETS[index].name}`);
  detail(`确认它属于我方第 ${slots.length + 1} 个卡槽，并核对正位或逆位。`);
  note("若方向判断不对，可先点“改为正位／逆位”再记录。");
  primary(`记录第 ${slots.length + 1} 槽`, true);
}

function handleTargetLost() {
  if (phase === "board" || phase === "play") {
    boardFound = false;
    if (phase === "board") {
      title("重新对准底板下方的猛犸象");
      detail("猛犸象图标已离开画面；重新识别后才能继续扫描五张地形牌。");
      primary("等待识别猛犸象", false);
    }
    if (phase === "play") {
      setLegacyStatus("scanning", "请重新对准猛犸象", "游戏保留当前进度，重新入镜后继续定位");
    }
    return;
  }
  if (phase === "terrain" && !scanArmed) {
    scanArmed = true;
    currentTarget = null;
    hideDetectedTarget();
    title(`扫描我方第 ${slots.length + 1} 个卡槽`);
    detail("把镜头移到下一张地形牌；只需让当前卡槽的标识清晰入镜。");
    primary("等待识别", false);
  }
}

async function destroyMindAR() {
  if (!mindar) return;
  try {
    mindar.video?.srcObject?.getTracks?.().forEach((track) => track.stop());
  } catch {}
  try {
    mindar.stop();
  } catch {}
  try {
    mindar.renderer?.dispose?.();
  } catch {}
  mindar = null;
  host?.replaceChildren();
}

async function startDataset(kind) {
  await destroyMindAR();
  if (!running || !host) return;
  const isTerrain = kind === "terrain";
  phase = kind;
  boardFound = false;
  currentTarget = null;
  scanArmed = true;
  hideDetectedTarget();
  const src = isTerrain ? "../ar-assets/terrains-4.mind" : "../ar-assets/mammoth-board.mind";
  mindar = new MindARThree({
    container: host,
    imageTargetSrc: src,
    maxTrack: isTerrain ? 4 : 1,
    uiLoading: "no",
    uiScanning: "no",
    uiError: "no",
    warmupTolerance: 4,
    missTolerance: 6,
  });
  const count = isTerrain ? 4 : 1;
  for (let index = 0; index < count; index += 1) {
    const anchor = mindar.addAnchor(index);
    anchor.onTargetFound = () => handleTargetFound(index, anchor);
    anchor.onTargetLost = handleTargetLost;
    anchor.onTargetUpdate = () => {
      if (phase === "terrain" && currentTarget === index && !orientationOverridden) {
        currentInverted = estimateInverted(anchor);
        showDetectedTarget(index);
      }
    };
  }
  if (isTerrain) {
    arena.classList.remove("ar-board-recognized");
    title(`扫描我方第 ${slots.length + 1} 个卡槽`);
    detail("从左到右逐槽扫描。把当前卡槽内的地形标识清晰放进取景框。");
    note("为了支持重复地形，每记录一槽后先把当前标识移出镜头，再扫描下一槽。");
    primary("等待识别", false);
  } else if (kind === "play") {
    title("重新对准猛犸象");
    detail("识别成功后，当前三维游戏会叠加在相机画面上继续运行。");
    note("五张我方地形已经写入本局；无需再次扫描。");
    primary("地形已应用", false);
  } else {
    title("对准底板下方的猛犸象");
    detail("底板背景只负责视觉；请让毛茸茸的猛犸象图标完整、清晰地进入画面。");
    note("识别成功后才会进入五个地形卡槽的扫描。");
    primary("等待识别猛犸象", false);
  }
  setLegacyStatus("scanning", isTerrain ? "正在识别地形卡" : "正在识别猛犸象", "请保持图案完整、光线均匀");
  await mindar.start();
  arena.classList.add("ar-camera-running");
}

function confirmCurrentSlot() {
  if (currentTarget === null) return;
  const target = TARGETS[currentTarget];
  const sameCount = slots.filter((item) => item.terrain === target.terrain).length;
  if (sameCount >= 2) {
    note(`${target.name}已经有两张；单方同一种地形不能超过两张。`, true);
    return;
  }
  slots.push({ terrain: target.terrain, inverted: currentInverted });
  saveSlots();
  renderProgress();
  if (slots.length === 5) {
    finishTerrainScan();
    return;
  }
  scanArmed = false;
  currentTarget = null;
  hideDetectedTarget();
  title(`第 ${slots.length} 槽已记录`);
  detail(`请先把刚才的标识移出镜头，再扫描第 ${slots.length + 1} 个卡槽。`);
  note("标识移出镜头后，下一槽会自动进入待识别状态。");
  primary("移出当前标识", false);
}

function finishTerrainScan() {
  phase = "complete";
  currentTarget = null;
  hideDetectedTarget();
  title("我方五张地形已完成");
  detail("地形与正逆位已经写入当前对局；对方地形仍由游戏生成。");
  note("正在重新启用底部猛犸象定位，之后可以直接继续掷骰和安放动物。");
  primary("地形已应用", false);
  window.dispatchEvent(
    new CustomEvent("paleo21:ar-terrain-ready", { detail: { slots: getPlayerSlots() } }),
  );
  window.setTimeout(() => {
    if (running) startDataset("play").catch(showError);
  }, 450);
}

function previousSlot() {
  if (phase !== "terrain" || slots.length === 0) return;
  slots.pop();
  saveSlots();
  currentTarget = null;
  scanArmed = true;
  hideDetectedTarget();
  renderProgress();
  title(`重新扫描我方第 ${slots.length + 1} 个卡槽`);
  detail("上一条记录已撤回，请重新对准该卡槽内的地形标识。");
  note("同一种地形仍然最多两张。");
  primary("等待识别", false);
}

function toggleInversion() {
  if (currentTarget === null) return;
  orientationOverridden = true;
  currentInverted = !currentInverted;
  showDetectedTarget(currentTarget);
}

function handlePanelClick(event) {
  const button = event.target.closest("[data-ar-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.arAction;
  if (action === "previous") previousSlot();
  if (action === "invert") toggleInversion();
  if (action !== "primary") return;
  if (phase === "board" && boardFound) {
    slots = [];
    saveSlots();
    renderProgress();
    startDataset("terrain").catch(showError);
  } else if (phase === "terrain") {
    confirmCurrentSlot();
  }
}

function showError(error) {
  console.warn("Paleo21 MindAR unavailable", error);
  destroyMindAR().catch(() => {});
  if (arena) arena.classList.remove("ar-camera-running", "ar-board-recognized");
  setLegacyStatus("error", "AR 相机或识别启动失败", "请确认已允许相机权限，并通过本地地址或 HTTPS 打开");
  title("无法启动 AR 识别");
  detail("请允许浏览器访问后置相机，然后关闭并重新开启 AR 模式。");
  note(error?.message || "相机、识别文件或浏览器权限不可用。", true);
  primary("请重新开启相机", false);
  syncCameraButton(false);
  running = false;
}

async function start(targetArena) {
  if (running) {
    await stop();
    return;
  }
  try {
    ensurePanel(targetArena);
    running = true;
    targetArena.classList.add("ar-camera-running");
    syncCameraButton(true);
    await startDataset("board");
  } catch (error) {
    showError(error);
  }
}

async function stop() {
  running = false;
  phase = "idle";
  await destroyMindAR();
  if (arena) {
    arena.classList.remove("ar-camera-running", "ar-board-recognized");
    setLegacyStatus("idle", "尚未识别到底板", "开启相机后，先识别底部猛犸象，再逐槽识别地形");
  }
  syncCameraButton(false);
}

function getPlayerSlots() {
  if (slots.length !== 5) slots = loadSlots();
  return slots.length === 5 ? slots.map((slot) => ({ ...slot })) : null;
}

window.Paleo21MindAR = {
  start,
  stop,
  isRunning: () => running,
  getPlayerSlots,
  clearPlayerSlots() {
    slots = [];
    localStorage.removeItem(STORAGE_KEY);
    renderProgress();
  },
};
