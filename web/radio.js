/* An original, procedural shortwave receiver. No recordings or network audio. */
(() => {
  'use strict';

  const MIN = 5800, MAX = 10200, STEP = 10;
  const bands = [
    { id: 'weather', frequency: 6200, name: 'Desert weather', label: 'Weather',
      transcript: 'Automated desert weather. Clear through the night. Wind west at eight, easing after midnight. Loose sand on the service road. Next bulletin at first light.' },
    { id: 'music', frequency: 7450, name: 'Last light', label: 'Music',
      transcript: 'A few warm notes, drifting through the static. “Last light” is an original, repeating instrumental written for this receiver.' },
    { id: 'voice', frequency: 9150, name: 'Distant relay', label: 'Voice',
      transcript: '“Service road is clear. We left the spare belt in the cabinet by the door. No need to come out tonight. We can still see your light.”' }
  ];
  let dialog, ui, returnFocus, opened = false, frequency = 6800;
  let listening = false, spoken = false, sound = false, motion = true, busy = false;
  let engine, activeBand = null, strength = 0, operation = 0, tuneTimer, voiceTimer;
  let pointer = null, speechOwned = false, speechGeneration = 0, lastSpoken = null, audioError = '';

  class ReceiverAudio {
    constructor() {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable');
      const c = this.context = new Context();
      this.master = c.createGain(); this.master.gain.value = 0;
      const compressor = c.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.ratio.value = 4;
      this.master.connect(compressor).connect(c.destination);
      this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
      this.filter = c.createBiquadFilter(); this.filter.type = 'bandpass';
      this.filter.frequency.value = 1700; this.filter.Q.value = .55;
      const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const data = buffer.getChannelData(0); let seed = 7145;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
      this.source = c.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
      this.source.connect(this.filter).connect(this.noiseGain).connect(this.master); this.source.start();
      this.musicGain = c.createGain(); this.musicGain.gain.value = 0;
      const speaker = c.createBiquadFilter(); speaker.type = 'lowpass'; speaker.frequency.value = 2600;
      this.musicGain.connect(speaker).connect(this.master);
      this.notes = new Set(); this.step = 0; this.nextNote = 0; this.band = null; this.timer = null;
    }
    reception(band, signal) {
      const c = this.context;
      this.noiseGain.gain.setTargetAtTime(.016 + (1 - signal) * .09, c.currentTime, .1);
      this.filter.frequency.setTargetAtTime(950 + ((frequency - MIN) / (MAX - MIN)) * 1700, c.currentTime, .12);
      this.musicGain.gain.setTargetAtTime(band?.id === 'music' ? signal * .17 : 0, c.currentTime, .14);
      if (this.band !== band?.id) { this.step = 0; this.nextNote = c.currentTime + .12; }
      this.band = band?.id || null;
    }
    async start() {
      await this.context.resume();
      if (this.context.state !== 'running') throw new Error('Audio did not start');
      this.master.gain.setTargetAtTime(.55, this.context.currentTime, .12);
      if (!this.timer) {
        this.nextNote = this.context.currentTime + .1;
        this.timer = window.setInterval(() => this.schedule(), 100);
      }
    }
    schedule() {
      const c = this.context;
      if (c.state !== 'running' || this.band !== 'music') return;
      // A deliberately small melody, with a pause where a distant signal falls away.
      const melody = [146.83, null, 220, 293.66, 261.63, null, 220, 164.81, 196, null, 220, 146.83, null, null, null, null];
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + .05;
      while (this.nextNote < c.currentTime + .22) {
        const pitch = melody[this.step++ % melody.length];
        if (pitch) this.note(pitch, this.nextNote);
        this.nextNote += .49;
      }
    }
    note(pitch, at) {
      const c = this.context, oscillator = c.createOscillator(), gain = c.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = pitch;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.8, at + .025);
      gain.gain.exponentialRampToValueAtTime(.001, at + 1.25);
      oscillator.connect(gain).connect(this.musicGain);
      this.notes.add(oscillator);
      oscillator.onended = () => { this.notes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 1.3);
    }
    stop() {
      clearInterval(this.timer); this.timer = null;
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
      this.notes.forEach(note => { try { note.stop(); } catch { /* Already ended. */ } });
      this.notes.clear();
      if (this.context.state !== 'closed') this.context.suspend().catch(() => {});
    }
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'radioDialog'; dialog.className = 'radio-dialog';
    dialog.setAttribute('aria-labelledby', 'radioTitle');
    dialog.innerHTML = `
      <div class="radio-heading"><h2 id="radioTitle">Shortwave radio</h2><button type="button" class="radio-close" aria-label="Close shortwave radio">Close <span aria-hidden="true">Esc</span></button></div>
      <div class="radio-handle" aria-hidden="true"></div>
      <section class="radio-case" aria-label="Portable shortwave receiver">
        <span class="radio-screw radio-screw-tl" aria-hidden="true"></span><span class="radio-screw radio-screw-tr" aria-hidden="true"></span><span class="radio-screw radio-screw-bl" aria-hidden="true"></span><span class="radio-screw radio-screw-br" aria-hidden="true"></span>
        <div class="radio-maker"><span class="radio-brand">Mojave</span><span class="radio-model">FIELD RECEIVER · SW / 1</span></div>
        <div class="radio-scale" aria-hidden="true"><div class="radio-scale-numbers"><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span></div><div class="radio-scale-ticks"></div><div class="radio-scale-stations"><span style="--station:9.09%">WX</span><span style="--station:37.5%">MUSIC</span><span style="--station:76.14%">RELAY</span></div><span class="radio-scale-unit">MHz</span><i class="radio-needle"></i></div>
        <div class="radio-hardware">
          <div class="radio-speaker" aria-hidden="true"><div class="radio-speaker-grille"></div><span>LONG DISTANCE</span></div>
          <div class="radio-tuning">
            <div class="radio-meter" aria-hidden="true"><svg viewBox="0 0 180 78"><path class="radio-meter-arc" d="M 27 55 A 83 83 0 0 1 153 55"/><path class="radio-meter-ticks" d="M27 55l7 6m14-24 5 8m17-17 2 9m18-12v10m20-7-2 9m24 0-5 8m26 10-7 6"/><text x="24" y="74">0</text><text x="85" y="23">5</text><text x="149" y="74">10</text><line class="radio-meter-pointer" x1="90" y1="105" x2="90" y2="34"/><circle cx="90" cy="105" r="4"/></svg><span>SIGNAL</span></div>
            <output class="radio-frequency" for="radioFrequency"><span class="radio-frequency-value">6.80</span><span>MHz</span></output>
            <div class="radio-knob" role="slider" tabindex="0" aria-label="Tuning knob" aria-valuemin="5.8" aria-valuemax="10.2" aria-valuenow="6.8" aria-valuetext="6.80 megahertz, static" aria-describedby="radioKnobHelp"><span class="radio-knob-face"><i></i></span></div>
            <span class="radio-knob-label" aria-hidden="true">TUNING</span>
          </div>
        </div>
        <div class="radio-controls"><button type="button" class="radio-listen" aria-pressed="false"><span class="radio-power-light" aria-hidden="true"></span><span class="radio-listen-label">Listen</span></button><p id="radioKnobHelp">Drag the dial or use the arrow keys.</p></div>
        <div class="radio-range-row"><label for="radioFrequency">Fine tune</label><input id="radioFrequency" type="range" min="5800" max="10200" step="10" value="6800" aria-valuetext="6.80 megahertz, static"><span aria-hidden="true">SW</span></div>
      </section>
      <nav class="radio-presets" aria-label="Known frequencies">${bands.map(b => `<button type="button" data-radio-band="${b.id}"><span>${(b.frequency / 1000).toFixed(2)}</span> ${b.label}</button>`).join('')}</nav>
      <div class="radio-transmission"><div class="radio-transmission-heading"><h3 class="radio-channel">Between stations</h3><button type="button" class="radio-spoken" aria-pressed="false">Spoken bulletins off</button></div><p class="radio-transcript" aria-live="polite" aria-atomic="true">Only static here. Try one of the penciled-in frequencies.</p><p class="radio-status" role="status">Sound is off. You can still tune and read transmissions.</p><p class="radio-fiction">Fictional broadcasts. Original synthesized music and static.</p></div>`;
    document.body.append(dialog);
    ui = {
      knob: dialog.querySelector('.radio-knob'), range: dialog.querySelector('#radioFrequency'),
      value: dialog.querySelector('.radio-frequency-value'), needle: dialog.querySelector('.radio-needle'),
      meter: dialog.querySelector('.radio-meter-pointer'), channel: dialog.querySelector('.radio-channel'),
      transcript: dialog.querySelector('.radio-transcript'), status: dialog.querySelector('.radio-status'),
      listen: dialog.querySelector('.radio-listen'), listenLabel: dialog.querySelector('.radio-listen-label'),
      spoken: dialog.querySelector('.radio-spoken'), close: dialog.querySelector('.radio-close')
    };
    ui.close.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', finishClose);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    });
    ui.listen.addEventListener('click', async () => {
      if (listening) { listening = false; ++operation; stopPlayback(); paint(); }
      else await beginListening();
    });
    ui.spoken.addEventListener('click', async () => {
      spoken = !spoken;
      if (!spoken) cancelSpeech();
      else if (!listening) await beginListening();
      paint(); scheduleSpeech(250);
    });
    ui.range.addEventListener('input', () => tune(Number(ui.range.value)));
    dialog.querySelectorAll('[data-radio-band]').forEach(button => button.addEventListener('click', () => {
      tune(bands.find(b => b.id === button.dataset.radioBand).frequency);
    }));
    ui.knob.addEventListener('keydown', event => {
      let next = frequency;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += STEP;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= STEP;
      else if (event.key === 'PageUp') next += 100;
      else if (event.key === 'PageDown') next -= 100;
      else if (event.key === 'Home') next = MIN;
      else if (event.key === 'End') next = MAX;
      else return;
      event.preventDefault(); tune(next);
    });
    ui.knob.addEventListener('pointerdown', event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); ui.knob.focus({ preventScroll: true });
      const r = ui.knob.getBoundingClientRect();
      pointer = { id: event.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2, value: frequency, angle: 0, lastX: event.clientX, lastY: event.clientY };
      pointer.linear = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 20;
      pointer.angle = pointerAngle(event); ui.knob.classList.add('is-turning');
      try { ui.knob.setPointerCapture(event.pointerId); } catch { releasePointer(); }
    });
    ui.knob.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const angle = pointerAngle(event); let delta = angle - pointer.angle;
      if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
      const change = pointer.linear ? ((event.clientX - pointer.lastX) - (event.clientY - pointer.lastY)) * 12 : delta * (MAX - MIN) / 270;
      pointer.angle = angle; pointer.lastX = event.clientX; pointer.lastY = event.clientY;
      pointer.value = Math.max(MIN, Math.min(MAX, pointer.value + change));
      tune(pointer.value);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.knob.addEventListener(name, releasePointer);
  }

  function pointerAngle(event) { return Math.atan2(event.clientX - pointer.x, pointer.y - event.clientY) * 180 / Math.PI; }
  function releasePointer(event) {
    if (!pointer || (event && event.pointerId !== pointer.id)) return;
    const id = pointer.id; pointer = null;
    ui?.knob.classList.remove('is-turning');
    try { if (ui.knob.hasPointerCapture(id)) ui.knob.releasePointerCapture(id); } catch { /* Capture already released. */ }
  }
  function settings() {
    const current = window.StationControls?.getState?.();
    if (current) applySettings(current);
  }
  function applySettings(current) {
    if (typeof current.sound === 'boolean') sound = current.sound;
    if (typeof current.motion === 'boolean') motion = current.motion;
    if (typeof current.busy === 'boolean') busy = current.busy;
  }
  function canPlay() { return opened && listening && sound && !busy && !document.hidden; }
  function tune(value) {
    const previous = activeBand?.id;
    frequency = Math.max(MIN, Math.min(MAX, Math.round(value / STEP) * STEP));
    activeBand = bands.find(b => Math.abs(b.frequency - frequency) <= 100) || null;
    strength = activeBand ? Math.max(0, 1 - Math.abs(activeBand.frequency - frequency) / 140) : 0;
    engine?.reception(activeBand, strength);
    if (previous !== activeBand?.id) {
      cancelSpeech(); lastSpoken = null;
      clearTimeout(tuneTimer);
      // Wait for the dial to settle before replacing a screen reader's transcript.
      tuneTimer = window.setTimeout(() => { updateTranscript(); scheduleSpeech(1200); }, 300);
    }
    paint();
  }
  function updateTranscript() {
    if (!ui) return;
    ui.channel.textContent = activeBand?.name || 'Between stations';
    ui.transcript.textContent = activeBand?.transcript || 'Only static here. Try one of the penciled-in frequencies.';
  }
  function paint() {
    if (!ui) return;
    const fraction = (frequency - MIN) / (MAX - MIN), playing = canPlay();
    const valueText = `${(frequency / 1000).toFixed(2)} megahertz, ${activeBand?.name || 'static'}`;
    dialog.classList.toggle('radio-powered', playing);
    dialog.classList.toggle('radio-reduced', !motion);
    ui.value.textContent = (frequency / 1000).toFixed(2);
    ui.range.value = String(frequency); ui.range.setAttribute('aria-valuetext', valueText);
    ui.knob.setAttribute('aria-valuenow', String(frequency / 1000)); ui.knob.setAttribute('aria-valuetext', valueText);
    ui.knob.style.setProperty('--tuning-angle', `${-135 + fraction * 270}deg`);
    ui.needle.style.left = `${fraction * 100}%`;
    ui.meter.style.transform = `rotate(${-54 + strength * 108}deg)`;
    ui.listen.setAttribute('aria-pressed', String(listening));
    ui.listenLabel.textContent = listening ? 'Stop listening' : 'Listen';
    ui.spoken.setAttribute('aria-pressed', String(spoken));
    ui.spoken.textContent = spoken ? 'Spoken bulletins on' : 'Spoken bulletins off';
    dialog.querySelectorAll('[data-radio-band]').forEach(button => button.setAttribute('aria-pressed', String(activeBand?.id === button.dataset.radioBand)));
    if (audioError) ui.status.textContent = audioError;
    else if (busy) ui.status.textContent = 'Power interrupted. The receiver will return with the station.';
    else if (!sound) ui.status.textContent = 'Sound is off. Listen enables station sound; transcripts are always available.';
    else if (!listening) ui.status.textContent = 'Receiver silent. Choose Listen to hear the signal.';
    else if (document.hidden) ui.status.textContent = 'Listening paused while this tab is hidden.';
    else if (spoken && !localVoice()) ui.status.textContent = 'No local speech voice is available. Read the transmission below the dial.';
    else ui.status.textContent = activeBand ? `${Math.round(strength * 100)}% signal. ${activeBand.id === 'music' ? 'An original instrumental, caught on repeat.' : spoken ? 'Spoken transmissions enabled.' : 'Read the transmission, or turn spoken bulletins on.'}` : 'Searching the shortwave band. Static is part of the signal.';
  }
  async function beginListening() {
    const token = ++operation;
    audioError = ''; ui.listen.disabled = true;
    try {
      settings();
      if (!sound) {
        if (!window.StationControls?.setSound) throw new Error('controls');
        await window.StationControls.setSound(true); settings();
        if (!sound) throw new Error('controls');
      }
      if (!opened || token !== operation) return;
      listening = true;
      if (!engine) engine = new ReceiverAudio();
      engine.reception(activeBand, strength);
      if (canPlay()) await engine.start();
      if (!opened || token !== operation || !canPlay()) engine.stop();
      else scheduleSpeech(650);
    } catch {
      listening = false; engine?.stop();
      audioError = 'Audio could not start. You can keep tuning and reading; choose Listen to retry.';
    } finally {
      ui.listen.disabled = false; paint();
    }
  }
  function localVoice() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return null;
    return window.speechSynthesis.getVoices().find(voice => voice.localService && /^en(?:-|_)/i.test(voice.lang)) || null;
  }
  function cancelSpeech() {
    clearTimeout(voiceTimer); voiceTimer = null;
    ++speechGeneration;
    if (speechOwned && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    speechOwned = false;
  }
  function scheduleSpeech(delay = 1200) {
    clearTimeout(voiceTimer);
    if (!canPlay() || !spoken || speechOwned || !activeBand || activeBand.id === 'music') return;
    voiceTimer = window.setTimeout(speak, delay);
  }
  function speak() {
    if (!canPlay() || !spoken || !activeBand || activeBand.id === 'music') return;
    const voice = localVoice();
    if (!voice) { paint(); return; }
    const band = activeBand;
    const generation = speechGeneration;
    const utterance = new SpeechSynthesisUtterance(band.transcript.replace(/[“”]/g, ''));
    utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = band.id === 'voice' ? .87 : .93;
    utterance.pitch = band.id === 'voice' ? .78 : .92; utterance.volume = band.id === 'voice' ? .42 : .55;
    utterance.onend = () => {
      if (generation !== speechGeneration) return;
      speechOwned = false;
      if (canPlay() && activeBand === band) scheduleSpeech(band.id === 'voice' ? 45000 : 60000);
    };
    utterance.onerror = () => {
      if (generation !== speechGeneration) return;
      speechOwned = false;
      if (opened) { audioError = 'Spoken audio is unavailable. The full transmission is printed here.'; paint(); }
    };
    speechOwned = true; lastSpoken = band.id; window.speechSynthesis.speak(utterance);
  }
  function stopPlayback() { cancelSpeech(); engine?.stop(); }
  async function syncPlayback() {
    if (!canPlay()) { stopPlayback(); paint(); return; }
    if (engine) {
      try { await engine.start(); if (!canPlay()) engine.stop(); else scheduleSpeech(); }
      catch { audioError = 'Audio is paused by the browser. Stop listening, then choose Listen to retry.'; }
    }
    paint();
  }
  function open(options = {}) {
    if (opened) return;
    if (!dialog) build();
    settings(); returnFocus = options.returnFocus || document.activeElement;
    opened = true; audioError = ''; dialog.showModal();
    tune(frequency); updateTranscript(); paint(); ui.knob.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('stationradio:open'));
  }
  function finishClose() {
    if (!opened) return;
    opened = false; listening = false; ++operation;
    clearTimeout(tuneTimer); stopPlayback(); releasePointer(); paint();
    document.dispatchEvent(new CustomEvent('stationradio:close'));
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  function close() { if (dialog?.open) dialog.close(); finishClose(); }

  document.addEventListener('station:settings', event => {
    applySettings(event.detail || {});
    if (opened) syncPlayback();
  });
  document.addEventListener('visibilitychange', () => { if (opened) syncPlayback(); });
  window.addEventListener('pagehide', () => { ++operation; stopPlayback(); releasePointer(); });
  if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', () => {
    if (!opened) return;
    paint(); if (spoken && !lastSpoken) scheduleSpeech();
  });
  window.StationRadio = {
    open, close,
    getState: () => ({ open: opened, frequencyKHz: frequency, frequencyMHz: frequency / 1000,
      band: activeBand?.id || null, signal: strength, listening, spoken, sound, motion, busy,
      audioState: engine?.context.state || 'uninitialized' })
  };
})();
