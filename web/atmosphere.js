/* Small, infrequent events authored against the 1920 × 1080 station render. */
'use strict';
(() => {
  const WIDTH = 1920, HEIGHT = 1080;
  const kinds = ['gust', 'headlights', 'lightning'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width:700px)');
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  let scene, canvas, ctx, initialized = false, wanted = true;
  let settings = { sound: false, motion: !reduced.matches, busy: false };
  let transform = { scale: 1, left: 0, top: 0, dpr: 1 };
  let active = null, queued = null, timer = 0, frame = 0, nextAt = 0;
  let lastKind = null, lastLightning = -Infinity, paused = 'initializing';
  let noiseSprite, glowSprite;

  class EventAudio {
    constructor() { this.context = null; this.voices = new Set(); this.ready = false; }

    async enable() {
      if (!settings.sound || blocked()) return false;
      try {
        if (!this.context) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          const c = this.context = new AC();
          this.master = c.createGain();
          this.master.gain.value = 0.36;
          const limiter = c.createDynamicsCompressor();
          limiter.threshold.value = -24;
          limiter.knee.value = 16;
          limiter.ratio.value = 3;
          this.master.connect(limiter).connect(c.destination);
          this.buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
          const samples = this.buffer.getChannelData(0);
          let previous = 0;
          for (let i = 0; i < samples.length; i++) {
            previous = previous * 0.74 + (Math.random() * 2 - 1) * 0.26;
            samples[i] = previous;
          }
          // A short edge taper keeps the quiet looping source click-free.
          const edge = Math.min(2048, samples.length / 2);
          for (let i = 0; i < edge; i++) {
            const weight = smooth(i / edge);
            samples[i] *= weight;
            samples[samples.length - i - 1] *= weight;
          }
        }
        await this.context.resume();
        this.ready = settings.sound && !blocked() && this.context.state === 'running';
        if (!this.ready) this.silence();
        return this.ready;
      } catch { this.ready = false; return false; }
    }

    voice({ delay = 0, duration, frequency, level, pan = 0, endPan = pan, type = 'lowpass', tone = false }) {
      if (!this.ready || !settings.sound || blocked()) return;
      const c = this.context, at = c.currentTime + delay;
      const source = tone ? c.createOscillator() : c.createBufferSource();
      const filter = c.createBiquadFilter(), gain = c.createGain();
      const panner = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      if (tone) { source.type = 'sine'; source.frequency.setValueAtTime(frequency, at); source.frequency.linearRampToValueAtTime(frequency * 0.82, at + duration); }
      else { source.buffer = this.buffer; source.loop = true; }
      filter.type = type;
      filter.frequency.value = tone ? 220 : frequency;
      filter.Q.value = type === 'bandpass' ? 0.65 : 0.5;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level * 0.4, at + duration * 0.16);
      gain.gain.linearRampToValueAtTime(level, at + duration * 0.4);
      gain.gain.linearRampToValueAtTime(level * 0.38, at + duration * 0.67);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      if (panner.pan) { panner.pan.setValueAtTime(pan, at); panner.pan.linearRampToValueAtTime(endPan, at + duration); }
      source.connect(filter).connect(gain).connect(panner).connect(this.master);
      const voice = { source, nodes: [source, filter, gain, panner] };
      this.voices.add(voice);
      source.onended = () => this.release(voice);
      source.start(at);
      source.stop(at + duration + 0.05);
    }

    release(voice) {
      voice.source.onended = null;
      for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
      this.voices.delete(voice);
    }

    async play(event) {
      if (!await this.enable() || active !== event) return;
      if (event.kind === 'gust') {
        this.voice({ duration: 9, frequency: 610, level: 0.035, pan: -0.15, endPan: 0.3 });
        // Brief dry debris rustles occur with the strongest part of the gust.
        this.voice({ delay: 2.4, duration: 0.6, frequency: 1800, level: 0.017, pan: 0.2, type: 'bandpass' });
        this.voice({ delay: 3.25, duration: 0.4, frequency: 2250, level: 0.012, pan: 0.24, type: 'bandpass' });
      } else if (event.kind === 'headlights') {
        this.voice({ delay: 0.6, duration: 10.5, frequency: 110, level: 0.018, pan: 0.8, endPan: 0.37, tone: true });
        this.voice({ delay: 0.8, duration: 10, frequency: 185, level: 0.035, pan: 0.8, endPan: 0.37 });
      } else {
        // The sound follows the cloud glow by several seconds, never a sharp crack.
        this.voice({ delay: 4.3, duration: 4.3, frequency: 140, level: 0.12, pan: 0.62 });
      }
    }

    silence() {
      this.ready = false;
      for (const voice of [...this.voices]) {
        try { voice.source.stop(); } catch {}
        this.release(voice);
      }
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }
  }
  const audio = new EventAudio();

  function readControls() {
    let state;
    try { state = window.StationControls?.getState(); } catch {}
    if (state) {
      for (const key of ['sound', 'motion', 'busy']) if (typeof state[key] === 'boolean') settings[key] = state[key];
    } else {
      const soundButton = document.getElementById('soundButton');
      const motionButton = document.getElementById('motionButton');
      if (soundButton) settings.sound = soundButton.getAttribute('aria-pressed') === 'true';
      if (motionButton) settings.motion = motionButton.getAttribute('aria-pressed') === 'true';
      settings.busy = Boolean(document.querySelector('[data-restart]:disabled'));
    }
  }

  function blocked() {
    if (!wanted) return 'stopped';
    if (reduced.matches) return 'reduced-motion';
    if (!settings.motion || scene?.classList.contains('still')) return 'motion-off';
    if (document.hidden) return 'hidden';
    if (settings.busy || document.querySelector('[data-restart]:disabled')) return 'generator';
    if (document.querySelector('dialog[open]')) return 'dialog';
    return null;
  }

  function clear() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function cancel() {
    clearTimeout(timer); timer = 0; nextAt = 0;
    cancelAnimationFrame(frame); frame = 0;
    active = null;
    clear();
    audio.silence();
  }

  function sync() {
    if (!initialized) return;
    const reason = blocked();
    paused = reason;
    canvas.hidden = Boolean(reason);
    if (reason) {
      if (reason !== 'dialog') queued = null;
      cancel();
      return;
    }
    if (!settings.sound) audio.silence();
    if (queued) {
      const kind = queued;
      queued = null;
      begin(kind);
    } else if (!active && !timer) schedule();
  }

  function schedule() {
    if (blocked() || timer || active) return;
    const delay = rand(35000, 100000);
    nextAt = performance.now() + delay;
    timer = setTimeout(() => {
      timer = 0; nextAt = 0;
      if (blocked()) { sync(); return; }
      const choice = Math.random();
      const kind = choice < 0.73 ? 'gust' : choice < 0.94 ? 'headlights' : 'lightning';
      begin(kind === 'lightning' && performance.now() - lastLightning < 180000 ? 'gust' : kind);
    }, delay);
  }

  function makeSprites() {
    noiseSprite = document.createElement('canvas');
    noiseSprite.width = noiseSprite.height = 64;
    const dust = noiseSprite.getContext('2d');
    const fade = dust.createRadialGradient(32, 32, 1, 32, 32, 32);
    fade.addColorStop(0, 'rgba(188,153,110,.55)');
    fade.addColorStop(0.45, 'rgba(179,145,104,.27)');
    fade.addColorStop(1, 'rgba(179,145,104,0)');
    dust.fillStyle = fade;
    // The sprite is circular before the authored ground-plane scaling below.
    dust.fillRect(0, 0, 64, 64);
    glowSprite = document.createElement('canvas');
    glowSprite.width = glowSprite.height = 64;
    const glow = glowSprite.getContext('2d');
    const light = glow.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, 'rgba(255,225,172,.8)');
    light.addColorStop(0.12, 'rgba(255,218,151,.3)');
    light.addColorStop(1, 'rgba(255,218,151,0)');
    glow.fillStyle = light; glow.fillRect(0, 0, 64, 64);
  }

  function map() {
    if (!scene || !canvas) return;
    const width = scene.clientWidth, height = scene.clientHeight;
    const cover = mobile.matches && !scene.classList.contains('full-frame');
    const scale = (cover ? Math.max : Math.min)(width / WIDTH, height / HEIGHT);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    transform = { scale, dpr, left: cover ? width - WIDTH * scale : (width - WIDTH * scale) / 2, top: (height - HEIGHT * scale) / 2 };
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    if (active) draw(performance.now());
    else clear();
  }

  function begin(kind) {
    if (blocked()) return false;
    cancel();
    canvas.hidden = false;
    const event = active = { kind, start: performance.now(), duration: kind === 'gust' ? 12500 : kind === 'headlights' ? 14000 : 10000 };
    lastKind = kind;
    if (kind === 'lightning') lastLightning = event.start;
    if (kind === 'gust') {
      event.puffs = Array.from({ length: 18 }, () => ({ x: rand(400, 1080), y: rand(884, 1005), width: rand(80, 175), height: rand(10, 22), offset: rand(0, 3.2), speed: rand(18, 33), life: rand(5, 8), opacity: rand(0.06, 0.13) }));
      event.grains = Array.from({ length: 18 }, () => ({ x: rand(520, 1160), y: rand(884, 988), speed: rand(16, 36), offset: rand(0.2, 4.4), life: rand(2, 4.7), size: rand(0.5, 1.2) }));
    }
    if (settings.sound) audio.play(event);
    frame = requestAnimationFrame(tick);
    return true;
  }

  function drawGust(event, seconds) {
    // All dust is on the clear forecourt below the building, pumps and generator.
    ctx.save(); ctx.beginPath(); ctx.rect(340, 852, 1130, 190); ctx.clip();
    for (const puff of event.puffs) {
      const t = seconds - puff.offset, progress = t / puff.life;
      if (progress <= 0 || progress >= 1) continue;
      const envelope = Math.sin(Math.PI * progress) ** 2;
      const x = puff.x + t * puff.speed, y = puff.y - Math.sin(progress * Math.PI) * 9;
      ctx.globalAlpha = puff.opacity * envelope;
      ctx.drawImage(noiseSprite, x - puff.width / 2, y - puff.height / 2, puff.width, puff.height);
    }
    for (const grain of event.grains) {
      const t = seconds - grain.offset, progress = t / grain.life;
      if (progress <= 0 || progress >= 1) continue;
      const x = grain.x + t * grain.speed, y = grain.y - Math.sin(progress * Math.PI) * 3;
      ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.27;
      ctx.fillStyle = '#c4a47b';
      ctx.fillRect(x, y, grain.size * 2.4, grain.size * 0.65);
    }
    // Two tiny dry fragments roll across the ground with this same gust.
    for (let i = 0; i < 2; i++) {
      const progress = clamp((seconds - 1.6 - i * 0.55) / 6.8);
      if (progress <= 0 || progress >= 1) continue;
      const x = 1000 + i * 160 + progress * 165;
      const y = 929 + i * 29 - Math.abs(Math.sin(progress * Math.PI * 5)) * 4;
      ctx.save(); ctx.translate(x, y); ctx.rotate(progress * 8 + i);
      ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.5;
      ctx.fillStyle = '#a08a69'; ctx.beginPath();
      ctx.moveTo(-3.5, 0); ctx.quadraticCurveTo(0, -2, 3.3, 0);
      ctx.quadraticCurveTo(0, 1.1, -3.5, 0); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function drawHeadlights(event, seconds) {
    const progress = seconds / (event.duration / 1000);
    const x = 1917 - progress * 216, y = 538 - progress * 4;
    // The far right gap is clear desert. Palm trunks/crown and sign supports
    // are occluded by withholding the distant lights across their image ranges.
    const palmOcclusion = x > 1751 && x < 1801;
    if (palmOcclusion) return;
    const palmFade = x >= 1801 ? smooth((x - 1801) / 7) : smooth((1751 - x) / 7);
    const fade = smooth(progress / 0.12) * smooth((1 - progress) / 0.15) * palmFade;
    ctx.save(); ctx.beginPath(); ctx.rect(1698, 516, 222, 48); ctx.clip();
    ctx.globalAlpha = fade * 0.56;
    ctx.drawImage(glowSprite, x - 11, y - 4, 22, 8);
    ctx.fillStyle = '#ffe1af';
    ctx.globalAlpha = fade * 0.68;
    ctx.beginPath(); ctx.ellipse(x, y, 0.85, 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 3.1, y, 0.8, 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLightning(event, seconds) {
    // A single slow cloud illumination; no bolt, strobe, or whole-frame exposure.
    if (seconds > 3.6) return;
    const glow = Math.exp(-(((seconds - 1.35) / 0.64) ** 2)) * smooth(seconds / 0.4);
    ctx.save(); ctx.beginPath(); ctx.rect(1710, 326, 210, 94); ctx.clip();
    ctx.translate(1850, 379); ctx.scale(1, 0.27);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 145);
    light.addColorStop(0, 'rgba(170,176,197,.15)');
    light.addColorStop(0.55, 'rgba(151,160,184,.06)');
    light.addColorStop(1, 'rgba(151,160,184,0)');
    ctx.globalAlpha = glow; ctx.fillStyle = light;
    ctx.fillRect(-145, -145, 290, 290); ctx.restore();
  }

  function draw(now) {
    clear();
    if (!active || blocked()) return;
    const { scale, left, top, dpr } = transform;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, left * dpr, top * dpr);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WIDTH, HEIGHT); ctx.clip();
    const seconds = Math.max(0, now - active.start) / 1000;
    if (active.kind === 'gust') drawGust(active, seconds);
    else if (active.kind === 'headlights') drawHeadlights(active, seconds);
    else drawLightning(active, seconds);
    ctx.restore();
  }

  function tick(now) {
    frame = 0;
    if (blocked()) { sync(); return; }
    if (!active) return;
    if (now - active.start >= active.duration) {
      active = null; clear(); audio.silence(); schedule(); return;
    }
    draw(now);
    frame = requestAnimationFrame(tick);
  }

  function initialize() {
    if (initialized) return true;
    scene = document.getElementById('scene');
    if (!scene) return false;
    canvas = document.createElement('canvas');
    canvas.className = 'station-atmosphere';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('role', 'presentation');
    ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return false;
    scene.insertBefore(canvas, scene.querySelector('.hotspots'));
    initialized = true;
    makeSprites(); readControls(); map();
    new ResizeObserver(map).observe(scene);
    new MutationObserver(() => { map(); sync(); }).observe(scene, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => { readControls(); sync(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'disabled'] });
    for (const id of ['soundButton', 'motionButton']) {
      const button = document.getElementById(id);
      if (button) new MutationObserver(() => { readControls(); sync(); }).observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
    }
    sync();
    return true;
  }

  function settingsChanged(event) {
    const detail = event.detail || {};
    for (const key of ['sound', 'motion', 'busy']) if (typeof detail[key] === 'boolean') settings[key] = detail[key];
    sync();
    if (settings.sound && !blocked()) audio.enable();
  }
  document.addEventListener('station:settings', settingsChanged);
  window.addEventListener('station:settings', settingsChanged);
  document.addEventListener('visibilitychange', () => { readControls(); sync(); });
  reduced.addEventListener('change', sync);
  mobile.addEventListener('change', map);
  window.addEventListener('resize', map, { passive: true });
  window.addEventListener('pagehide', event => {
    cancel();
    if (!event.persisted && audio.context) audio.context.close().catch(() => {});
  });
  window.addEventListener('pageshow', () => { readControls(); sync(); });
  // Recover a browser-suspended context only after the visitor has opted in.
  document.addEventListener('pointerdown', () => {
    if (settings.sound && !blocked() && audio.context?.state === 'suspended') audio.enable();
  }, { passive: true });

  window.StationAtmosphere = {
    start() { wanted = true; initialize(); readControls(); sync(); return this.getState(); },
    stop() { wanted = false; queued = null; sync(); return this.getState(); },
    preview(kind = 'gust') {
      if (!kinds.includes(kind)) return { ok: false, reason: 'unknown-event', kinds: [...kinds] };
      if (!initialize()) return { ok: false, reason: 'scene-unavailable' };
      readControls();
      const reason = blocked();
      if (reason === 'dialog') { queued = kind; return { ok: true, kind, queued: true }; }
      if (reason) return { ok: false, kind, reason };
      begin(kind);
      return { ok: true, kind, queued: false };
    },
    getState() {
      return {
        enabled: wanted, ready: initialized, sound: settings.sound,
        motion: settings.motion && !reduced.matches, busy: settings.busy,
        active: active?.kind || null, queued, last: lastKind,
        paused: initialized ? blocked() : paused,
        nextInSeconds: nextAt ? Math.max(0, Math.ceil((nextAt - performance.now()) / 1000)) : null,
        audio: audio.context?.state || 'uninitialized',
        voices: audio.voices.size, dpr: transform.dpr
      };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
