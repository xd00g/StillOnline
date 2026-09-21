'use strict';
// Neutral-white illumination multipliers preserve the live video texture and geometry.
// A shuffled bag distributes faults; no fixture repeats at a rotation boundary.
class PracticalFlicker {
  constructor(scene, enabled, random = Math.random) {
    this.enabled = enabled; this.random = random; this.bag = []; this.last = null;
    this.timer = 0; this.animation = null; this.generation = 0;
    this.names = ['awning-west', 'awning-east', 'interior', 'sign'];
    this.plates = this.names.map(name => {
      const image = new Image(); image.className = 'film practical-flicker';
      image.alt = ''; image.setAttribute('aria-hidden', 'true');
      image.src = `assets/light-mask-${name}.webp`; image.style.opacity = '0';
      scene.insertBefore(image, scene.querySelector('.hotspots'));
      return image;
    });
  }
  next() {
    if (!this.bag.length) {
      this.bag = this.names.map((_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.at(-1) === this.last) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag.at(-1), this.bag[0]];
    }
    this.last = this.bag.pop(); return this.last;
  }
  sync() {
    clearTimeout(this.timer); this.timer = 0; this.generation++;
    this.animation?.cancel(); this.animation = null;
    this.plates.forEach(p => p.style.opacity = '0');
    if (this.enabled()) this.schedule();
  }
  schedule() {
    if (!this.enabled()) return;
    this.timer = setTimeout(() => this.pulse(), 8000 + this.random() * 14000);
  }
  pattern(name) {
    const between = (min, max) => min + this.random() * (max - min);
    const states = [];
    const hold = (opacity, ms) => states.push({opacity, ms});
    hold(0, between(60, 130));
    // Contact break, failed strike, then an uneven attempt to stay lit.
    hold(1, between(80, 220));
    hold(between(.55, .8), between(28, 65));
    hold(1, between(35, 100));
    hold(0, between(100, 310));
    const attempts = name === 'sign' ? 2 + Math.floor(this.random() * 3) : 4 + Math.floor(this.random() * 5);
    for (let i = 0; i < attempts; i++) {
      hold(1, between(24, i === 1 ? 290 : 110));
      hold(this.random() < .65 ? 0 : between(.3, .7), between(28, 160));
    }
    // A short stable stretch, one last contact failure, then full recovery.
    hold(0, between(160, 320)); hold(1, between(35, 85)); hold(0, between(120, 240));
    const duration = states.reduce((sum, state) => sum + state.ms, 0);
    let elapsed = 0;
    const frames = states.map(state => {
      const frame = {opacity:state.opacity, offset:elapsed / duration, easing:'steps(1, end)'};
      elapsed += state.ms; return frame;
    });
    frames.push({opacity:0, offset:1});
    return {frames, duration};
  }
  async pulse() {
    this.timer = 0;
    if (!this.enabled()) return;
    const generation = this.generation, index = this.next(), image = this.plates[index];
    try { await image.decode(); } catch { if (generation === this.generation) this.schedule(); return; }
    if (generation !== this.generation || !this.enabled()) return;
    const {frames, duration} = this.pattern(this.names[index]);
    this.animation = image.animate(frames, {duration, easing:'linear'});
    document.dispatchEvent(new CustomEvent('station:flicker', {detail:{fixture:this.names[index],duration,cutouts:frames.filter(f=>f.opacity===1).length}}));
    try { await this.animation.finished; } catch { return; }
    this.animation = null;
    if (generation === this.generation) this.schedule();
  }
}
