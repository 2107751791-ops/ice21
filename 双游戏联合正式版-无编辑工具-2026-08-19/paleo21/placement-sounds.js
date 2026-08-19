(function setupPaleo21AnimalPlacementSounds() {
  "use strict";

  const urls = Object.freeze({
    lion: "./audio/animals/lion.mp3",
    mammoth: "./audio/animals/mm.mp3",
    bison: "./audio/animals/cow.mp3",
    rhino: "./audio/animals/rhino.mp3",
    pika: "./audio/animals/rabbit.mp3",
    hyena: "./audio/animals/hyena.mp3",
  });
  const cache = new Map();
  let currentAudio = null;
  let lastAnimal = "";
  let lastPlayedAt = 0;

  function getAudio(animal) {
    if (!urls[animal]) return null;
    if (!cache.has(animal)) {
      const audio = new Audio(urls[animal]);
      audio.preload = "auto";
      audio.volume = 0.75;
      cache.set(animal, audio);
    }
    return cache.get(animal);
  }

  function play(animal) {
    const audio = getAudio(animal);
    if (!audio) return false;
    const now = performance.now();
    if (animal === lastAnimal && now - lastPlayedAt < 240) return true;
    lastAnimal = animal;
    lastPlayedAt = now;
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
    return true;
  }

  Object.keys(urls).forEach(getAudio);
  window.Paleo21AnimalPlacementSound = Object.freeze({ play, urls });
})();
