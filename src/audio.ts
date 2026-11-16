/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebAudio-synthesised sound effects. No audio files, no network.
 * The context is created lazily on the first user gesture so browsers
 * do not block it, and stays suspended until then.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Create/resume the context. Safe to call on every gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(m ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  private tone(
    freq0: number,
    freq1: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || this._muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(
    dur: number,
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    vol: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuf || this._muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(20, f0), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  jump(): void {
    this.noise(0.28, 'bandpass', 500, 2400, 0.32);
    this.tone(280, 620, 0.18, 'sine', 0.1);
  }

  coin(): void {
    this.tone(1318, 1318, 0.07, 'sine', 0.22);
    this.tone(1760, 1760, 0.14, 'sine', 0.2, 0.07);
  }

  crash(): void {
    this.tone(130, 32, 0.5, 'sine', 0.5);
    this.noise(0.35, 'lowpass', 900, 120, 0.5);
  }

  powerup(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, f, 0.12, 'triangle', 0.2, i * 0.08),
    );
  }

  nearMiss(): void {
    this.noise(0.2, 'highpass', 900, 3600, 0.22);
  }

  land(): void {
    this.noise(0.12, 'lowpass', 500, 150, 0.18);
  }

  click(): void {
    this.tone(700, 900, 0.06, 'sine', 0.12);
  }
}
