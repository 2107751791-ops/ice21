import { MindARThree } from "./vendor/mindar/mindar-image-three.prod.js";
import * as THREE from "three";

const STORAGE_KEY = "paleo21:ar-player-slots:v2";
const TARGET_SRC = "../ar-assets/board-and-full-cards.mind";
const EXPECTED_SLOT_X = [-2.866, -1.433, 0, 1.433, 2.866];
const TARGETS = [
  { kind: "board", name: "底板" },
  { terrain: "shrub", name: "灌木 A", model: "terrain-shrub" },
  { terrain: "shrub", name: "灌木 B", model: "terrain-shrub" },
  { terrain: "blank", name: "裸地 A", model: "terrain-blank" },
  { terrain: "blank", name: "裸地 B", model: "terrain-blank" },
  { terrain: "snow", name: "雪地 A", model: "terrain-snow" },
  { terrain: "snow", name: "雪地 B", model: "terrain-snow" },
  { terrain: "grass", name: "草地 A", model: "terrain-grass" },
  { terrain: "grass", name: "草地 B", model: "terrain-grass" },
];
const OPPONENT_ROW_Y = 4.45;

let arena = null;
let host = null;
let panel = null;
let focusLayer = null;
let focusFrame = null;
let mindar = null;
let anchors = [];
let running = false;
let boardFound = false;
let foundTargets = new Set();
let assignments = new Map();
let terrainModels = new Map();
let lostTimers = new Map();
let opponentSlots = [];
let opponentModels = [];
let opponentBuild = 0;
let trackingFrame = 0;
let stableSignature = "";
let stableSince = 0;
let publishedSignature = "";
let lastPanelState = "";
let completedScan = false;
let focusPoint = { x: 0.5, y: 0.52 };
let focusAssistUntil = 0;
let slots = loadSlots();

function validSlot(item) {
  return item && TARGETS.some((target) => target.terrain === item.terrain);
}

function loadSlots() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(current) && current.length === 5 && current.every(validSlot)) {
      return current.map((item) => ({ terrain: item.terrain, inverted: !!item.inverted }));
    }
    const legacy = JSON.parse(localStorage.getItem("paleo21:ar-player-slots:v1") || "null");
    if (Array.isArray(legacy) && legacy.length === 5 && legacy.every(validSlot)) {
      return legacy.map((item) => ({ terrain: item.terrain, inverted: !!item.inverted }));
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
    panel.className = "ar-scan-panel ar-scan-panel-simultaneous";
    panel.dataset.arScanPanel = "true";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <span class="ar-scan-kicker">PALEO 21 · 底板坐标识别</span>
      <h2 data-ar-scan-title>准备识别底板与五张地形卡</h2>
      <p data-ar-scan-detail>先让底板下方的猛犸象进入画面；随后会同时识别完整卡面。</p>
      <div class="ar-slot-progress" data-ar-slot-progress aria-label="五张地形卡识别进度"></div>
      <p class="ar-scan-note" data-ar-scan-note>无需逐张确认。模型会固定在各自实体卡上，并跟随卡片移动。</p>
    `;
    emptyState.append(panel);
  }
  focusLayer = emptyState.querySelector("[data-ar-focus-layer]");
  if (!focusLayer) {
    focusLayer = document.createElement("div");
    focusLayer.className = "ar-focus-layer";
    focusLayer.dataset.arFocusLayer = "true";
    focusLayer.setAttribute("aria-label", "点击或拖动辅助识别框到需要识别的地形卡");
    focusLayer.innerHTML = `<div class="ar-focus-frame" data-ar-focus-frame><span>点按或拖到卡面</span></div>`;
    emptyState.append(focusLayer);
    installFocusControls();
  }
  focusFrame = focusLayer.querySelector("[data-ar-focus-frame]");
  positionFocusFrame();
  renderProgress(slots.length === 5 ? slots : Array(5).fill(null));
}

function positionFocusFrame() {
  if (!focusFrame) return;
  focusFrame.style.left = `${focusPoint.x * 100}%`;
  focusFrame.style.top = `${focusPoint.y * 100}%`;
}

function requestCameraFocus() {
  const track = mindar?.video?.srcObject?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
}

function installFocusControls() {
  if (!focusLayer || focusLayer.dataset.controlsReady) return;
  focusLayer.dataset.controlsReady = "true";
  let dragging = false;
  const move = (event) => {
    const rect = focusLayer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    focusPoint = {
      x: Math.max(0.08, Math.min(0.92, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.1, Math.min(0.9, (event.clientY - rect.top) / rect.height)),
    };
    focusAssistUntil = performance.now() + 8000;
    focusLayer.classList.add("is-assisting");
    positionFocusFrame();
  };
  focusLayer.addEventListener("pointerdown", (event) => {
    if (completedScan) return;
    dragging = true;
    focusLayer.setPointerCapture?.(event.pointerId);
    move(event);
    requestCameraFocus();
  });
  focusLayer.addEventListener("pointermove", (event) => {
    if (dragging) move(event);
  });
  const finish = (event) => {
    if (!dragging) return;
    dragging = false;
    focusLayer.releasePointerCapture?.(event.pointerId);
    requestCameraFocus();
  };
  focusLayer.addEventListener("pointerup", finish);
  focusLayer.addEventListener("pointercancel", finish);
}

function updatePanel(title, detail, note) {
  const state = `${title}\n${detail}\n${note}`;
  if (state === lastPanelState) return;
  lastPanelState = state;
  const titleNode = panel?.querySelector("[data-ar-scan-title]");
  const detailNode = panel?.querySelector("[data-ar-scan-detail]");
  const noteNode = panel?.querySelector("[data-ar-scan-note]");
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
  if (noteNode) noteNode.textContent = note;
}

function renderProgress(items) {
  const progress = panel?.querySelector("[data-ar-slot-progress]");
  if (!progress) return;
  progress.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const item = items[index];
    const chip = document.createElement("span");
    chip.className = item ? "is-complete" : "";
    const target = item && TARGETS.find((entry) => entry.terrain === item.terrain);
    chip.textContent = item
      ? `${index + 1} ${target?.name || "地形"}·${item.inverted ? "逆" : "正"}`
      : `${index + 1} 待识别`;
    progress.append(chip);
  }
}

function projectedPoint(group, localPoint) {
  group.updateWorldMatrix(true, false);
  return localPoint.clone().applyMatrix4(group.matrixWorld).project(mindar.camera);
}

function projectedRelativeX(anchor) {
  const board = anchors[0];
  if (!board?.group || !anchor?.group) return null;
  const left = projectedPoint(board.group, new THREE.Vector3(-0.5, 0, 0));
  const right = projectedPoint(board.group, new THREE.Vector3(0.5, 0, 0));
  const center = projectedPoint(board.group, new THREE.Vector3(0, 0, 0));
  const card = projectedPoint(anchor.group, new THREE.Vector3(0, 0, 0));
  const axisX = right.x - left.x;
  const axisY = right.y - left.y;
  const lengthSq = axisX * axisX + axisY * axisY;
  if (lengthSq < 0.000001) return null;
  return ((card.x - center.x) * axisX + (card.y - center.y) * axisY) / lengthSq;
}

function projectedScreenPoint(anchor) {
  if (!anchor?.group) return null;
  const point = projectedPoint(anchor.group, new THREE.Vector3(0, 0, 0));
  return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
}

function refreshFocusAssist(candidates) {
  if (!focusLayer || completedScan) return;
  if (performance.now() > focusAssistUntil) {
    focusLayer.classList.remove("is-assisting", "is-target-found");
    return;
  }
  let nearest = null;
  for (const candidate of candidates) {
    const point = projectedScreenPoint(anchors[candidate.index]);
    if (!point) continue;
    const distance = Math.hypot(point.x - focusPoint.x, point.y - focusPoint.y);
    if (!nearest || distance < nearest.distance) nearest = { ...candidate, distance };
  }
  const inside = nearest && nearest.distance < 0.13;
  focusLayer.classList.toggle("is-target-found", Boolean(inside));
  const label = focusFrame?.querySelector("span");
  if (label) label.textContent = inside ? `已识别 ${TARGETS[nearest.index]?.name || "地形卡"}` : "正在识别框内卡牌";
}

function projectedUp(group) {
  const bottom = projectedPoint(group, new THREE.Vector3(0, -0.35, 0));
  const top = projectedPoint(group, new THREE.Vector3(0, 0.35, 0));
  const vector = new THREE.Vector2(top.x - bottom.x, top.y - bottom.y);
  return vector.lengthSq() > 0.000001 ? vector.normalize() : null;
}

function estimateInverted(anchor) {
  const boardUp = anchors[0]?.group && projectedUp(anchors[0].group);
  const cardUp = anchor?.group && projectedUp(anchor.group);
  if (boardUp && cardUp) return boardUp.dot(cardUp) < 0;
  const matrix = anchor?.group?.matrix?.elements;
  return matrix ? Math.cos(Math.atan2(matrix[1], matrix[0])) < 0 : false;
}

function nearestSlot(relativeX) {
  let best = 0;
  let distance = Infinity;
  EXPECTED_SLOT_X.forEach((expected, index) => {
    const current = Math.abs(relativeX - expected);
    if (current < distance) {
      distance = current;
      best = index;
    }
  });
  return { slot: best, distance };
}

function clusterCandidates(candidates) {
  const clusters = [];
  candidates.sort((a, b) => a.relativeX - b.relativeX);
  for (const candidate of candidates) {
    const previous = clusters.at(-1);
    if (!previous || Math.abs(candidate.relativeX - previous.mean) > 0.38) {
      clusters.push({ mean: candidate.relativeX, items: [candidate] });
      continue;
    }
    previous.items.push(candidate);
    previous.mean = previous.items.reduce((sum, item) => sum + item.relativeX, 0) / previous.items.length;
  }
  return clusters;
}

function chooseCandidate(cluster) {
  const previouslyUsed = cluster.items.find((item) => assignments.has(item.index));
  return previouslyUsed || cluster.items[0];
}

function readLiveSlots(nextAssignments) {
  const result = Array(5).fill(null);
  for (const [targetIndex, slotIndex] of nextAssignments) {
    const target = TARGETS[targetIndex];
    if (!target?.terrain) continue;
    result[slotIndex] = {
      terrain: target.terrain,
      inverted: estimateInverted(anchors[targetIndex]),
    };
  }
  return result;
}

function setSelectedModels(nextAssignments) {
  const selected = new Set(nextAssignments.keys());
  for (const [targetIndex, model] of terrainModels) {
    model.visible = selected.has(targetIndex) && foundTargets.has(targetIndex) && boardFound;
  }
}

function publishWhenStable(liveSlots) {
  if (liveSlots.some((item) => !item)) {
    stableSignature = "";
    stableSince = 0;
    return;
  }
  const signature = JSON.stringify(liveSlots);
  if (signature !== stableSignature) {
    stableSignature = signature;
    stableSince = performance.now();
    return;
  }
  if (performance.now() - stableSince < 420 || signature === publishedSignature) return;
  publishedSignature = signature;
  completedScan = true;
  arena?.classList.add("ar-scan-complete");
  slots = liveSlots.map((item) => ({ ...item }));
  saveSlots();
  window.dispatchEvent(new CustomEvent("paleo21:ar-terrain-ready", {
    detail: { slots: getPlayerSlots(), tracking: "board-relative-full-card" },
  }));
}

function refreshAssignments() {
  if (!running) return;
  if (!boardFound || !foundTargets.has(0)) {
    assignments = new Map();
    setSelectedModels(assignments);
    renderProgress(Array(5).fill(null));
    updatePanel(
      "请先对准底板下方的猛犸象",
      "底板定位后，系统会用它的方向和位置计算五个卡槽。",
      "让底板和五张完整地形卡尽量同时进入画面。",
    );
    setLegacyStatus("scanning", "正在寻找底板", "请对准底板下方的猛犸象定位图");
    trackingFrame = requestAnimationFrame(refreshAssignments);
    return;
  }

  const candidates = [...foundTargets]
    .filter((index) => index > 0)
    .map((index) => ({ index, relativeX: projectedRelativeX(anchors[index]) }))
    .filter((item) => Number.isFinite(item.relativeX));
  refreshFocusAssist(candidates);
  const clusters = clusterCandidates(candidates);
  const nextAssignments = new Map();
  if (clusters.length >= 5) {
    clusters.slice(0, 5).forEach((cluster, slotIndex) => {
      nextAssignments.set(chooseCandidate(cluster).index, slotIndex);
    });
  } else {
    const ranked = clusters.map((cluster) => {
      const nearest = nearestSlot(cluster.mean);
      return { cluster, ...nearest };
    }).sort((a, b) => a.distance - b.distance);
    const usedSlots = new Set();
    for (const item of ranked) {
      if (item.distance > 0.9 || usedSlots.has(item.slot)) continue;
      nextAssignments.set(chooseCandidate(item.cluster).index, item.slot);
      usedSlots.add(item.slot);
    }
  }
  assignments = nextAssignments;
  setSelectedModels(assignments);
  const liveSlots = readLiveSlots(assignments);
  const recognized = liveSlots.filter(Boolean).length;
  renderProgress(liveSlots);
  if (recognized === 5) {
    updatePanel(
      "五张地形卡已定位",
      "完整卡面、正逆位和相对卡槽已自动确认。",
      "每个三维地形已固定到实体卡锚点，移动卡片时会继续跟随。",
    );
    setLegacyStatus("recognized", "五张地形卡已识别", "三维地形正在跟随实体卡位置");
  } else {
    updatePanel(
      `底板已定位 · 地形卡 ${recognized}/5`,
      "把未识别的完整卡面和底板一起放进取景范围。",
      "无需逐张点击；卡片按相对底板的位置自动归入 1—5 号槽。",
    );
    setLegacyStatus("scanning", `正在识别完整卡面 ${recognized}/5`, "请保持底板和卡面清晰可见");
  }
  publishWhenStable(liveSlots);
  trackingFrame = requestAnimationFrame(refreshAssignments);
}

async function addTerrainModel(targetIndex, anchor) {
  const target = TARGETS[targetIndex];
  if (!target?.model) return;
  try {
    const model = await window.Paleo21GLBReplacement?.createScene?.(target.model, THREE);
    if (!model || !running) return;
    const wrapper = new THREE.Group();
    wrapper.name = `${target.terrain}-tracked-terrain`;
    wrapper.rotation.x = Math.PI / 2;
    wrapper.position.z = 0.015;
    wrapper.visible = false;
    wrapper.add(model);
    anchor.group.add(wrapper);
    terrainModels.set(targetIndex, wrapper);
  } catch (error) {
    console.warn(`无法加载 ${target.name} AR 地形模型`, error);
  }
}

function clearOpponentModels() {
  opponentBuild += 1;
  for (const model of opponentModels) model.parent?.remove(model);
  opponentModels = [];
}

async function rebuildOpponentModels() {
  const board = anchors[0]?.group;
  clearOpponentModels();
  if (!running || !board || opponentSlots.length !== 5) return;
  const build = opponentBuild;
  for (let index = 0; index < opponentSlots.length; index += 1) {
    const slot = opponentSlots[index];
    const target = TARGETS.find((entry) => entry.terrain === slot?.terrain);
    if (!target?.model) continue;
    try {
      const model = await window.Paleo21GLBReplacement?.createScene?.(target.model, THREE);
      if (!model || !running || build !== opponentBuild) continue;
      const wrapper = new THREE.Group();
      wrapper.name = `opponent-${slot.terrain}-terrain-${index + 1}`;
      wrapper.position.set(EXPECTED_SLOT_X[index], OPPONENT_ROW_Y, 0.018);
      wrapper.rotation.x = Math.PI / 2;
      wrapper.rotation.z = Math.PI;
      wrapper.scale.setScalar(0.9);
      wrapper.add(model);
      board.add(wrapper);
      opponentModels.push(wrapper);
    } catch (error) {
      console.warn(`无法加载对手第 ${index + 1} 格地形`, error);
    }
  }
}

function handleFound(index) {
  const pending = lostTimers.get(index);
  if (pending) clearTimeout(pending);
  lostTimers.delete(index);
  foundTargets.add(index);
  if (index === 0) {
    boardFound = true;
    arena?.classList.add("ar-board-recognized");
  }
}

function handleLost(index) {
  const previous = lostTimers.get(index);
  if (previous) clearTimeout(previous);
  const delay = index === 0 ? 1400 : 950;
  lostTimers.set(index, setTimeout(() => {
    lostTimers.delete(index);
    foundTargets.delete(index);
    if (index === 0) {
      boardFound = false;
      arena?.classList.remove("ar-board-recognized");
    }
    const model = terrainModels.get(index);
    if (model) model.visible = false;
  }, delay));
}

async function destroyMindAR() {
  cancelAnimationFrame(trackingFrame);
  trackingFrame = 0;
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
  for (const timer of lostTimers.values()) clearTimeout(timer);
  lostTimers = new Map();
  clearOpponentModels();
  anchors = [];
  foundTargets = new Set();
  assignments = new Map();
  terrainModels = new Map();
  host?.replaceChildren();
}

function showError(error) {
  console.warn("Paleo21 MindAR unavailable", error);
  destroyMindAR().catch(() => {});
  arena?.classList.remove("ar-camera-running", "ar-board-recognized", "ar-scan-complete");
  setLegacyStatus("error", "AR 相机或识别启动失败", "请确认已允许相机权限，并通过 HTTPS 或本地地址打开");
  updatePanel(
    "无法启动 AR 识别",
    "请允许浏览器访问后置相机，然后关闭并重新开启 AR 模式。",
    error?.message || "相机、识别文件或浏览器权限不可用。",
  );
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
    boardFound = false;
    foundTargets = new Set();
    assignments = new Map();
    stableSignature = "";
    stableSince = 0;
    completedScan = false;
    focusAssistUntil = 0;
    targetArena.classList.remove("ar-scan-complete");
    targetArena.classList.add("ar-camera-running");
    syncCameraButton(true);
    updatePanel(
      "正在启动底板与完整卡面识别",
      "请让底板下方的猛犸象和五张地形卡进入画面。",
      "系统会同时识别，不需要逐张确认。",
    );
    mindar = new MindARThree({
      container: host,
      imageTargetSrc: TARGET_SRC,
      maxTrack: TARGETS.length,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no",
      warmupTolerance: 2,
      missTolerance: 16,
      filterMinCF: 0.0004,
      filterBeta: 1200,
    });
    mindar.scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7890, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-1.5, 2.5, 3);
    mindar.scene.add(keyLight);
    anchors = TARGETS.map((target, index) => {
      const anchor = mindar.addAnchor(index);
      anchor.onTargetFound = () => handleFound(index);
      anchor.onTargetLost = () => handleLost(index);
      if (target.terrain) addTerrainModel(index, anchor);
      return anchor;
    });
    rebuildOpponentModels();
    setLegacyStatus("scanning", "正在识别底板", "对准底板下方猛犸象及五张完整卡面");
    await mindar.start();
    arena.classList.add("ar-camera-running");
    trackingFrame = requestAnimationFrame(refreshAssignments);
  } catch (error) {
    showError(error);
  }
}

async function stop() {
  running = false;
  boardFound = false;
  await destroyMindAR();
  if (arena) {
    arena.classList.remove("ar-camera-running", "ar-board-recognized", "ar-scan-complete");
    setLegacyStatus("idle", "尚未识别到底板", "开启相机后，同时识别底板与五张完整地形卡");
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
    publishedSignature = "";
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("paleo21:ar-player-slots:v1");
    renderProgress(Array(5).fill(null));
  },
};

window.addEventListener("paleo21:online-peer-terrain", (event) => {
  const next = event.detail?.slots;
  opponentSlots = Array.isArray(next) && next.length === 5
    ? next.map((slot) => ({ terrain: slot.terrain, inverted: !!slot.inverted }))
    : [];
  rebuildOpponentModels();
});
