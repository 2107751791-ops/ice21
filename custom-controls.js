/** 冰河史前21点旧版页面的外置界面调整，不修改压缩后的游戏规则代码。 */
(function setupPaleoCustomControls() {
  "use strict";

  const animalProfiles = window.Paleo21AnimalCards?.load?.() || {};
  let arCameraStream = null;
  let paleoSidebarUserChoice = false;
  const tagDescriptions = {
    "食肉": "以其他动物为主要食物，部分技能可以捕食场上目标。",
    "食草": "主要取食草本、枝叶等植物资源。",
    "捕食者": "能够主动捕食符合条件的动物，并改变双方分数。",
    "食腐者": "能够利用场上的动物遗骸获得分数。",
    "不可捕食": "不能成为捕食技能的目标。",
    "可捕食": "可以成为捕食技能的目标。",
    "大型动物": "体型庞大，拥有更强的冲撞或抗捕食能力。",
    "群体召集": "可以召集同类副本，共同承担捕食损失。",
    "位移控制": "技能能够推动或驱赶场上的其他动物。",
    "钻洞免疫": "钻洞后免疫捕食、推动和驱赶效果。",
  };
  const scienceFacts = {
    "洞狮": [["生活环境", "寒冷、开阔的草原与疏林地带。"], ["主要食物", "大型有蹄类，也会捕猎体型较小的食草动物。"], ["身体特征", "体格粗壮，四肢有力，适合短距离伏击。"]],
    "洞鬣狗": [["生活环境", "欧亚大陆的草原、洞穴及岩棚附近。"], ["主要食物", "合作捕猎，也会啃食大型动物遗骸。"], ["身体特征", "颌骨强健，臼齿适合碾碎骨骼。"]],
    "猛犸象": [["生活环境", "寒冷干燥的猛犸草原。"], ["主要食物", "草本植物、莎草和少量灌木枝叶。"], ["身体特征", "长毛、厚脂肪与较小耳朵帮助保存体温。"], ["群体生活", "形成社会群体，并长距离迁徙寻找食物。"]],
    "草原野牛": [["生活环境", "欧亚大陆与北美的开阔草原。"], ["主要食物", "低矮草本和积雪下的植物。"], ["身体特征", "肩部高大、头骨宽阔，适合推开积雪。"], ["群体生活", "聚集成群能够降低个体被捕食的风险。"]],
    "披毛犀": [["生活环境", "寒冷、干燥而多风的草原。"], ["主要食物", "贴近地面的草本植物。"], ["身体特征", "长毛、厚皮和巨大前角适应严寒环境。"]],
    "东北鼠兔": [["生活环境", "岩隙、坡地和洞穴附近。"], ["主要食物", "草本植物、嫩叶和储藏的干草。"], ["储食行为", "收集并晾晒植物，形成过冬用的草堆。"], ["生态作用", "既影响高寒植被，也是多种捕食者的食物。"]],
  };

  function showTagTooltip(badge) {
    let tooltip = document.querySelector("[data-animal-tag-tooltip]");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "animal-tag-tooltip";
      tooltip.dataset.animalTagTooltip = "true";
      tooltip.setAttribute("role", "tooltip");
      document.body.append(tooltip);
    }
    tooltip.textContent = `${badge.textContent}：${badge.dataset.tagHelp}`;
    tooltip.hidden = false;
    const rect = badge.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, rect.left + rect.width / 2 - tooltipRect.width / 2))}px`;
    tooltip.style.top = `${Math.max(8, rect.top - tooltipRect.height - 8)}px`;
  }

  function hideTagTooltip() {
    const tooltip = document.querySelector("[data-animal-tag-tooltip]");
    if (tooltip) tooltip.hidden = true;
  }

  function setArBoardStatus(arena, state, message) {
    const status = arena?.querySelector("[data-ar-board-status]");
    if (!status) return;
    status.dataset.state = state;
    status.querySelector("b").textContent = state === "ready" ? "可以开始游戏" : state === "recognized" ? "已识别到底板" : state === "scanning" ? "正在识别底板" : state === "error" ? "相机或识别出错" : "尚未识别到底板";
    status.querySelector("span").textContent = message;
  }

  function syncArCameraUi(active) {
    document.querySelectorAll("[data-ar-camera-button]").forEach((button) => {
      button.textContent = active ? "关闭相机" : "开启相机";
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-ar-camera-video]").forEach((video) => {
      video.srcObject = active ? arCameraStream : null;
    });
  }

  function stopArCamera() {
    if (window.Paleo21MindAR?.isRunning?.()) {
      window.Paleo21MindAR.stop();
      return;
    }
    arCameraStream?.getTracks().forEach((track) => track.stop());
    arCameraStream = null;
    syncArCameraUi(false);
    document.querySelectorAll(".combined-arena").forEach((arena) => {
      arena.classList.remove("ar-camera-running");
      if (arena.classList.contains("ar-board-recognized")) setArBoardStatus(arena, "recognized", "底板定位稳定，可以放置动物模型");
      else setArBoardStatus(arena, "idle", "开启相机后，将在这里显示底板识别结果");
    });
  }

  async function startArCamera(arena) {
    if (window.Paleo21MindAR?.start) {
      await window.Paleo21MindAR.start(arena);
      return;
    }
    const button = arena.querySelector("[data-ar-camera-button]");
    if (!navigator.mediaDevices?.getUserMedia) {
      setArBoardStatus(arena, "error", "当前浏览器不支持相机访问");
      return;
    }
    button.disabled = true;
    button.textContent = "正在开启…";
    setArBoardStatus(arena, "scanning", "正在请求相机权限");
    try {
      arCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      arena.classList.add("ar-camera-running");
      syncArCameraUi(true);
      if (arena.classList.contains("ar-board-recognized")) setArBoardStatus(arena, "recognized", "底板定位稳定，可以放置动物模型");
      else setArBoardStatus(arena, "scanning", "相机已开启，请将完整底板放入画面");
      arena.querySelector("[data-ar-camera-video]")?.play?.().catch(() => {});
    } catch (error) {
      arCameraStream?.getTracks().forEach((track) => track.stop());
      arCameraStream = null;
      syncArCameraUi(false);
      setArBoardStatus(arena, "error", error?.name === "NotAllowedError" ? "相机权限未开启，请允许访问后重试" : "相机开启失败，请检查设备后重试");
    } finally {
      button.disabled = false;
    }
  }

  function setArSimulation(enabled) {
    document.body.classList.toggle("ar-simulation-active", enabled);
    if (!enabled) stopArCamera();
    document.querySelectorAll(".ar-mode-switch").forEach((button) => {
      button.setAttribute("aria-checked", String(enabled));
      button.firstChild.textContent = enabled ? "AR 模式已开" : "AR 模式";
    });
  }

  function resetArReadyPanel(arena) {
    const panel = arena?.querySelector("[data-ar-ready-panel]");
    if (!panel) return;
    panel.dataset.step = "confirm";
    panel.querySelector("b").textContent = "底板识别成功";
    panel.querySelector("span").textContent = "确认三维场景稳定后继续，游戏进度不会重置。";
    panel.querySelector("button").textContent = "准备好了";
  }

  function advanceArReadyFlow(arena) {
    const panel = arena.querySelector("[data-ar-ready-panel]");
    if (!panel) return;
    const button = panel.querySelector("button");
    if (panel.dataset.step === "confirm") {
      panel.dataset.step = "roll";
      panel.querySelector("b").textContent = "场景已经就位";
      panel.querySelector("span").textContent = "现在可以沿用普通模式的骰子、分数、动物与技能开始对局。";
      button.textContent = "开始投骰子";
      setArBoardStatus(arena, "ready", "场景已就位，点击“开始投骰子”继续当前对局");
      return;
    }
    const rollButton = arena.querySelector(".scene-die-layer button:not(:disabled), .mobile-dice-button:not(:disabled)");
    if (rollButton) {
      rollButton.click();
      panel.dataset.step = "started";
      panel.querySelector("b").textContent = "已经开始投骰子";
      panel.querySelector("span").textContent = "请继续在同一套三维场景中选择动物并完成安放。";
      button.textContent = "继续游戏";
      setArBoardStatus(arena, "ready", "骰子已经投出，请选择动物并继续当前回合");
    } else {
      panel.dataset.step = "started";
      panel.querySelector("b").textContent = "当前步骤已经开始";
      panel.querySelector("span").textContent = "请按画面中的当前行动提示继续，不需要重复投骰。";
      setArBoardStatus(arena, "ready", "请按照画面中的当前行动提示继续");
    }
  }

  function configureSceneToolbar(toolbar) {
    if (toolbar.dataset.sceneControlsReady === "true") return;
    toolbar.dataset.sceneControlsReady = "true";
    toolbar.dataset.floatingStatic = "true";
    toolbar.removeAttribute("data-floating-id");
  }

  function setArRecognitionState(arena, recognized) {
    arena.classList.toggle("ar-board-recognized", recognized);
    if (!recognized) resetArReadyPanel(arena);
    setArBoardStatus(
      arena,
      recognized ? "recognized" : arCameraStream ? "scanning" : "idle",
      recognized ? "底板与地形已识别；骰子、分数、动物和技能继续使用当前三维游戏部件" : arCameraStream ? "尚未识别，请保持底板完整、光线充足" : "开启相机后，将在这里显示底板识别结果",
    );
  }

  function fitChoiceDialog(dialog) {
    const arena = document.querySelector(".combined-arena");
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    const horizontalGap = window.innerWidth <= 520 ? 14 : 28;
    const verticalGap = window.innerHeight <= 620 ? 8 : 12;
    const visibleTop = Math.max(8, rect.top);
    const visibleBottom = Math.min(window.innerHeight - 8, rect.bottom);
    const compactMobile = window.innerHeight <= 620;
    const minimumHeight = compactMobile ? 210 : 260;
    const visibleHeight = Math.max(minimumHeight, visibleBottom - visibleTop);
    const maxWidth = Math.max(300, Math.min(rect.width - horizontalGap, window.innerWidth - 16));
    const maxHeight = Math.max(minimumHeight, Math.min(rect.height - verticalGap, visibleHeight - 8, window.innerHeight - 8));
    const widthByWindow = (maxWidth - (window.innerWidth <= 520 ? 28 : 58)) / 2;
    const widthByHeight = (maxHeight - (compactMobile ? 74 : 132)) / 1.46;
    const cardWidth = Math.max(compactMobile ? 116 : 150, Math.min(330, widthByWindow, widthByHeight));
    dialog.style.setProperty("--choice-window-max-width", `${maxWidth}px`);
    dialog.style.setProperty("--choice-window-max-height", `${maxHeight}px`);
    const previousCardWidth = dialog.style.getPropertyValue("--choice-card-width");
    dialog.style.setProperty("--choice-card-width", `${cardWidth}px`);
    dialog.style.setProperty("--choice-window-left", `${compactMobile ? window.innerWidth / 2 : rect.left + rect.width / 2}px`);
    dialog.style.setProperty("--choice-window-top", `${compactMobile ? window.innerHeight / 2 : visibleTop + visibleHeight / 2}px`);
    if (previousCardWidth !== `${cardWidth}px`) {
      window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
  }

  function positionOpponentToast(backdrop) {
    const arena = document.querySelector(".combined-arena");
    const toolbar = arena?.querySelector(".scene-toolbar");
    if (!arena || !toolbar) return;
    const arenaRect = arena.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const width = Math.min(280, Math.max(205, arenaRect.width * .32));
    backdrop.style.setProperty("--opponent-toast-top", `${Math.max(arenaRect.top + 8, Math.min(arenaRect.bottom - 84, toolbarRect.bottom + 8))}px`);
    backdrop.style.setProperty("--opponent-toast-right", `${Math.max(8, window.innerWidth - arenaRect.right + 12)}px`);
    backdrop.style.setProperty("--opponent-toast-width", `${width}px`);
  }

  function syncChoiceToggle(dialog) {
    let toggle = document.querySelector("[data-choice-toggle]");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "choice-visibility-toggle";
      toggle.dataset.choiceToggle = "true";
      toggle.addEventListener("click", () => {
        document.querySelector(".compact-choice .choice-modal-heading button")?.click();
      });
      document.body.append(toggle);
    }

    const minimized = dialog.classList.contains("minimized");
    const left = Number.parseFloat(dialog.style.getPropertyValue("--choice-window-left")) || window.innerWidth / 2;
    const top = Number.parseFloat(dialog.style.getPropertyValue("--choice-window-top")) || window.innerHeight / 2;
    const dialogRect = dialog.getBoundingClientRect();
    if (dialogRect.width > 0 && dialogRect.height > 0) {
      dialog.dataset.choiceMeasuredWidth = String(dialogRect.width);
      dialog.dataset.choiceMeasuredHeight = String(dialogRect.height);
    }
    const width = dialogRect.width || Number.parseFloat(dialog.dataset.choiceMeasuredWidth) || Math.min(620, window.innerWidth - 16);
    const height = dialogRect.height || Number.parseFloat(dialog.dataset.choiceMeasuredHeight) || Math.min(620, window.innerHeight - 16);
    toggle.style.left = `${Math.max(8, Math.min(window.innerWidth - 132, left + width / 2 - 124))}px`;
    toggle.style.top = `${Math.max(8, Math.min(window.innerHeight - 42, top - height / 2 + 12))}px`;
    toggle.textContent = minimized ? "打开动物卡片" : "隐藏动物卡片";
    toggle.setAttribute("aria-expanded", String(!minimized));
    toggle.setAttribute("aria-label", minimized ? "打开骰子动物二选一" : "隐藏骰子动物二选一");
  }

  function enhanceAnimalCard(card) {
    if (card.dataset.animalCardEnhanced === "true") return;
    const animalName = Object.keys(animalProfiles).find((name) => card.textContent.includes(name));
    if (!animalName) return;
    card.dataset.animalCardEnhanced = "true";
    card.dataset.animalName = animalName;
    const profile = animalProfiles[animalName];

    const front = document.createElement("div");
    front.className = "animal-card-front";
    while (card.firstChild) front.append(card.firstChild);

    const [uprightRule, invertedRule] = front.querySelectorAll(".choice-card-rule");
    const applyRuleText = (rule, title, description) => {
      if (!rule) return;
      const titleNode = rule.querySelector("p b");
      const descriptionNode = rule.querySelector("p span");
      if (titleNode) titleNode.textContent = title;
      if (descriptionNode) descriptionNode.textContent = description;
    };
    applyRuleText(uprightRule, profile.uprightName, profile.uprightSkill);
    applyRuleText(invertedRule, profile.invertedName, profile.invertedSkill);
    front.querySelectorAll(".choice-card-rule p span").forEach((description) => {
      description.textContent = description.textContent
        .replace(/；.*/u, "。")
        .replace(/，并且?/gu, "，")
        .replace(/当前|本回合/gu, "")
        .trim();
    });

    const details = document.createElement("div");
    details.className = "animal-card-details";
    const tags = document.createElement("div");
    tags.className = "animal-attribute-tags";
    profile.tags.forEach((tag) => {
      const badge = document.createElement("span");
      badge.textContent = tag;
      const description = tagDescriptions[tag] || "这项属性会影响动物可以使用或承受的技能。";
      badge.dataset.tagHelp = description;
      badge.title = description;
      badge.tabIndex = 0;
      badge.setAttribute("aria-label", `${tag}：${description}`);
      badge.addEventListener("mouseenter", () => showTagTooltip(badge));
      badge.addEventListener("mouseleave", hideTagTooltip);
      badge.addEventListener("focus", () => showTagTooltip(badge));
      badge.addEventListener("blur", hideTagTooltip);
      tags.append(badge);
    });
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = "animal-card-flip";
    flip.textContent = "翻转 · 动物科普";
    flip.setAttribute("aria-pressed", "false");
    details.append(tags);

    const science = document.createElement("section");
    science.className = "animal-science-back";
    science.setAttribute("aria-label", `${animalName}动物科普`);
    const scienceLabel = document.createElement("small");
    scienceLabel.textContent = "真实动物科普";
    const scienceTitle = document.createElement("h3");
    scienceTitle.textContent = animalName;
    const scienceArt = document.createElement("div");
    scienceArt.className = "animal-science-art";
    if (profile.backImage) {
      const image = document.createElement("img");
      image.src = profile.backImage;
      image.alt = `${animalName}真实动物图片`;
      scienceArt.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "可在动物卡片编辑器上传图片";
      scienceArt.append(placeholder);
    }
    const scienceLayout = document.createElement("div");
    scienceLayout.className = "animal-science-tab-layout";
    const scienceTabs = document.createElement("div");
    scienceTabs.className = "animal-science-tabs";
    scienceTabs.setAttribute("role", "tablist");
    scienceTabs.setAttribute("aria-label", `${animalName}科普栏目`);
    const scienceSwitch = document.createElement("div");
    scienceSwitch.className = "animal-science-switch";
    const sciencePanels = document.createElement("div");
    sciencePanels.className = "animal-science-panels";
    const facts = scienceFacts[animalName] || [["动物概况", profile.science]];
    facts.forEach(([label, text], index) => {
      const tab = document.createElement("span");
      tab.className = "animal-science-tab";
      tab.textContent = label;
      tab.id = `science-tab-${animalName}-${index}`;
      tab.setAttribute("role", "tab");
      tab.tabIndex = 0;
      tab.setAttribute("aria-selected", String(index === 0));
      tab.setAttribute("aria-controls", `science-panel-${animalName}-${index}`);
      const fact = document.createElement("article");
      fact.id = `science-panel-${animalName}-${index}`;
      fact.className = "animal-science-panel";
      fact.setAttribute("role", "tabpanel");
      fact.setAttribute("aria-labelledby", tab.id);
      fact.hidden = index !== 0;
      const factLabel = document.createElement("b");
      factLabel.textContent = label;
      const factText = document.createElement("p");
      factText.textContent = text;
      fact.append(factLabel, factText);
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        scienceTabs.querySelectorAll("[role=tab]").forEach((item) => item.setAttribute("aria-selected", "false"));
        sciencePanels.querySelectorAll("[role=tabpanel]").forEach((panel) => { panel.hidden = true; });
        tab.setAttribute("aria-selected", "true");
        fact.hidden = false;
      });
      tab.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          tab.click();
        }
      });
      scienceTabs.append(tab);
      sciencePanels.append(fact);
    });
    scienceSwitch.append(scienceTabs, sciencePanels);
    scienceLayout.append(scienceArt, scienceSwitch);
    science.append(scienceLabel, scienceTitle, scienceLayout);
    const setFlipped = (flipped) => {
      card.classList.toggle("is-science-flipped", flipped);
      flip.setAttribute("aria-pressed", String(flipped));
      flip.textContent = flipped ? "返回 · 玩法面" : "翻转 · 动物科普";
    };
    flip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFlipped(!card.classList.contains("is-science-flipped"));
    });
    front.append(details);
    card.append(front, science, flip);
  }

  function ensureAnimalRulesPanel() {
    let panel = document.querySelector("[data-animal-rules-panel]");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "animal-rules-panel";
    panel.dataset.animalRulesPanel = "true";
    panel.dataset.componentId = "game-paleo21.section.animal-rules";
    panel.dataset.componentName = "六种动物，两面技能";
    panel.hidden = true;
    panel.setAttribute("aria-label", "六种动物，两面技能");

    const heading = document.createElement("header");
    const headingCopy = document.createElement("div");
    const eyebrow = document.createElement("small");
    eyebrow.textContent = "动物技能表";
    const title = document.createElement("h2");
    title.textContent = "六种动物，两面技能";
    const description = document.createElement("p");
    description.textContent = "正位与逆位技能均为游戏规则；分值不代表真实动物的战斗力。";
    headingCopy.append(eyebrow, title, description);
    heading.append(headingCopy);

    const list = document.createElement("div");
    list.className = "animal-rules-list";
    Object.entries(animalProfiles).forEach(([name, profile]) => {
      const article = document.createElement("article");
      const value = document.createElement("span");
      value.textContent = String(profile.value).padStart(2, "0");
      const copy = document.createElement("div");
      const animalName = document.createElement("h3");
      animalName.textContent = name;
      const upright = document.createElement("p");
      const uprightLabel = document.createElement("b");
      uprightLabel.textContent = `正 · ${profile.uprightName}`;
      const uprightText = document.createElement("span");
      uprightText.textContent = profile.uprightSkill;
      upright.append(uprightLabel, uprightText);
      const inverted = document.createElement("p");
      const invertedLabel = document.createElement("b");
      invertedLabel.textContent = `逆 · ${profile.invertedName}`;
      const invertedText = document.createElement("span");
      invertedText.textContent = profile.invertedSkill;
      inverted.append(invertedLabel, invertedText);
      copy.append(animalName, upright, inverted);
      article.append(value, copy);
      list.append(article);
    });
    panel.append(heading, list);
    document.body.append(panel);
    return panel;
  }

  function enhanceHeaderLayout() {
    const topbar = document.querySelector(".topbar");
    document.body.classList.toggle("paleo21-header-ready", Boolean(topbar));
    if (!topbar || topbar.querySelector("[data-paleo21-header-home]")) return;

    const originalPortal = topbar.querySelector(".header-tools .header-portal-link");
    const home = document.createElement("div");
    home.className = "paleo21-header-home";
    home.dataset.paleo21HeaderHome = "true";

    const portal = document.createElement("a");
    portal.className = "paleo21-header-portal";
    portal.href = "../index.html";
    portal.textContent = "← 返回入口";
    portal.setAttribute("aria-label", "返回纪·象游戏入口");

    const logo = document.createElement("div");
    logo.className = "jixiang-global-logo";
    logo.setAttribute("aria-label", "纪·象");
    const mark = document.createElement("span");
    mark.className = "jixiang-global-logo-mark";
    mark.textContent = "纪";
    mark.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "jixiang-global-logo-copy";
    const name = document.createElement("b");
    name.textContent = "纪·象";
    const caption = document.createElement("small");
    caption.textContent = "冰河史前档案";
    copy.append(name, caption);
    logo.append(mark, copy);
    home.append(portal, logo);
    topbar.prepend(home);
  }

  function setPaleoSidebarOpen(open) {
    document.body.classList.toggle("paleo-sidebar-open", open);
    document.body.classList.toggle("paleo-sidebar-closed", !open);
    const toggle = document.querySelector("[data-paleo-sidebar-toggle]");
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "收起资料" : "展开资料";
  }

  function ensurePaleoSidebarDrawer() {
    const sidebar = document.querySelector(".desktop-sidebar");
    let toggle = document.querySelector("[data-paleo-sidebar-toggle]");
    if (!sidebar) {
      if (toggle) toggle.hidden = true;
      return;
    }
    if (!sidebar.id) sidebar.id = "paleo21-info-sidebar";
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "paleo-sidebar-toggle";
      toggle.dataset.paleoSidebarToggle = "true";
      toggle.setAttribute("aria-controls", sidebar.id);
      toggle.addEventListener("click", () => {
        paleoSidebarUserChoice = true;
        setPaleoSidebarOpen(toggle.getAttribute("aria-expanded") !== "true");
      });
      document.body.append(toggle);
    }
    toggle.hidden = false;
    if (!document.body.classList.contains("paleo-sidebar-open") && !document.body.classList.contains("paleo-sidebar-closed")) {
      setPaleoSidebarOpen(window.innerWidth > 1100);
    }
  }

  function configureNonBlockingDialogs() {
    document.querySelectorAll(".initiative-backdrop").forEach((backdrop) => {
      backdrop.classList.add("nonblocking-initiative-toast");
      backdrop.setAttribute("aria-modal", "false");
      const button = backdrop.querySelector(".initiative-modal button");
      const modal = backdrop.querySelector(".initiative-modal");
      const title = modal?.querySelector("h2");
      const pending = Boolean(button?.textContent.includes("抽取先手"));
      backdrop.classList.toggle("initiative-pending", pending);
      if (modal) {
        modal.querySelector(":scope > span")?.remove();
        modal.querySelector(":scope > p")?.remove();
        const token = modal.querySelector(".initiative-token");
        if (pending && token) {
          token.classList.add("initiative-die");
          const face = token.querySelector("b");
          if (face) face.textContent = "⚄";
          token.querySelector("small")?.remove();
        } else token?.remove();
      }
      if (title) {
        if (pending) title.textContent = "掷骰决定先手";
        else if ((title.textContent.includes("你") || title.textContent.includes("我")) && !title.textContent.includes("对手")) title.textContent = "你是先手";
        else title.textContent = "对手是先手";
      }
      if (!button) return;
      const initiativePhase = pending ? "pending" : "result";
      if (button.disabled) {
        delete button.dataset.autoInitiative;
        return;
      }
      if (button.dataset.autoInitiative === initiativePhase) return;
      button.dataset.autoInitiative = initiativePhase;
      if (!pending) button.textContent = "开始游戏";
      const delay = pending ? 850 : 420;
      window.setTimeout(() => {
        if (button.isConnected && !button.disabled) button.click();
      }, delay);
    });

    document.querySelectorAll(".skill-backdrop").forEach((backdrop) => {
      backdrop.classList.add("nonblocking-skill-panel");
      backdrop.setAttribute("aria-modal", "false");
    });

    document.querySelectorAll(".victory-backdrop").forEach((backdrop) => {
      backdrop.classList.add("nonblocking-victory-panel");
      backdrop.setAttribute("aria-modal", "false");
    });

    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      if (
        backdrop.classList.contains("help-backdrop") ||
        backdrop.classList.contains("initiative-backdrop") ||
        backdrop.classList.contains("skill-backdrop") ||
        backdrop.classList.contains("victory-backdrop") ||
        backdrop.classList.contains("opponent-action-toast")
      ) return;
      const modal = backdrop.querySelector(".event-modal");
      if (!modal) return;
      backdrop.classList.add("nonblocking-event-toast");
      backdrop.setAttribute("aria-modal", "false");
      backdrop.setAttribute("role", "status");
      backdrop.setAttribute("aria-live", "polite");
      const close = modal.querySelector(":scope > button");
      if (!close || close.dataset.autoCloseNotice === "true") return;
      close.dataset.autoCloseNotice = "true";
      window.setTimeout(() => {
        if (close.isConnected && !close.disabled) close.click();
      }, modal.classList.contains("combat-modal") ? 4800 : 3600);
    });
  }

  function syncAnimalRulesPanel(open) {
    const panel = ensureAnimalRulesPanel();
    panel.hidden = !open;
    document.querySelectorAll("[data-animal-rules-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "收起动物技能" : "六种动物 · 两面技能";
    });
  }

  function configureGameUi() {
    enhanceHeaderLayout();
    document.body.classList.remove("paleo-sidebar-open", "paleo-sidebar-closed");
    document.querySelectorAll("[data-paleo-sidebar-toggle], [data-animal-rules-toggle], .animal-rules-panel").forEach((element) => element.remove());
    const brandEyebrow = document.querySelector(".brand-lockup small");
    if (brandEyebrow) brandEyebrow.textContent = "纪·象游戏";
    document.querySelectorAll(".turn-guide-card h2").forEach((title) => {
      if (title.textContent.includes("NPC")) title.textContent = title.textContent.replace("NPC", "对手");
    });
    const welcomeSeal = document.querySelector(".field-seal");
    if (welcomeSeal) {
      const sealTitle = welcomeSeal.querySelector("b");
      const sealCaption = welcomeSeal.querySelector("span");
      if (sealTitle) sealTitle.textContent = "纪·象";
      if (sealCaption) sealCaption.textContent = "冰原档案";
    }
    document.querySelectorAll(".header-tools").forEach((headerTools) => {
      if (!headerTools.querySelector(".ar-mode-switch")) {
        const arSwitch = document.createElement("button");
        arSwitch.type = "button";
        arSwitch.className = "ar-mode-switch";
        arSwitch.setAttribute("role", "switch");
        const arActive = document.body.classList.contains("ar-simulation-active");
        arSwitch.setAttribute("aria-checked", String(arActive));
        arSwitch.append(document.createTextNode(arActive ? "AR 模式已开" : "AR 模式"));
        arSwitch.addEventListener("pointerup", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          setArSimulation(arSwitch.getAttribute("aria-checked") !== "true");
        });
        headerTools.append(arSwitch);
      }
    });

    document.querySelectorAll(".combined-arena").forEach((arena, index) => {
      if (!arena.dataset.floatingId) arena.dataset.floatingId = `paleo21-arena-${index + 1}`;
      if (arena.querySelector(".ar-empty-simulation")) return;
      const emptyState = document.createElement("div");
      emptyState.className = "ar-empty-simulation";
      const video = document.createElement("video");
      video.dataset.arCameraVideo = "true";
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("aria-label", "AR 相机画面");
      const status = document.createElement("div");
      status.className = "ar-board-status";
      status.dataset.arBoardStatus = "true";
      status.dataset.state = "idle";
      const statusDot = document.createElement("i");
      statusDot.setAttribute("aria-hidden", "true");
      const statusCopy = document.createElement("div");
      const statusTitle = document.createElement("b");
      statusTitle.textContent = "尚未识别到底板";
      const statusDetail = document.createElement("span");
      statusDetail.textContent = "开启相机后，将在这里显示底板识别结果";
      statusCopy.append(statusTitle, statusDetail);
      status.append(statusDot, statusCopy);
      const panel = document.createElement("div");
      panel.className = "ar-camera-panel";
      const panelTitle = document.createElement("b");
      panelTitle.textContent = "AR 模式";
      const panelDetail = document.createElement("span");
      panelDetail.textContent = "开启相机，对准完整底板与五张地形卡";
      const cameraButton = document.createElement("button");
      cameraButton.type = "button";
      cameraButton.dataset.arCameraButton = "true";
      cameraButton.setAttribute("aria-pressed", "false");
      cameraButton.textContent = "开启相机";
      cameraButton.addEventListener("click", () => {
        if (arCameraStream) stopArCamera();
        else startArCamera(arena);
      });
      panel.append(panelTitle, panelDetail, cameraButton);
      const readyPanel = document.createElement("div");
      readyPanel.className = "ar-ready-panel";
      readyPanel.dataset.arReadyPanel = "true";
      readyPanel.dataset.step = "confirm";
      const readyTitle = document.createElement("b");
      readyTitle.textContent = "底板识别成功";
      const readyDetail = document.createElement("span");
      readyDetail.textContent = "确认三维场景稳定后继续，游戏进度不会重置。";
      const readyButton = document.createElement("button");
      readyButton.type = "button";
      readyButton.textContent = "准备好了";
      readyButton.addEventListener("click", () => advanceArReadyFlow(arena));
      readyPanel.append(readyTitle, readyDetail, readyButton);
      emptyState.append(video, status, panel, readyPanel);
      arena.append(emptyState);
      if (arCameraStream) {
        arena.classList.add("ar-camera-running");
        syncArCameraUi(true);
        setArBoardStatus(arena, "scanning", "相机已开启，请将完整底板放入画面");
      }
    });

    document.querySelectorAll(".scene-toolbar").forEach(configureSceneToolbar);
    document.querySelectorAll(".side-status-hud").forEach((hud, index) => {
      const owner = hud.classList.contains("opponent-hud-zone") ? "opponent" : "player";
      hud.dataset.floatingId ||= `paleo21-${owner}-status-${index + 1}`;
    });

    document.querySelectorAll(".skill-event-backdrop .event-modal").forEach((modal) => {
      const backdrop = modal.closest(".skill-event-backdrop");
      if (!backdrop) return;
      if (!modal.textContent.includes("对手")) return;
      if (modal.classList.contains("combat-modal") && !modal.querySelector(".opponent-impact-summary")) {
        const story = modal.querySelector(".combat-story");
        const [actorCard, targetCard] = story?.querySelectorAll("article") || [];
        const action = story?.querySelector(":scope > strong")?.textContent.trim() || "发动技能";
        const actorOwner = actorCard?.querySelector("small")?.textContent.trim() || "对手的";
        const actorAnimal = actorCard?.querySelector("b")?.textContent.trim() || "动物";
        const targetOwner = targetCard?.querySelector("small")?.textContent.trim() || "场上的";
        const targetAnimal = targetCard?.querySelector("b")?.textContent.trim() || "目标";
        const summary = document.createElement("div");
        summary.className = "opponent-impact-summary";
        const rows = [
          ["对方做了什么", `${actorOwner}${actorAnimal}${action}${targetOwner}${targetAnimal}`],
          ["使用技能", `${actorAnimal} · ${action}`],
          ["对我方影响", targetOwner.includes("你") ? `${targetAnimal}受到“${action}”影响` : "本次技能未直接作用于我方动物"],
        ];
        rows.forEach(([label, text]) => {
          const row = document.createElement("p");
          const strong = document.createElement("b");
          strong.textContent = label;
          const span = document.createElement("span");
          span.textContent = text;
          row.append(strong, span);
          summary.append(row);
        });
        modal.insertBefore(summary, modal.querySelector("button"));
      }
      positionOpponentToast(backdrop);
      if (backdrop.dataset.opponentToastPrepared === "true") return;
      backdrop.dataset.opponentToastPrepared = "true";
      backdrop.classList.add("opponent-action-toast", "is-waiting-placement");
      backdrop.setAttribute("role", "status");
      backdrop.removeAttribute("aria-modal");
      backdrop.setAttribute("aria-live", "polite");
      window.setTimeout(() => backdrop.classList.remove("is-waiting-placement"), 720);
      window.setTimeout(() => {
        if (backdrop.isConnected) modal.querySelector("button")?.click();
      }, 4200);
    });

    const choiceDialogs = document.querySelectorAll(".compact-choice");
    if (!choiceDialogs.length) document.querySelector("[data-choice-toggle]")?.remove();
    choiceDialogs.forEach((dialog) => {
      fitChoiceDialog(dialog);
      syncChoiceToggle(dialog);
    });
    document.querySelectorAll(".compact-choice .animal-choice-3d").forEach(enhanceAnimalCard);
    configureNonBlockingDialogs();
  }

  let configureQueued = false;
  function scheduleConfigureGameUi() {
    if (configureQueued) return;
    configureQueued = true;
    window.requestAnimationFrame(() => {
      configureQueued = false;
      configureGameUi();
    });
  }

  configureGameUi();
  const observer = new MutationObserver(scheduleConfigureGameUi);
  const gameRoot = document.getElementById("root");
  if (gameRoot) observer.observe(gameRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", () => {
    scheduleConfigureGameUi();
  });
  window.addEventListener("jixiang:modechange", scheduleConfigureGameUi);
  window.addEventListener("paleo21:arboardstatus", (event) => {
    const recognized = Boolean(event.detail?.recognized);
    document.querySelectorAll(".combined-arena").forEach((arena) => {
      setArRecognitionState(arena, recognized);
    });
  });
  window.addEventListener("pagehide", stopArCamera);
})();
