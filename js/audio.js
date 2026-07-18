// ===== PROCEDURAL AUDIO =====
export class AudioManager {
  constructor() { this.ctx = null; this.initialized = false; this.master = null; }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
    this.initialized = true;
  }

  _noise(duration, gain = 0.3) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * duration, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(g);
    return { src, gain: g };
  }

  _tone(freq, duration, type = 'square', gain = 0.2) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    return { osc, gain: g, dur: duration };
  }

  _play(nodes) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    nodes.forEach(n => {
      n.gain.connect(this.master);
      (n.src || n.osc).start(t);
      (n.src || n.osc).stop(t + (n.dur || 0.5));
    });
  }

  playShoot(type) {
    if (!this.initialized) return;
    if (type === 'assault_rifle') {
      const n = this._noise(0.08, 0.5);
      const t = this._tone(150, 0.06, 'sawtooth', 0.3);
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
      n.gain.connect(hp); hp.connect(this.master);
      n.src.start(); n.src.stop(this.ctx.currentTime + 0.08);
      t.gain.connect(this.master); t.osc.start(); t.osc.stop(this.ctx.currentTime + 0.06);
    } else if (type === 'smg') {
      const n = this._noise(0.05, 0.4);
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
      n.gain.connect(hp); hp.connect(this.master);
      n.src.start(); n.src.stop(this.ctx.currentTime + 0.05);
    } else {
      const n = this._noise(0.2, 0.7);
      const t = this._tone(80, 0.3, 'sawtooth', 0.4);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      n.gain.connect(lp); lp.connect(this.master);
      n.src.start(); n.src.stop(this.ctx.currentTime + 0.2);
      t.gain.connect(this.master); t.osc.start(); t.osc.stop(this.ctx.currentTime + 0.3);
    }
  }

  playReload() {
    if (!this.initialized) return;
    const t1 = this._tone(800, 0.05, 'square', 0.15);
    const t2 = this._tone(600, 0.05, 'square', 0.15);
    t1.gain.connect(this.master); t1.osc.start(); t1.osc.stop(this.ctx.currentTime + 0.05);
    t2.gain.connect(this.master); t2.osc.start(this.ctx.currentTime + 0.15); t2.osc.stop(this.ctx.currentTime + 0.2);
  }

  playHit() {
    if (!this.initialized) return;
    const t = this._tone(1200, 0.08, 'sine', 0.2);
    t.gain.connect(this.master); t.osc.start(); t.osc.stop(this.ctx.currentTime + 0.08);
  }

  playHeadshot() {
    if (!this.initialized) return;
    const t = this._tone(2000, 0.12, 'sine', 0.25);
    t.gain.connect(this.master); t.osc.start(); t.osc.stop(this.ctx.currentTime + 0.12);
  }

  playExplosion() {
    if (!this.initialized) return;
    const n = this._noise(0.6, 0.6);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    n.gain.connect(lp); lp.connect(this.master);
    n.src.start(); n.src.stop(this.ctx.currentTime + 0.6);
  }

  playPickup() {
    if (!this.initialized) return;
    const t1 = this._tone(600, 0.1, 'sine', 0.15);
    const t2 = this._tone(900, 0.1, 'sine', 0.15);
    t1.gain.connect(this.master); t1.osc.start(); t1.osc.stop(this.ctx.currentTime + 0.1);
    t2.gain.connect(this.master); t2.osc.start(this.ctx.currentTime + 0.1); t2.osc.stop(this.ctx.currentTime + 0.2);
  }

  playDamage() {
    if (!this.initialized) return;
    const n = this._noise(0.1, 0.3);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    n.gain.connect(lp); lp.connect(this.master);
    n.src.start(); n.src.stop(this.ctx.currentTime + 0.1);
  }

  playKillStreak() {
    if (!this.initialized) return;
    [400, 600, 800, 1000].forEach((f, i) => {
      const t = this._tone(f, 0.15, 'square', 0.15);
      t.gain.connect(this.master);
      t.osc.start(this.ctx.currentTime + i * 0.12);
      t.osc.stop(this.ctx.currentTime + i * 0.12 + 0.15);
    });
  }

  playMenuClick() {
    if (!this.initialized) return;
    const t = this._tone(1000, 0.04, 'sine', 0.1);
    t.gain.connect(this.master); t.osc.start(); t.osc.stop(this.ctx.currentTime + 0.04);
  }

  playWaveStart() {
    if (!this.initialized) return;
    const t1 = this._tone(300, 0.3, 'sawtooth', 0.2);
    const t2 = this._tone(450, 0.3, 'sawtooth', 0.2);
    t1.gain.connect(this.master); t1.osc.start(); t1.osc.stop(this.ctx.currentTime + 0.3);
    t2.gain.connect(this.master); t2.osc.start(this.ctx.currentTime + 0.35); t2.osc.stop(this.ctx.currentTime + 0.65);
  }

  playKillHype() {
    if (!this.initialized) return;
    // High energy arp/bass drop sound for a kill
    [800, 1000, 1200].forEach((f, i) => {
      const t = this._tone(f, 0.1, 'sawtooth', 0.15);
      t.gain.connect(this.master);
      t.osc.start(this.ctx.currentTime + i * 0.08);
      t.osc.stop(this.ctx.currentTime + i * 0.08 + 0.1);
    });
    const sub = this._tone(60, 0.4, 'sine', 0.4);
    sub.gain.connect(this.master);
    sub.osc.start(this.ctx.currentTime + 0.1);
    sub.osc.stop(this.ctx.currentTime + 0.5);
  }
}
