(function setupPaleo21AnimalCardData() {
  "use strict";

  const storageKey = "paleo21.animal-card-library.v1";
  const dataVersion = 2;
  const defaults = {
    "洞狮": {
      value: 7,
      tags: ["食肉", "捕食者", "不可捕食"],
      uprightName: "狩猎",
      uprightSkill: "捕食对面同牌位的一只食草动物，获得其一半分数，并留下 2 点遗骸。",
      invertedName: "睡觉",
      invertedSkill: "睡觉，数值固定为 4。",
      science: "洞狮生活在更新世晚期的欧亚大陆，体格比多数现代狮更粗壮，主要活动于寒冷、开阔的草原环境，并捕猎大型食草动物。",
      backImage: "./assets/animal-restorations/cave-lion.png",
    },
    "洞鬣狗": {
      value: 4,
      tags: ["食肉", "食腐者", "不可捕食"],
      uprightName: "食腐",
      uprightSkill: "吃掉场上一处遗骸，获得遗骸的 2 点。",
      invertedName: "逃离",
      invertedSkill: "夹着尾巴逃离，数值归零，牌位重新变空。",
      science: "洞鬣狗是更新世欧亚大陆的斑鬣狗类群，颌骨强健，既会合作捕猎，也会利用大型动物遗骸；洞穴中的骨骼堆积常留下它们的活动痕迹。",
      backImage: "./assets/animal-restorations/cave-hyena.png",
    },
    "猛犸象": {
      value: 12,
      tags: ["食草", "大型动物", "不可捕食"],
      uprightName: "痛击",
      uprightSkill: "痛击对面同牌位的一只动物，使其逃离且不留下遗骸。",
      invertedName: "误伤",
      invertedSkill: "痛击一个相邻队友，使其逃离。",
      science: "猛犸象以草本植物为主食，拥有浓密长毛、厚脂肪和适应寒冷的耳朵。它们像现代象一样形成社会群体，并能长距离迁徙寻找食物。",
      backImage: "./assets/animal-restorations/woolly-mammoth.png",
    },
    "草原野牛": {
      value: 5,
      tags: ["食草", "群体召集", "可捕食"],
      uprightName: "召集",
      uprightSkill: "召唤一个野牛副本叠放；副本不能使用技能，受到捕食时一次只失去一只。",
      invertedName: "投喂",
      invertedSkill: "选择对方一只肉食动物投喂；它获得野牛当前被吃数值，并在野牛原牌位留下遗骸。对方没有肉食动物时不能发动。",
      science: "草原野牛曾广泛分布于欧亚大陆和北美的更新世草原。宽阔的头骨与强壮肩部适合推开积雪、取食低矮草本，并依靠群体降低被捕食风险。",
      backImage: "./assets/animal-restorations/steppe-bison.png",
    },
    "披毛犀": {
      value: 8,
      tags: ["食草", "位移控制", "不可捕食"],
      uprightName: "冲撞",
      uprightSkill: "只冲撞对位敌方动物，将其向一个合法相邻空位或场外推动一格。双方使用完全相同的目标规则。",
      invertedName: "驱赶",
      invertedSkill: "只驱赶一只己方相邻动物，将其沿远离披毛犀的方向推动一格；不能选择披毛犀自己。",
      science: "披毛犀拥有长毛、厚皮和巨大的前角，适应寒冷干燥的猛犸草原。牙齿和头部姿态显示它主要啃食贴近地面的草本植物。",
      backImage: "./assets/animal-restorations/woolly-rhinoceros.png",
    },
    "东北鼠兔": {
      value: 3,
      tags: ["食草", "可捕食", "钻洞免疫"],
      uprightName: "钻洞",
      uprightSkill: "钻洞：数值固定为 -1，免疫捕食、推动和驱赶。",
      invertedName: "三窟",
      invertedSkill: "狡兔三窟：数值固定为 -3，免疫捕食、推动和驱赶。",
      science: "东北鼠兔是兔形目小型哺乳动物，常生活在岩隙或洞穴附近。它们会收集并晾晒植物形成“草堆”，帮助自己度过食物短缺的寒冷季节。",
      backImage: "./assets/animal-restorations/pika.png",
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(source, { fillDefaultImages = false } = {}) {
    const input = source && typeof source === "object" ? source : {};
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => {
      const savedName = name === "东北鼠兔" && !input[name] ? "鼠兔" : name;
      const candidate = input[savedName] && typeof input[savedName] === "object" ? input[savedName] : {};
      const tags = Array.isArray(candidate.tags)
        ? candidate.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
        : fallback.tags;
      const science = String(candidate.science || "").trim() || fallback.science;
      const savedBackImage = typeof candidate.backImage === "string" ? candidate.backImage.trim() : "";
      const backImage = savedBackImage || (fillDefaultImages ? fallback.backImage : "");
      const textFields = ["uprightName", "uprightSkill", "invertedName", "invertedSkill"];
      const front = Object.fromEntries(textFields.map((field) => [
        field,
        String(candidate[field] || "").trim() || fallback[field],
      ]));
      if (name === "草原野牛" && front.invertedSkill.includes("在其牌位留下遗骸")) {
        front.invertedSkill = fallback.invertedSkill;
      }
      return [name, { value: fallback.value, tags: tags.length ? tags : clone(fallback.tags), ...front, science, backImage }];
    }));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return normalize(stored?.animals || stored, { fillDefaultImages: Number(stored?.version || 0) < dataVersion });
    } catch {
      return clone(defaults);
    }
  }

  function save(animals) {
    const normalized = normalize(animals);
    localStorage.setItem(storageKey, JSON.stringify({ version: dataVersion, animals: normalized }));
    window.dispatchEvent(new CustomEvent("paleo21:animalcardsupdated", { detail: normalized }));
    return normalized;
  }

  function reset() {
    localStorage.removeItem(storageKey);
    return clone(defaults);
  }

  function fromJSON(text) {
    const parsed = JSON.parse(text);
    return normalize(parsed?.animals || parsed, { fillDefaultImages: Number(parsed?.version || 0) < dataVersion });
  }

  window.Paleo21AnimalCards = {
    storageKey,
    defaults: clone(defaults),
    load,
    save,
    reset,
    fromJSON,
  };
})();
