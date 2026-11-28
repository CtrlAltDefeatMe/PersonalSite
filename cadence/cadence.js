// Cadence: a running metronome.
//
// The ticks are not scheduled with timers or Web Audio, because iOS suspends both when the screen
// locks. Instead a one-minute WAV of ticks is built in memory for the chosen tempo and looped through
// an ordinary <audio> element, which iOS keeps playing in the background like a podcast. A minute
// holds a whole number of steps at any whole tempo, so the loop point always lands on the beat.
(() => {
  'use strict';

  const PRESETS = [165, 170, 175];
  const MIN_SPM = 140;
  const MAX_SPM = 200;
  const DEFAULT_SPM = 170;
  const RATE = 22050;        // samples per second
  const LOOP_SECONDS = 60;
  const TICK_SECONDS = 0.04;
  const STORE_KEY = 'cadence.v1';

  const audio = document.getElementById('player');
  const readout = document.getElementById('spm');
  const toggle = document.getElementById('toggle');
  const down = document.getElementById('down');
  const up = document.getElementById('up');
  const volume = document.getElementById('volume');
  const status = document.getElementById('status');
  const presetButtons = [...document.querySelectorAll('#presets button')];

  let spm = DEFAULT_SPM;
  let level = 100;           // tick volume, 10 to 100
  let running = false;       // what the runner asked for, which the audio element then follows
  let swapping = false;      // true while a new loop replaces the one that is playing
  let loadedKey = '';
  let loadedUrl = null;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Number.isFinite(saved.spm)) spm = clamp(Math.round(saved.spm), MIN_SPM, MAX_SPM);
    if (Number.isFinite(saved.level)) level = clamp(Math.round(saved.level), 10, 100);
  } catch (e) { /* private browsing, or nothing saved yet */ }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ spm, level })); } catch (e) { /* not essential */ }
  }

  // One tick: two decaying partials, bright enough to cut through footfall and wind.
  function tickSamples(gain) {
    const n = Math.round(TICK_SECONDS * RATE);
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const wave = 0.7 * Math.sin(2 * Math.PI * 1600 * t) + 0.3 * Math.sin(2 * Math.PI * 3200 * t);
      out[i] = Math.round(32767 * 0.95 * gain * wave * Math.exp(-t / 0.006));
    }
    return out;
  }

  // A 16-bit mono WAV holding exactly `tempo` evenly spaced ticks in LOOP_SECONDS.
  function buildLoop(tempo, gain) {
    const frames = RATE * LOOP_SECONDS;
    const buffer = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, frames * 2, true);

    const tick = tickSamples(gain);
    const beats = tempo * LOOP_SECONDS / 60;
    for (let b = 0; b < beats; b++) {
      const at = Math.round(b * frames / beats);
      for (let i = 0; i < tick.length; i++) view.setInt16(44 + (at + i) * 2, tick[i], true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // iOS ignores audio.volume, so the volume is baked into the samples instead.
  function load() {
    const key = spm + ':' + level;
    if (key === loadedKey) return;
    const url = URL.createObjectURL(buildLoop(spm, (level / 100) ** 2));
    audio.src = url;
    if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    loadedUrl = url;
    loadedKey = key;
  }

  function play() {
    status.textContent = '';
    load();
    try { audio.currentTime = 0; } catch (e) { /* not ready yet; a fresh loop starts at zero anyway */ }
    const started = audio.play();
    if (started && started.catch) {
      started.catch((err) => {
        if (err && err.name === 'AbortError') return;   // superseded by a newer tempo
        swapping = false;
        running = false;
        render();
        status.textContent = 'Could not start the sound. Tap Start again.';
      });
    }
  }

  function start() { running = true; render(); play(); }
  function stop() { running = false; swapping = false; audio.pause(); render(); }

  function setTempo(next) {
    next = clamp(next, MIN_SPM, MAX_SPM);
    if (next === spm) return;
    spm = next;
    save();
    render();
    if (running) { swapping = true; play(); }
  }

  function stepPreset(direction) {
    const next = direction > 0 ? PRESETS.find((p) => p > spm) : [...PRESETS].reverse().find((p) => p < spm);
    if (next) setTempo(next);
  }

  function render() {
    readout.textContent = spm;
    down.disabled = spm <= MIN_SPM;
    up.disabled = spm >= MAX_SPM;
    presetButtons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.spm) === spm)));
    toggle.textContent = running ? 'Stop' : 'Start';
    toggle.setAttribute('aria-pressed', String(running));
    document.title = running ? spm + ' · Cadence' : 'Cadence';
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: spm + ' steps per minute',
          artist: 'Cadence',
          artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
        });
        navigator.mediaSession.playbackState = running ? 'playing' : 'paused';
      } catch (e) { /* older browsers */ }
    }
  }

  toggle.addEventListener('click', () => (running ? stop() : start()));
  down.addEventListener('click', () => setTempo(spm - 1));
  up.addEventListener('click', () => setTempo(spm + 1));
  presetButtons.forEach((b) => b.addEventListener('click', () => setTempo(Number(b.dataset.spm))));
  volume.addEventListener('change', () => {
    level = clamp(Number(volume.value), 10, 100);
    save();
    if (running) { swapping = true; play(); }
  });

  // Follow the audio element, so a phone call, the lock screen or a headphone button keeps the page in step.
  audio.addEventListener('playing', () => { swapping = false; if (!running) { running = true; render(); } });
  audio.addEventListener('pause', () => { if (swapping || !running) return; running = false; render(); });
  audio.addEventListener('error', () => {
    if (!running) return;
    running = false; swapping = false; loadedKey = '';
    render();
    status.textContent = 'The sound stopped. Tap Start again.';
  });

  // Lock-screen and headphone controls: play, pause, and previous / next to move between presets.
  if ('mediaSession' in navigator) {
    const handle = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* unsupported action */ } };
    handle('play', start);
    handle('pause', stop);
    handle('stop', stop);
    handle('previoustrack', () => stepPreset(-1));
    handle('nexttrack', () => stepPreset(1));
  }

  // Ask iOS for the "playback" audio category: sounds with the silent switch on and in the background.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }

  volume.value = level;
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* still works online without it */ });
  }
})();
