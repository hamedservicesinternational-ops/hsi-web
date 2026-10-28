// Foreground only. Background push sound belongs to the browser / operating system.
(() => {
  'use strict';
  let context;
  let lastPlayed = -Infinity;
  const permitted = () => self.Notification?.permission === 'granted';
  function getContext() {
    const AudioContext = self.AudioContext || self.webkitAudioContext;
    if (!AudioContext) return null;
    if (!context || context.state === 'closed') context = new AudioContext();
    return context;
  }
  function unlock() {
    if (!permitted()) return;
    try {
      const audio = getContext();
      if (audio && audio.state !== 'running') audio.resume().catch(() => {});
    } catch (_) { /* Audio remains optional. */ }
  }
  document.addEventListener('pointerup', unlock, {capture: true, passive: true});
  document.addEventListener('keydown', unlock, {capture: true, passive: true});

  async function play(preview = false) {
    if (document.hidden || !document.hasFocus() || (!preview && !permitted())) return false;
    try {
      const audio = getContext();
      if (!audio) return false;
      // Only a user's test button may attempt to resume; never queue a stale
      // notification that could ring minutes later after another gesture.
      if (preview && audio.state !== 'running') {
        await Promise.race([audio.resume(), new Promise(resolve => setTimeout(resolve, 800))]);
      }
      if (audio.state !== 'running' || document.hidden || !document.hasFocus()) return false;
      const now = Date.now();
      if (now - lastPlayed < 2000) return false;
      lastPlayed = now;
      // Two rounded bell notes (E5, A5), gentle attack and a short decay.
      for (const [offset, frequency] of [[0, 659.25], [0.23, 880]]) {
        const start = audio.currentTime + offset;
        for (const [multiple, level] of [[1, 0.25], [2, 0.055]]) {
          const tone = audio.createOscillator();
          const volume = audio.createGain();
          tone.type = 'sine';
          tone.frequency.value = frequency * multiple;
          volume.gain.setValueAtTime(0, start);
          volume.gain.linearRampToValueAtTime(level, start + 0.012);
          volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
          tone.connect(volume); volume.connect(audio.destination);
          tone.onended = () => { tone.disconnect(); volume.disconnect(); };
          tone.start(start); tone.stop(start + 0.68);
        }
      }
      return true;
    } catch (_) { return false; }
  }
  self.HSI_NOTIFICATION_AUDIO = Object.freeze({play});
})();
