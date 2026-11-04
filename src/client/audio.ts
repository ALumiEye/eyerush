import { recall, remember } from "./i18n";

/**
 * Every sound is synthesised live with Web Audio: the engine, horns, crashes and the city itself,
 * a bed of traffic noise with horns going off all around. No audio files are shipped.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private engine: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private bed: GainNode | null = null;
  private nextHonk = 0;
  enabled = recall("sound") !== "off";

  /** Audio can only start after the player touches something. */
  wake() {
    if (!this.ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    remember("sound", on ? "on" : "off");
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  private get now() {
    return this.ctx!.currentTime;
  }

  private noiseSource(filterType: BiquadFilterType, frequency: number, q = 1) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.loopStart = Math.random();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain);
    return { source, filter, gain };
  }

  private panned(node: AudioNode, pan: number) {
    const panner = this.ctx!.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner).connect(this.master);
  }

  /** Engine and city bed, running for as long as a race is on screen. */
  startRace() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = "sawtooth";
    b.type = "square";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.5;
    a.connect(filter);
    b.connect(bGain).connect(filter);
    filter.connect(gain).connect(this.master);
    a.start();
    b.start();
    this.engine = { a, b, filter, gain };

    const bed = this.noiseSource("bandpass", 380, 0.6);
    bed.gain.gain.value = 0.05;
    bed.gain.connect(this.master);
    bed.source.start();
    this.bed = bed.gain;
  }

  stopRace() {
    if (!this.ctx) return;
    if (this.engine) {
      const { a, b, gain } = this.engine;
      gain.gain.setTargetAtTime(0, this.now, 0.05);
      a.stop(this.now + 0.3);
      b.stop(this.now + 0.3);
      this.engine = null;
    }
    if (this.bed) {
      this.bed.gain.setTargetAtTime(0, this.now, 0.1);
      const bed = this.bed;
      setTimeout(() => bed.disconnect(), 600);
      this.bed = null;
    }
  }

  /** Called every frame with the player's speed (m/s), throttle and whether boost is on. */
  update(speed: number, throttle: number, boosting: boolean, crashed: boolean) {
    if (!this.ctx || !this.engine) return;
    const { a, b, filter, gain } = this.engine;
    // A small engine through a few gears: pitch climbs, drops at each change, climbs again.
    const gear = Math.min(3, Math.floor(Math.abs(speed) / 8));
    const within = Math.abs(speed) - gear * 8;
    const pitch = 34 + gear * 9 + within * 6.5 + (boosting ? 18 : 0);
    const time = this.now;
    a.frequency.setTargetAtTime(pitch, time, 0.04);
    b.frequency.setTargetAtTime(pitch * 0.5, time, 0.04);
    filter.frequency.setTargetAtTime(400 + Math.abs(speed) * 55 + Math.max(0, throttle) * 500, time, 0.05);
    const level = crashed ? 0.02 : 0.05 + Math.max(0, throttle) * 0.05 + (boosting ? 0.04 : 0);
    gain.gain.setTargetAtTime(level, time, 0.06);

    // The city: horns from every direction, near and far.
    if (time > this.nextHonk) {
      this.nextHonk = time + 0.35 + Math.random() * 1.6;
      this.horn(330 + Math.random() * 380, 0.012 + Math.random() * 0.03, Math.random() * 2 - 1, Math.random() < 0.3 ? 2 : 1);
    }
  }

  /** A motorbike horn: two square tones a third apart, slightly buzzy. */
  horn(pitch = 440, level = 0.12, pan = 0, beeps = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < beeps; i += 1) {
      const start = this.now + i * 0.17;
      const length = beeps > 1 ? 0.12 : 0.24;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.01);
      gain.gain.setValueAtTime(level, start + length - 0.03);
      gain.gain.linearRampToValueAtTime(0, start + length);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2600;
      filter.connect(gain);
      for (const ratio of [1, 1.26]) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = pitch * ratio;
        osc.connect(filter);
        osc.start(start);
        osc.stop(start + length + 0.02);
      }
      this.panned(gain, pan);
    }
  }

  private burst(type: BiquadFilterType, from: number, to: number, length: number, level: number, pan = 0) {
    if (!this.ctx) return;
    const { source, filter, gain } = this.noiseSource(type, from, 0.8);
    const time = this.now;
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), time + length);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    this.panned(gain, pan);
    source.start(time);
    source.stop(time + length + 0.05);
  }

  private tone(type: OscillatorType, from: number, to: number, length: number, level: number, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const time = this.now + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    osc.connect(gain).connect(this.master);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  crash(level = 1, pan = 0) {
    this.burst("lowpass", 3000, 200, 0.5, 0.5 * level, pan);
    this.tone("sine", 110, 40, 0.35, 0.5 * level);
    this.tone("square", 1400, 260, 0.12, 0.08 * level);
    this.tone("triangle", 900, 700, 0.3, 0.05 * level, 0.08);
  }

  bump(strength: number) {
    const level = Math.min(1, strength / 9);
    this.burst("lowpass", 900, 150, 0.14, 0.25 * level);
    this.tone("sine", 140, 60, 0.12, 0.25 * level);
  }

  nearMiss(combo: number) {
    this.burst("bandpass", 2600, 500, 0.28, 0.22);
    this.tone("sine", 880 * (1 + Math.min(combo, 8) * 0.06), 880 * (1 + Math.min(combo, 8) * 0.06), 0.15, 0.06, 0.04);
  }

  boost() {
    this.burst("bandpass", 300, 3000, 0.6, 0.18);
    this.tone("sawtooth", 120, 420, 0.5, 0.05);
  }

  splash() {
    this.burst("lowpass", 1800, 120, 0.8, 0.45);
  }

  gate() {
    this.tone("sine", 990, 990, 0.12, 0.08);
  }

  lap() {
    this.tone("triangle", 660, 660, 0.15, 0.12);
    this.tone("triangle", 990, 990, 0.25, 0.12, 0.12);
  }

  finish(place: number) {
    const notes = place === 1 ? [523, 659, 784, 1047] : [523, 659, 784];
    notes.forEach((note, i) => this.tone("triangle", note, note, 0.3, 0.14, i * 0.12));
  }

  count(value: number) {
    if (value > 0) this.tone("square", 440, 440, 0.15, 0.08);
    else this.tone("square", 880, 880, 0.4, 0.1);
  }

  click() {
    this.tone("square", 600, 600, 0.04, 0.04);
  }
}
