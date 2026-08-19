(function enforcePaleo21MobileLandscape(global) {
  "use strict";

  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const uaDataMobile = navigator.userAgentData?.mobile === true;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (!mobileUA && !uaDataMobile && !iPadOS) return;

  document.documentElement.classList.add("paleo21-mobile-device");

  function ensureGate() {
    let gate = document.querySelector("[data-landscape-gate]");
    if (gate) return gate;
    gate = document.createElement("section");
    gate.className = "mobile-landscape-gate";
    gate.dataset.landscapeGate = "true";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-label", "请将手机横屏");
    gate.innerHTML = `<div aria-hidden="true">↻</div><b>请将手机横屏</b><p>横屏后才能进入完整棋盘并进行掷骰、选牌与安放。</p>`;
    document.body.append(gate);
    return gate;
  }

  function isPortrait() {
    return global.innerHeight > global.innerWidth;
  }

  function syncGate() {
    const gate = ensureGate();
    gate.hidden = !isPortrait();
    document.documentElement.classList.toggle("paleo21-portrait-blocked", isPortrait());
    document.documentElement.style.setProperty("--paleo-mobile-height", `${global.visualViewport?.height || global.innerHeight}px`);
  }

  async function requestLandscape() {
    if (!global.screen?.orientation?.lock) return;
    try { await global.screen.orientation.lock("landscape"); } catch { /* Manual rotation remains available. */ }
  }

  function hideBrowserChromeFallback() {
    global.setTimeout(() => global.scrollTo(0, 1), 80);
    global.setTimeout(() => global.scrollTo(0, 1), 360);
  }

  function requestNativeFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const target = document.documentElement;
    try {
      const result = target.requestFullscreen
        ? target.requestFullscreen({ navigationUI: "hide" })
        : target.webkitRequestFullscreen?.();
      result?.then?.(requestLandscape).catch?.(hideBrowserChromeFallback);
    } catch {
      hideBrowserChromeFallback();
    }
  }

  function isImmersiveEntry(event) {
    return (event.composedPath?.() || []).some((node) => {
      if (!(node instanceof Element)) return false;
      if (node.matches(".scene-fullscreen-button, .runtime-option.primary, [data-enter-icefield]")) return true;
      return node.matches("button, a") && /进入冰原|全屏/u.test(node.textContent || "");
    });
  }

  function handlePointerUp(event) {
    if (isImmersiveEntry(event)) requestNativeFullscreen();
    requestLandscape();
    hideBrowserChromeFallback();
  }

  function syncFullscreenState() {
    const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    document.documentElement.classList.toggle("paleo21-native-fullscreen", active);
    syncGate();
  }

  global.addEventListener("orientationchange", syncGate);
  global.addEventListener("resize", syncGate);
  global.visualViewport?.addEventListener("resize", syncGate);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);
  document.addEventListener("pointerup", handlePointerUp, { capture: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncGate, { once: true });
  else syncGate();
})(window);
