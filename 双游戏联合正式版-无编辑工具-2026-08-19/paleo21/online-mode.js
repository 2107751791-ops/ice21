(function setupPaleo21Online(global) {
  "use strict";

  const EMPTY_STATE = Object.freeze({
    enabled: false,
    connected: false,
    peerConnected: false,
    room: "ICE21",
    seat: null,
    mode: "normal",
    peerMode: null,
  });

  let socket = null;
  let room = "ICE21";
  let seat = null;
  let latestTerrain = null;
  let peerTerrain = null;
  let latestHiddenAction = null;
  let peerHidden = null;
  let onlineEnabled = false;
  let connected = false;
  let peerConnected = false;
  let peerMode = null;
  let connectionTimer = 0;

  function getMode() {
    return document.body?.classList.contains("ar-simulation-active") ? "ar" : "normal";
  }

  function getState() {
    return {
      ...EMPTY_STATE,
      enabled: onlineEnabled,
      connected,
      peerConnected,
      room,
      seat,
      mode: getMode(),
      peerMode,
    };
  }

  function emitState() {
    global.dispatchEvent(new CustomEvent("paleo21:online-state", { detail: getState() }));
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ ...message, room, sentAt: Date.now() }));
    return true;
  }

  function sendPresence() {
    return send({ type: "presence", mode: getMode(), protocol: 2 });
  }

  function sendGameAction(kind, payload = {}) {
    const action = { kind, ...payload };
    if (kind === "hidden-ready") latestHiddenAction = action;
    if (kind === "restart") latestHiddenAction = null;
    return send({ type: "game-action", action });
  }

  function publishTerrain(slots) {
    if (!Array.isArray(slots) || slots.length !== 5) return false;
    latestTerrain = slots.map((slot) => ({
      terrain: slot.terrain,
      inverted: Boolean(slot.inverted),
    }));
    return send({ type: "terrain-ready", slots: latestTerrain, mode: getMode() });
  }

  function setStatus(text, state = "idle") {
    document.body.classList.toggle("online-room-connected", connected);
    document.body.classList.toggle("online-peer-connected", peerConnected);
    document.querySelectorAll("[data-online-status]").forEach((node) => {
      node.textContent = text;
      node.dataset.state = state;
    });
    document.querySelectorAll("[data-online-connect]").forEach((button) => {
      button.disabled = state === "pending";
      button.textContent = state === "pending" ? "连接中…" : connected ? "重新连接" : "连接房间";
    });
    syncOpponentLabels();
    emitState();
  }

  function updateConnectedStatus(state = "connected") {
    if (!connected) {
      setStatus("尚未连接", "idle");
      return;
    }
    const self = seat === "player" ? "玩家一" : "玩家二";
    if (!peerConnected) {
      setStatus(`${self} · 等待另一位玩家`, state);
      return;
    }
    const selfMode = getMode() === "ar" ? "AR" : "普通";
    const otherMode = peerMode === "ar" ? "AR" : peerMode === "normal" ? "普通" : "对方";
    setStatus(`${self} · ${selfMode}端已连接${peerMode ? ` ${otherMode}端` : "对方"}`, state);
  }

  function syncOpponentLabels() {
    document.querySelectorAll(".opponent-side > b").forEach((label) => {
      const current = label.textContent.trim();
      const desired = connected ? "联机对手" : "随机对手";
      if ((connected || current === "联机对手") && current !== desired) label.textContent = desired;
    });
  }

  function setSwitch(on) {
    onlineEnabled = Boolean(on);
    document.querySelectorAll(".online-mode-switch").forEach((button) => {
      button.setAttribute("aria-checked", String(on));
      if (button.firstChild) button.firstChild.textContent = on ? "联机模式已开" : "联机模式";
    });
    emitState();
  }

  function disconnect() {
    global.clearTimeout(connectionTimer);
    connectionTimer = 0;
    const closingSocket = socket;
    socket = null;
    seat = null;
    connected = false;
    peerConnected = false;
    peerMode = null;
    peerTerrain = null;
    peerHidden = null;
    if (closingSocket && closingSocket.readyState < WebSocket.CLOSING) closingSocket.close();
    setStatus("尚未连接", "idle");
  }

  function socketUrl(roomCode) {
    const configured = String(global.PALEO21_WS_URL || "").trim();
    if (configured) {
      const url = new URL(configured, global.location.href);
      url.searchParams.set("room", roomCode);
      return url.toString();
    }
    const protocol = global.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${global.location.host}/paleo21-ws?room=${encodeURIComponent(roomCode)}`;
  }

  function resendReadyState() {
    sendPresence();
    if (latestTerrain) send({ type: "terrain-ready", slots: latestTerrain, mode: getMode() });
    if (latestHiddenAction) send({ type: "game-action", action: latestHiddenAction });
  }

  function connect(roomCode) {
    disconnect();
    setSwitch(true);
    room = String(roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (room.length < 4) {
      setStatus("房间号至少需要4位", "error");
      return;
    }
    let activeSocket;
    try {
      activeSocket = new WebSocket(socketUrl(room));
    } catch {
      setStatus("联机地址无效", "error");
      return;
    }
    socket = activeSocket;
    setStatus("正在连接…", "pending");
    connectionTimer = global.setTimeout(() => {
      if (socket !== activeSocket || connected) return;
      setStatus("连接超时，请重试", "error");
      socket = null;
      activeSocket.close();
    }, 15000);
    activeSocket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "welcome") {
        global.clearTimeout(connectionTimer);
        connectionTimer = 0;
        seat = message.seat;
        connected = true;
        peerConnected = Boolean(message.peerConnected);
        updateConnectedStatus();
        resendReadyState();
      } else if (message.type === "peer") {
        peerConnected = message.state === "joined";
        if (!peerConnected) peerMode = null;
        updateConnectedStatus(peerConnected ? "connected" : "pending");
        if (peerConnected) resendReadyState();
      } else if (message.type === "room-full") {
        setStatus("房间已有两位玩家", "error");
      } else if (message.type === "presence") {
        peerConnected = true;
        peerMode = message.mode === "ar" ? "ar" : "normal";
        updateConnectedStatus();
      } else if (message.type === "terrain-ready" && Array.isArray(message.slots)) {
        peerTerrain = message.slots;
        global.dispatchEvent(new CustomEvent("paleo21:online-peer-terrain", {
          detail: { slots: peerTerrain, mode: message.mode || peerMode },
        }));
        updateConnectedStatus();
      } else if (message.type === "game-action" && message.action) {
        if (message.action.kind === "hidden-ready") peerHidden = message.action.hidden || null;
        if (message.action.kind === "restart") peerHidden = null;
        global.dispatchEvent(new CustomEvent("paleo21:online-game-action", {
          detail: { action: message.action, from: message.from },
        }));
      }
    });
    activeSocket.addEventListener("close", () => {
      if (socket !== activeSocket) return;
      socket = null;
      seat = null;
      connected = false;
      peerConnected = false;
      peerMode = null;
      setStatus(onlineEnabled ? "联机已断开" : "尚未连接", onlineEnabled ? "error" : "idle");
    });
    activeSocket.addEventListener("error", () => {
      if (socket === activeSocket && onlineEnabled) setStatus("无法连接联机服务", "error");
    });
  }

  function ensurePanel() {
    let panel = document.querySelector("[data-online-panel]");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "online-mode-panel";
    panel.dataset.onlinePanel = "true";
    panel.hidden = true;
    panel.innerHTML = `<header><b>普通／AR 联机</b><button type="button" data-online-close aria-label="关闭">×</button></header><p>普通模式和 AR 模式可输入相同房间号共同对局。玩家一负责抽取先手并开始正式回合。</p><label><span>房间号</span><input data-online-room maxlength="6" value="ICE21" autocomplete="off" /></label><button type="button" class="online-connect" data-online-connect>连接房间</button><small data-online-status data-state="idle">尚未连接</small>`;
    panel.querySelector("[data-online-close]").addEventListener("click", () => {
      panel.hidden = true;
    });
    document.body.append(panel);
    return panel;
  }

  function toggleOnlinePanel() {
    const panel = ensurePanel();
    if (connected) {
      panel.hidden = true;
      setSwitch(false);
      disconnect();
      return;
    }
    const next = panel.hidden;
    panel.hidden = !next;
    setSwitch(next);
    if (!next) disconnect();
  }

  function ensureSwitch() {
    syncOpponentLabels();
    const tools = document.querySelector(".header-tools");
    if (!tools) return;
    let button = tools.querySelector(".online-mode-switch");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "online-mode-switch";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-checked", String(onlineEnabled));
      button.append(document.createTextNode(onlineEnabled ? "联机模式已开" : "联机模式"));
      tools.append(button);
    }
  }

  global.addEventListener("pointerdown", (event) => {
    const path = event.composedPath?.() || [];
    const connectButton = path.find((node) => node?.matches?.("[data-online-connect]"));
    if (connectButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const panel = connectButton.closest("[data-online-panel]");
      connect(panel?.querySelector("[data-online-room]")?.value || room);
      return;
    }
    const button = path.find((node) => node?.classList?.contains("online-mode-switch"));
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleOnlinePanel();
  }, true);
  global.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!event.target?.classList?.contains("online-mode-switch")) return;
    event.preventDefault();
    toggleOnlinePanel();
  }, true);

  global.addEventListener("paleo21:ar-terrain-ready", (event) => publishTerrain(event.detail?.slots));
  global.addEventListener("paleo21:local-terrain-ready", (event) => publishTerrain(event.detail?.slots));

  const observer = new MutationObserver((records) => {
    ensureSwitch();
    if (records.some((record) => record.type === "attributes" && record.attributeName === "class" && record.target === document.body)) {
      sendPresence();
      updateConnectedStatus();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  global.addEventListener("DOMContentLoaded", () => {
    ensureSwitch();
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });

  global.Paleo21Online = {
    connect,
    disconnect,
    send,
    sendGameAction,
    publishTerrain,
    getState,
    getPeerTerrain: () => peerTerrain,
    getPeerHidden: () => peerHidden,
    isConnected: () => connected,
  };
})(window);
