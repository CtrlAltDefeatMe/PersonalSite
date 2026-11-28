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
  const DEFAULT_SOUND = 'wood';
  // Each tick is a few decaying tones. `from` and `glide` make a tone fall in pitch, as a drum does.
  const SOUNDS = {
    sharp: { seconds: 0.04, parts: [{ f: 1600, a: 0.7, decay: 0.006 }, { f: 3200, a: 0.3, decay: 0.006 }] },
    wood: { seconds: 0.08, parts: [{ f: 820, a: 0.75, decay: 0.012 }, { f: 1960, a: 0.25, decay: 0.006 }] },
    tock: { seconds: 0.11, parts: [{ f: 420, a: 0.7, decay: 0.02 }, { f: 840, a: 0.2, decay: 0.012 }, { f: 1700, a: 0.1, decay: 0.003 }] },
    thump: { seconds: 0.16, parts: [{ f: 75, from: 190, glide: 0.02, a: 0.7, decay: 0.045 }, { f: 150, from: 380, glide: 0.02, a: 0.2, decay: 0.03 }, { f: 1100, a: 0.1, decay: 0.002 }] },
  };
  const VOLUME_RANGE_DB = 40; // the slider's bottom is this much quieter than its top
  const STORE_KEY = 'cadence.v1';

  const audio = document.getElementById('player');
  const readout = document.getElementById('spm');
  const toggle = document.getElementById('toggle');
  const down = document.getElementById('down');
  const up = document.getElementById('up');
  const volume = document.getElementById('volume');
  const status = document.getElementById('status');
  const presetButtons = [...document.querySelectorAll('#presets button')];
  const soundButtons = [...document.querySelectorAll('#sounds button')];
  const figure = {
    ground: document.getElementById('ground'),
    torso: document.getElementById('torso'),
    head: document.getElementById('head'),
    legNear: document.getElementById('leg-near'),
    legFar: document.getElementById('leg-far'),
    armNear: document.getElementById('arm-near'),
    armFar: document.getElementById('arm-far'),
  };

  let spm = DEFAULT_SPM;
  let level = 100;           // tick volume, 0 to 100
  let sound = DEFAULT_SOUND;
  let running = false;       // what the runner asked for, which the audio element then follows
  let swapping = false;      // true while a new loop replaces the one that is playing
  let loadedKey = '';
  let loadedUrl = null;
  let beats = 0;             // steps since Start, as drawn; kept in time with the audio
  let lastFrame = 0;
  let frame = 0;
  let preview = null;        // a second player, used only to sample a sound while stopped
  let previewUrl = null;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Number.isFinite(saved.spm)) spm = clamp(Math.round(saved.spm), MIN_SPM, MAX_SPM);
    if (Number.isFinite(saved.level)) level = clamp(Math.round(saved.level), 0, 100);
    if (Object.prototype.hasOwnProperty.call(SOUNDS, saved.sound)) sound = saved.sound;
  } catch (e) { /* private browsing, or nothing saved yet */ }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ spm, level, sound })); } catch (e) { /* not essential */ }
  }

  // One tick of the chosen sound, scaled so that every sound peaks at the same level.
  function tickSamples(name, gain) {
    const { seconds, parts } = SOUNDS[name];
    const n = Math.round(seconds * RATE);
    const wave = new Float64Array(n);
    for (const part of parts) {
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const f = part.from ? part.f + (part.from - part.f) * Math.exp(-t / part.glide) : part.f;
        wave[i] += part.a * Math.sin(phase) * Math.exp(-t / part.decay);
        phase += 2 * Math.PI * f / RATE;
      }
    }
    const fade = Math.round(0.005 * RATE);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      if (i >= n - fade) wave[i] *= (n - i) / fade;
      peak = Math.max(peak, Math.abs(wave[i]));
    }
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(32767 * 0.95 * gain * wave[i] / peak);
    return out;
  }

  // A 16-bit mono WAV of `frames` samples with a tick starting at each of `starts`.
  function buildWav(tick, starts, frames) {
    const buffer = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, frames * 2, true);
    for (const at of starts) {
      for (let i = 0; i < tick.length && at + i < frames; i++) view.setInt16(44 + (at + i) * 2, tick[i], true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // Equal slider movements give equal changes in loudness (decibels), so the whole travel is useful.
  const gain = () => 10 ** ((level - 100) / 100 * VOLUME_RANGE_DB / 20);

  // Exactly `spm` evenly spaced ticks in LOOP_SECONDS.
  function buildLoop() {
    const frames = RATE * LOOP_SECONDS;
    const beats = spm * LOOP_SECONDS / 60;
    const starts = Array.from({ length: beats }, (_, b) => Math.round(b * frames / beats));
    return buildWav(tickSamples(sound, gain()), starts, frames);
  }

  // Two ticks at the current tempo, to sample a sound without starting the metronome.
  function playPreview() {
    const step = Math.round(RATE * 60 / spm);
    const url = URL.createObjectURL(buildWav(tickSamples(sound, gain()), [0, step], step * 2));
    if (!preview) preview = new Audio();
    preview.src = url;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    const started = preview.play();
    if (started && started.catch) started.catch(() => { /* a sample is not essential */ });
  }

  // ---- The runner ----
  // One leg's stride: [point in the stride, thigh angle, knee bend], in degrees. The foot lands at 0,
  // leaves the ground near 0.36 and swings through for the rest. The other leg runs half a stride behind.
  const GAIT = [[0, 31, 15], [0.12, 8, 35], [0.25, -14, 22], [0.36, -33, 12], [0.5, -20, 85],
    [0.64, 15, 115], [0.78, 48, 85], [0.9, 47, 38], [1, 31, 15]];
  const TOE_OFF = 0.36;
  const BODY = { x: 80, ground: 109, thigh: 25, shank: 25, foot: 8, torso: 31, lean: 12, neck: 13, upperArm: 16, forearm: 15 };
  const STRIDE = 147;        // how far the ground slides per stride, in drawing units: matches the planted foot, and is a whole number of dashes
  const REST_POSE = 0.13;

  // Angles are measured from straight down, positive towards the direction of travel.
  const reach = (from, degrees, length) => {
    const r = degrees * Math.PI / 180;
    return { x: from.x + length * Math.sin(r), y: from.y + length * Math.cos(r) };
  };

  // Smooth curve through the GAIT points.
  function gait(phase) {
    const n = GAIT.length - 1;
    let i = 0;
    while (i < n - 1 && phase >= GAIT[i + 1][0]) i++;
    const a = GAIT[i];
    const b = GAIT[i + 1];
    const before = i === 0 ? GAIT[n - 1] : GAIT[i - 1];
    const after = i + 1 === n ? GAIT[1] : GAIT[i + 2];
    const xBefore = i === 0 ? before[0] - 1 : before[0];
    const xAfter = i + 1 === n ? after[0] + 1 : after[0];
    const h = b[0] - a[0];
    const t = (phase - a[0]) / h;
    return [1, 2].map((k) => {
      const m0 = (b[k] - before[k]) / (b[0] - xBefore);
      const m1 = (after[k] - a[k]) / (xAfter - a[0]);
      return (2 * t ** 3 - 3 * t ** 2 + 1) * a[k] + (t ** 3 - 2 * t ** 2 + t) * h * m0
        + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * h * m1;
    });
  }

  function leg(hip, phase) {
    const [thigh, bend] = gait(phase);
    const knee = reach(hip, thigh, BODY.thigh);
    const ankle = reach(knee, thigh - bend, BODY.shank);
    const toe = reach(ankle, thigh - bend + 80, BODY.foot);
    return [hip, knee, ankle, toe];
  }

  // An arm swings with the opposite leg, and bends more as it comes forward.
  function arm(shoulder, oppositeLegPhase) {
    const swing = Math.cos(2 * Math.PI * (oppositeLegPhase - 0.82));
    const upper = -4 + 42 * swing;
    const elbow = reach(shoulder, upper, BODY.upperArm);
    return [shoulder, elbow, reach(elbow, upper + 85 + 20 * swing, BODY.forearm)];
  }

  const plot = (el, points) => el.setAttribute('points', points.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' '));

  // `stride` runs 0 to 1 over two steps: the near foot lands at 0, the far foot at 0.5.
  function drawRunner(stride) {
    const origin = { x: BODY.x, y: 0 };
    const nearPhase = stride % 1;
    const farPhase = (stride + 0.5) % 1;
    const drop = Math.max(...leg(origin, nearPhase).concat(leg(origin, farPhase)).map((p) => p.y));
    const sinceLanding = stride % 0.5;
    const flight = sinceLanding > TOE_OFF ? 3 * Math.sin(Math.PI * (sinceLanding - TOE_OFF) / (0.5 - TOE_OFF)) : 0;
    const hip = { x: BODY.x, y: BODY.ground - drop - flight };
    const shoulder = reach(hip, 180 - BODY.lean, BODY.torso);
    const head = reach(shoulder, 180 - BODY.lean, BODY.neck);
    plot(figure.legNear, leg(hip, nearPhase));
    plot(figure.legFar, leg(hip, farPhase));
    plot(figure.armNear, arm(shoulder, farPhase));
    plot(figure.armFar, arm(shoulder, nearPhase));
    plot(figure.torso, [hip, shoulder]);
    figure.head.setAttribute('cx', head.x.toFixed(1));
    figure.head.setAttribute('cy', head.y.toFixed(1));
    figure.ground.style.strokeDashoffset = ((stride * STRIDE) % 21).toFixed(1);
  }

  // Advance by the clock for smooth motion, and nudge towards the audio position so each foot lands on its tick.
  function animate(now) {
    frame = requestAnimationFrame(animate);
    const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    beats += elapsed * spm / 60;
    if (!audio.paused && audio.readyState >= 2) {
      let error = (audio.currentTime * spm / 60) % 1 - beats % 1;
      error -= Math.round(error);
      beats += Math.abs(error) > 0.2 ? error : error * 0.15;
    }
    drawRunner((beats / 2) % 1);
  }

  function syncRunner() {
    if (running && !frame) {
      lastFrame = performance.now();
      frame = requestAnimationFrame(animate);
    } else if (!running) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      drawRunner(REST_POSE);
    }
  }

  // iOS ignores audio.volume, so the volume is baked into the samples instead.
  function load() {
    const key = spm + ':' + level + ':' + sound;
    if (key === loadedKey) return;
    const url = URL.createObjectURL(buildLoop());
    audio.src = url;
    if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    loadedUrl = url;
    loadedKey = key;
  }

  function play() {
    status.textContent = '';
    beats = 0;
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

  function start() { if (preview) preview.pause(); running = true; render(); play(); }
  function stop() { running = false; swapping = false; audio.pause(); render(); }

  function setTempo(next) {
    next = clamp(next, MIN_SPM, MAX_SPM);
    if (next === spm) return;
    spm = next;
    save();
    render();
    if (running) { swapping = true; play(); }
  }

  function setSound(next) {
    if (next === sound || !SOUNDS[next]) return;
    sound = next;
    save();
    render();
    if (running) { swapping = true; play(); } else playPreview();
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
    soundButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sound === sound)));
    toggle.textContent = running ? 'Stop' : 'Start';
    toggle.setAttribute('aria-pressed', String(running));
    document.title = running ? spm + ' · Cadence' : 'Cadence';
    syncRunner();
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
  soundButtons.forEach((b) => b.addEventListener('click', () => setSound(b.dataset.sound)));
  volume.addEventListener('change', () => {
    level = clamp(Number(volume.value), 0, 100);
    save();
    if (running) { swapping = true; play(); } else playPreview();
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
    // When a new version takes over, show it at once unless the metronome is ticking.
    const controlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlled && !running) location.reload(); });
  }
})();
