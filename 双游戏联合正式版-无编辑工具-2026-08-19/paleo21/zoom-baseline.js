/** 将旧布局的 156% 场景缩放迁移为新版默认 100% 基准；仅执行一次。 */
(function migratePaleoZoomBaseline() {
  "use strict";
  const layoutKey = "paleo21.layout-draft.v2";
  const migrationKey = "paleo21.zoom-baseline-156.v1";
  try {
    if (localStorage.getItem(migrationKey) === "done") return;
    const saved = JSON.parse(localStorage.getItem(layoutKey) || "{}");
    saved.cameraZoom = 1.56;
    localStorage.setItem(layoutKey, JSON.stringify(saved));
    localStorage.setItem(migrationKey, "done");
  } catch {
    // 本地存储不可用时，游戏包内的新默认值仍会生效。
  }
})();
