/**
 * Procedural Web Audio API Campus Soundscape for "Days in Islamic Uni"
 * (Islamic University, Kushtia, Bangladesh).
 *
 * Zero external audio assets required — 100% synthesized on the fly and
 * completely safe in headless Node environments where AudioContext is absent.
 *
 * Layers:
 *  1. Tropical Campus Breeze (bandpass brown/pink noise + slow LFO gust modulation + lake shimmer)
 *  2. Bangladeshi Campus Birdsong (organic koel, myna & distant songbird calls, calm at dusk)
 *  3. Subtle Hub Ambience (warm distant outdoor courtyard resonance near plazas/gate/cafeteria)
 *  4. Surface-Aware Footstep Foley (asphalt, bridge, grass — cadence scaled to walk/sprint speed)
 *  5. Smooth Vehicle Audio (electric van motor hum vs IU Red Double-Decker Bus diesel rumble)
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const TIME_OF_DAY_PROFILES = Object.freeze({
  morning: Object.freeze({
    birdGain: 1.0,
    birdMinInterval: 4.0,
    birdMaxInterval: 8.5,
    breezeScale: 1.0,
    hubScale: 0.95,
  }),
  noon: Object.freeze({
    birdGain: 0.65,
    birdMinInterval: 5.5,
    birdMaxInterval: 10.5,
    breezeScale: 1.08,
    hubScale: 1.0,
  }),
  midday: Object.freeze({
    birdGain: 0.65,
    birdMinInterval: 5.5,
    birdMaxInterval: 10.5,
    breezeScale: 1.08,
    hubScale: 1.0,
  }),
  golden: Object.freeze({
    birdGain: 0.94,
    birdMinInterval: 4.2,
    birdMaxInterval: 9.5,
    breezeScale: 1.0,
    hubScale: 1.0,
  }),
  dusk: Object.freeze({
    birdGain: 0.22,
    birdMinInterval: 9.5,
    birdMaxInterval: 15.0,
    breezeScale: 0.82,
    hubScale: 0.65,
  }),
  night: Object.freeze({
    birdGain: 0.14,
    birdMinInterval: 11.0,
    birdMaxInterval: 18.0,
    breezeScale: 0.78,
    hubScale: 0.45,
  }),
});

const BIRD_TYPES = Object.freeze(['koel', 'myna', 'chirp']);

/** Smoothly ramp an AudioParam without clicks or pops across browsers and mocks. */
function rampParam(param, target, durationSec, now) {
  if (!param) return;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const dur = Math.max(0.005, Number.isFinite(durationSec) ? durationSec : 0.06);
  const t = Number.isFinite(now) ? now : 0;

  try {
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(t);
    }
    if (typeof param.setValueAtTime === 'function') {
      const current = Number.isFinite(param.value) ? param.value : safeTarget;
      param.setValueAtTime(current, t);
    }
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(safeTarget, t + dur);
    } else if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(safeTarget, t, dur / 3);
    } else {
      param.value = safeTarget;
    }
  } catch {
    try {
      param.value = safeTarget;
    } catch { /* Optional on partial audio contexts. */ }
  }
}

/** Generate a seamless looping warm pink/brown noise AudioBuffer. */
function createLoopingNoiseBuffer(ctx, durationSec = 3.0, random = Math.random) {
  const sampleRate = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? ctx.sampleRate : 44100;
  const length = Math.max(1024, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer?.getChannelData?.(0);
  if (!data) return buffer;

  // Paul Kellet pink filter blended with soft leaky brown integrator.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = (random() * 2 - 1);
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.095;
    b6 = white * 0.115926;

    brown = (brown + 0.024 * white) / 1.024;
    data[i] = clamp(pink * 0.58 + brown * 1.45, -0.95, 0.95);
  }

  // Smooth loop crossfade at the seam so continuous playback never clicks.
  const fadeSamples = Math.min(Math.floor(length * 0.06), Math.floor(sampleRate * 0.18));
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / Math.max(1, fadeSamples);
    const tailIndex = length - fadeSamples + i;
    data[tailIndex] = data[tailIndex] * (1 - t) + data[i] * t;
  }

  return buffer;
}

/** Generate a short pre-baked noise burst buffer for surface footstep foley. */
function createFoleyNoiseBuffer(ctx, durationSec = 0.16, random = Math.random) {
  const sampleRate = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? ctx.sampleRate : 44100;
  const length = Math.max(256, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer?.getChannelData?.(0);
  if (!data) return buffer;

  let prev = 0;
  for (let i = 0; i < length; i++) {
    const white = (random() * 2 - 1);
    const env = Math.pow(1 - i / length, 1.35);
    prev = prev * 0.35 + white * 0.65;
    data[i] = clamp(prev * env, -0.95, 0.95);
  }
  return buffer;
}

export class CampusAmbientAudio {
  constructor({ host = globalThis, random = Math.random, volume = 0.55 } = {}) {
    this.host = host;
    this.random = typeof random === 'function' ? random : Math.random;
    this.volume = Number.isFinite(Number(volume)) ? clamp(Number(volume), 0, 1) : 0.55;
    this.muted = false;
    this.suspended = false;
    this.unlocked = false;
    this.disposed = false;

    this.context = null;
    this._nodes = null;
    this._activeEffects = new Set();
    this._timers = new Set();

    // Runtime simulation state
    this._elapsed = 0;
    this._stepDistance = 0;
    this._stepParity = 1;
    this._birdTimer = this._nextBirdInterval('golden');
    this._lastBirdType = null;

    // Observable telemetry for diagnostics & unit testing
    this.footstepCount = 0;
    this.lastFootstepSurface = null;
    this.birdCallCount = 0;
    this.lastBirdType = null;
    this.lastBirdGain = 0;
    this.lastState = null;
  }

  get status() {
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      suspended: this.suspended,
      volume: this.volume,
      disposed: this.disposed,
      active: this._isAudible(),
      footstepCount: this.footstepCount,
      birdCallCount: this.birdCallCount,
    };
  }

  _rand() {
    const value = Number(this.random());
    return Number.isFinite(value) ? clamp(value, 0, 0.999999) : 0.5;
  }

  _profile(timeOfDay = 'golden') {
    const key = typeof timeOfDay === 'string' ? timeOfDay.toLowerCase() : 'golden';
    return TIME_OF_DAY_PROFILES[key] ?? TIME_OF_DAY_PROFILES.golden;
  }

  _nextBirdInterval(timeOfDay = 'golden') {
    const profile = this._profile(timeOfDay);
    return profile.birdMinInterval + this._rand() * (profile.birdMaxInterval - profile.birdMinInterval);
  }

  _effectiveVolume() {
    return (this.muted || this.suspended || this.disposed) ? 0 : this.volume;
  }

  _isAudible() {
    return Boolean(
      !this.disposed &&
      !this.muted &&
      !this.suspended &&
      this.unlocked &&
      this.volume > 0 &&
      this.context &&
      this.context.state === 'running' &&
      this._nodes
    );
  }

  _rampMasterGain(durationSec = 0.08) {
    if (!this.context || !this._nodes?.masterGain) return;
    rampParam(this._nodes.masterGain.gain, this._effectiveVolume(), durationSec, this.context.currentTime ?? 0);
  }

  _buildGraph() {
    if (this._nodes || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime ?? 0;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    // Pre-generated procedural noise buffers (zero external files)
    const loopNoiseBuffer = createLoopingNoiseBuffer(ctx, 3.0, () => this._rand());
    const foleyNoiseBuffer = createFoleyNoiseBuffer(ctx, 0.16, () => this._rand());

    // 1. Tropical Campus Breeze Bed + Slow LFO Gust Modulation
    const breezeSource = ctx.createBufferSource();
    breezeSource.buffer = loopNoiseBuffer;
    breezeSource.loop = true;

    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'bandpass';
    breezeFilter.frequency.value = 340;
    breezeFilter.Q.value = 0.75;

    const breezeGain = ctx.createGain();
    breezeGain.gain.value = 0.0001;

    const breezeLfo = ctx.createOscillator();
    breezeLfo.type = 'sine';
    breezeLfo.frequency.value = 0.11;

    const breezeLfoGain = ctx.createGain();
    breezeLfoGain.gain.value = 85;

    breezeLfo.connect(breezeLfoGain);
    breezeLfoGain.connect(breezeFilter.frequency);

    breezeSource.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(masterGain);

    // 1b. Subtle IU Lake / Water Breeze Air Layer (blends smoothly when nearWater)
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 780;
    waterFilter.Q.value = 1.35;

    const waterGain = ctx.createGain();
    waterGain.gain.value = 0;

    breezeSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(masterGain);

    // 3. Subtle Hub Ambience (warm distant outdoor plaza/gate resonance)
    const hubBandpass = ctx.createBiquadFilter();
    hubBandpass.type = 'bandpass';
    hubBandpass.frequency.value = 460;
    hubBandpass.Q.value = 1.6;

    const hubLowpass = ctx.createBiquadFilter();
    hubLowpass.type = 'lowpass';
    hubLowpass.frequency.value = 980;

    const hubGain = ctx.createGain();
    hubGain.gain.value = 0;

    breezeSource.connect(hubBandpass);
    hubBandpass.connect(hubLowpass);
    hubLowpass.connect(hubGain);
    hubGain.connect(masterGain);

    // 5a. Electric Van Audio (clean subtle electric motor whine/hum)
    const vanOsc = ctx.createOscillator();
    vanOsc.type = 'triangle';
    vanOsc.frequency.value = 95;

    const vanSubOsc = ctx.createOscillator();
    vanSubOsc.type = 'sine';
    vanSubOsc.frequency.value = 58;

    const vanSubGain = ctx.createGain();
    vanSubGain.gain.value = 0.45;

    const vanFilter = ctx.createBiquadFilter();
    vanFilter.type = 'lowpass';
    vanFilter.frequency.value = 340;
    vanFilter.Q.value = 1.1;

    const vanGain = ctx.createGain();
    vanGain.gain.value = 0;

    vanOsc.connect(vanFilter);
    vanSubOsc.connect(vanSubGain);
    vanSubGain.connect(vanFilter);
    vanFilter.connect(vanGain);
    vanGain.connect(masterGain);

    // 5b. IU Red Double-Decker Bus Audio (deep resonant diesel idle & rev rumble)
    const busOsc = ctx.createOscillator();
    busOsc.type = 'sawtooth';
    busOsc.frequency.value = 38;

    const busSubOsc = ctx.createOscillator();
    busSubOsc.type = 'triangle';
    busSubOsc.frequency.value = 24;

    const busSubGain = ctx.createGain();
    busSubGain.gain.value = 0.72;

    const busFilter = ctx.createBiquadFilter();
    busFilter.type = 'lowpass';
    busFilter.frequency.value = 145;
    busFilter.Q.value = 1.85;

    const busGain = ctx.createGain();
    busGain.gain.value = 0;

    busOsc.connect(busFilter);
    busSubOsc.connect(busSubGain);
    busSubGain.connect(busFilter);
    busFilter.connect(busGain);
    busGain.connect(masterGain);

    // Start continuous beds cleanly at current context time
    breezeSource.start(now);
    breezeLfo.start(now);
    vanOsc.start(now);
    vanSubOsc.start(now);
    busOsc.start(now);
    busSubOsc.start(now);

    this._nodes = {
      masterGain,
      loopNoiseBuffer,
      foleyNoiseBuffer,
      breezeSource,
      breezeFilter,
      breezeGain,
      breezeLfo,
      breezeLfoGain,
      waterFilter,
      waterGain,
      hubBandpass,
      hubLowpass,
      hubGain,
      vanOsc,
      vanSubOsc,
      vanSubGain,
      vanFilter,
      vanGain,
      busOsc,
      busSubOsc,
      busSubGain,
      busFilter,
      busGain,
      sources: [breezeSource, breezeLfo, vanOsc, vanSubOsc, busOsc, busSubOsc],
      disconnectables: [
        breezeSource, breezeFilter, breezeGain, breezeLfo, breezeLfoGain,
        waterFilter, waterGain,
        hubBandpass, hubLowpass, hubGain,
        vanOsc, vanSubOsc, vanSubGain, vanFilter, vanGain,
        busOsc, busSubOsc, busSubGain, busFilter, busGain,
        masterGain,
      ],
    };
  }

  /**
   * Unlock/create Web Audio context on a user gesture and start continuous ambient beds.
   * Safe no-op in headless Node environments without AudioContext.
   */
  async unlock() {
    if (this.disposed) return false;
    const AudioCtx = this.host?.AudioContext ?? this.host?.webkitAudioContext;
    if (!AudioCtx) return false;

    let resumePromise = null;
    try {
      if (!this.context) {
        this.context = new AudioCtx();
      }
      if (!this._nodes && this.context) {
        this._buildGraph();
      }
      if (!this.muted && !this.suspended && this.context?.state === 'suspended') {
        resumePromise = this.context.resume?.();
      }
    } catch {
      return false;
    }

    try {
      await resumePromise;
    } catch { /* Resume can reject without user gesture. */ }

    this.unlocked = Boolean(this.context && this.context.state === 'running');
    this._rampMasterGain(0.14);
    return this.unlocked && !this.muted && !this.suspended;
  }

  _tryResume() {
    if (this.disposed || this.muted || this.suspended || !this.context) return;
    if (this.context.state === 'suspended') {
      try {
        const res = this.context.resume?.();
        if (res && typeof res.then === 'function') {
          res.then(() => {
            if (!this.disposed && this.context?.state === 'running') {
              this.unlocked = true;
              this._rampMasterGain(0.08);
            }
          }).catch(() => {});
        }
      } catch { /* Optional. */ }
    } else if (this.context.state === 'running') {
      this.unlocked = true;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.disposed) return;
    this._tryResume();
    this._rampMasterGain(0.08);
  }

  setVolume(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this.volume = clamp(parsed, 0, 1);
    if (this.disposed) return;
    this._rampMasterGain(0.06);
  }

  setSuspended(suspended) {
    this.suspended = !!suspended;
    if (this.disposed) return;
    this._tryResume();
    this._rampMasterGain(0.08);
  }

  _trackEffect(effect, endSource) {
    this._activeEffects.add(effect);
    const cleanup = () => {
      if (!this._activeEffects.has(effect)) return;
      this._activeEffects.delete(effect);
      for (const node of effect.nodes) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    };
    effect.cleanup = cleanup;
    if (endSource) {
      endSource.onended = cleanup;
    }
  }

  /** Synthesize an organic Bangladeshi campus bird call (koel, myna, or distant songbird). */
  _triggerBirdCall(timeOfDay = 'golden', driving = false, isBus = false) {
    const ctx = this.context;
    if (!ctx || !this._nodes?.masterGain) return;

    const profile = this._profile(timeOfDay);
    const busMask = driving && isBus ? 0.45 : driving ? 0.72 : 1.0;
    const distanceScale = 0.65 + this._rand() * 0.35;
    const peakGain = 0.048 * profile.birdGain * busMask * distanceScale;
    if (peakGain <= 0.001) return;

    // Pick a call type without immediate repetition
    const candidates = BIRD_TYPES.filter(type => type !== this._lastBirdType);
    const pool = candidates.length ? candidates : BIRD_TYPES;
    const type = pool[Math.floor(this._rand() * pool.length)];
    this._lastBirdType = type;

    const now = ctx.currentTime ?? 0;
    const pitchJitter = 0.94 + this._rand() * 0.12;
    const panValue = (this._rand() * 2 - 1) * 0.72;

    try {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2700;
      filter.Q.value = 0.7;

      const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      if (panner?.pan) {
        if (typeof panner.pan.setValueAtTime === 'function') panner.pan.setValueAtTime(panValue, now);
        else panner.pan.value = panValue;
      }

      if (panner) {
        filter.connect(panner);
        panner.connect(this._nodes.masterGain);
      } else {
        filter.connect(this._nodes.masterGain);
      }

      // Melodic note definitions: [startOffset, duration, startFreq, endFreq, peakMultiplier]
      let notes;
      if (type === 'koel') {
        // Rising iconic Bangladeshi Asian Koel (কোকিল) 2-note flute motif
        notes = [
          [0.00, 0.24, 1080 * pitchJitter, 1390 * pitchJitter, 0.95],
          [0.36, 0.28, 1180 * pitchJitter, 1560 * pitchJitter, 1.0],
        ];
      } else if (type === 'myna') {
        // Lively 3-note Myna / Bulbul melodic phrase
        notes = [
          [0.00, 0.10, 1780 * pitchJitter, 2120 * pitchJitter, 0.85],
          [0.14, 0.11, 2240 * pitchJitter, 1890 * pitchJitter, 0.95],
          [0.29, 0.13, 1650 * pitchJitter, 1980 * pitchJitter, 0.8],
        ];
      } else {
        // Soft distant Magpie Robin / tree chirp
        notes = [
          [0.00, 0.085, 2260 * pitchJitter, 2680 * pitchJitter, 0.78],
          [0.12, 0.10, 2450 * pitchJitter, 2120 * pitchJitter, 0.7],
        ];
      }

      const sources = [];
      const nodes = [filter];
      if (panner) nodes.push(panner);

      let lastOsc = null;
      for (const [offset, dur, f0, f1, mul] of notes) {
        const t0 = now + offset;
        const tEnd = t0 + dur;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        if (typeof osc.frequency.setValueAtTime === 'function') {
          osc.frequency.setValueAtTime(f0, t0);
          if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
            osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), tEnd);
          } else if (typeof osc.frequency.linearRampToValueAtTime === 'function') {
            osc.frequency.linearRampToValueAtTime(f1, tEnd);
          }
        } else {
          osc.frequency.value = f0;
        }

        const env = ctx.createGain();
        const notePeak = peakGain * mul;
        if (typeof env.gain.setValueAtTime === 'function') {
          env.gain.setValueAtTime(0.0001, t0);
          if (typeof env.gain.linearRampToValueAtTime === 'function') {
            env.gain.linearRampToValueAtTime(notePeak, t0 + dur * 0.28);
            env.gain.linearRampToValueAtTime(0.0001, tEnd);
          } else {
            env.gain.value = notePeak;
          }
        } else {
          env.gain.value = notePeak;
        }

        osc.connect(env);
        env.connect(filter);
        osc.start(t0);
        osc.stop(tEnd + 0.02);

        sources.push(osc);
        nodes.push(osc, env);
        lastOsc = osc;
      }

      const effect = { sources, nodes };
      this._trackEffect(effect, lastOsc);
      this.birdCallCount += 1;
      this.lastBirdType = type;
      this.lastBirdGain = peakGain;
    } catch { /* Bird call is optional on partial audio contexts. */ }
  }

  /** Trigger a subtle surface-aware footstep tap (asphalt, bridge, or grass). */
  _triggerFootstep(surface = 'asphalt', speed = 3.8) {
    const ctx = this.context;
    if (!ctx || !this._nodes?.masterGain || !this._nodes.foleyNoiseBuffer) return;

    const normalizedSurface = surface === 'grass' || surface === 'bridge' ? surface : 'asphalt';
    const now = ctx.currentTime ?? 0;
    const speedFactor = clamp((Math.abs(speed) - 0.35) / 7.2, 0.25, 1.0);
    const jitter = 0.92 + this._rand() * 0.16;

    // Surface acoustic tuning
    const surfaceConfig = normalizedSurface === 'grass'
      ? { noiseFreq: 1680, noiseQ: 0.85, noiseDur: 0.095, noiseGain: 0.048, thudStart: 88, thudEnd: 46, thudGain: 0.020, thudDur: 0.065 }
      : normalizedSurface === 'bridge'
        ? { noiseFreq: 760, noiseQ: 2.0, noiseDur: 0.065, noiseGain: 0.052, thudStart: 178, thudEnd: 88, thudGain: 0.045, thudDur: 0.075 }
        : { noiseFreq: 980, noiseQ: 1.55, noiseDur: 0.052, noiseGain: 0.056, thudStart: 138, thudEnd: 62, thudGain: 0.036, thudDur: 0.055 };

    try {
      const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      const panOffset = this._stepParity * 0.08;
      this._stepParity *= -1;
      if (panner?.pan) {
        if (typeof panner.pan.setValueAtTime === 'function') panner.pan.setValueAtTime(panOffset, now);
        else panner.pan.value = panOffset;
      }

      const outputTarget = panner ?? this._nodes.masterGain;
      if (panner) panner.connect(this._nodes.masterGain);

      // Filtered noise scuff/tap
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this._nodes.foleyNoiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = surfaceConfig.noiseFreq * jitter;
      noiseFilter.Q.value = surfaceConfig.noiseQ;

      const noiseGain = ctx.createGain();
      const peakNoise = surfaceConfig.noiseGain * (0.65 + speedFactor * 0.55);
      if (typeof noiseGain.gain.setValueAtTime === 'function') {
        noiseGain.gain.setValueAtTime(0.0001, now);
        if (typeof noiseGain.gain.linearRampToValueAtTime === 'function') {
          noiseGain.gain.linearRampToValueAtTime(peakNoise, now + 0.008);
          noiseGain.gain.linearRampToValueAtTime(0.0001, now + surfaceConfig.noiseDur);
        } else {
          noiseGain.gain.value = peakNoise;
        }
      } else {
        noiseGain.gain.value = peakNoise;
      }

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(outputTarget);
      noiseSrc.start(now);
      noiseSrc.stop(now + surfaceConfig.noiseDur + 0.015);

      // Subtle low heel thud
      const thudOsc = ctx.createOscillator();
      thudOsc.type = 'sine';
      if (typeof thudOsc.frequency.setValueAtTime === 'function') {
        thudOsc.frequency.setValueAtTime(surfaceConfig.thudStart * jitter, now);
        if (typeof thudOsc.frequency.exponentialRampToValueAtTime === 'function') {
          thudOsc.frequency.exponentialRampToValueAtTime(surfaceConfig.thudEnd * jitter, now + surfaceConfig.thudDur);
        } else if (typeof thudOsc.frequency.linearRampToValueAtTime === 'function') {
          thudOsc.frequency.linearRampToValueAtTime(surfaceConfig.thudEnd * jitter, now + surfaceConfig.thudDur);
        }
      } else {
        thudOsc.frequency.value = surfaceConfig.thudStart * jitter;
      }

      const thudGain = ctx.createGain();
      const peakThud = surfaceConfig.thudGain * (0.65 + speedFactor * 0.55);
      if (typeof thudGain.gain.setValueAtTime === 'function') {
        thudGain.gain.setValueAtTime(0.0001, now);
        if (typeof thudGain.gain.linearRampToValueAtTime === 'function') {
          thudGain.gain.linearRampToValueAtTime(peakThud, now + 0.006);
          thudGain.gain.linearRampToValueAtTime(0.0001, now + surfaceConfig.thudDur);
        } else {
          thudGain.gain.value = peakThud;
        }
      } else {
        thudGain.gain.value = peakThud;
      }

      thudOsc.connect(thudGain);
      thudGain.connect(outputTarget);
      thudOsc.start(now);
      thudOsc.stop(now + surfaceConfig.thudDur + 0.015);

      const nodes = [noiseSrc, noiseFilter, noiseGain, thudOsc, thudGain];
      if (panner) nodes.push(panner);
      const effect = { sources: [noiseSrc, thudOsc], nodes };
      this._trackEffect(effect, noiseSrc);

      this.footstepCount += 1;
      this.lastFootstepSurface = normalizedSurface;
    } catch { /* Footstep foley is optional on partial audio contexts. */ }
  }

  /**
   * Advance the procedural campus soundscape for the current frame.
   *
   * @param {number} dt Frame delta time in seconds
   * @param {object} state World & player state snapshot
   */
  update(dt, state = {}) {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;

    const safeDt = Math.min(dt, 0.25);
    const {
      position = null,
      speed = 0,
      grounded = true,
      driving = false,
      isBus = false,
      nearWater = false,
      nearHub = false,
      surface = 'asphalt',
      timeOfDay = 'golden',
    } = state ?? {};

    const absSpeed = Number.isFinite(Number(speed)) ? Math.abs(Number(speed)) : 0;
    this.lastState = {
      position,
      speed: absSpeed,
      grounded: Boolean(grounded),
      driving: Boolean(driving),
      isBus: Boolean(isBus),
      nearWater: Boolean(nearWater),
      nearHub: Boolean(nearHub),
      surface,
      timeOfDay,
    };

    if (!this._isAudible()) return;

    this._elapsed += safeDt;
    const ctx = this.context;
    const now = ctx.currentTime ?? 0;
    const nodes = this._nodes;
    const profile = this._profile(timeOfDay);

    // 1. Tropical Campus Breeze & Lake Air Modulation
    const gustWave = 0.85 + 0.15 * Math.sin(this._elapsed * 0.42) * Math.cos(this._elapsed * 0.19);
    const speedWindBoost = driving ? Math.min(absSpeed, 24) * 0.0014 : 0;
    const baseBreezeGain = (nearWater ? 0.092 : 0.056) * profile.breezeScale * gustWave + speedWindBoost;
    const targetBreezeFreq = (nearWater ? 430 : 325) + (driving ? Math.min(absSpeed, 24) * 9 : 0);

    rampParam(nodes.breezeGain.gain, baseBreezeGain, 0.18, now);
    rampParam(nodes.breezeFilter.frequency, targetBreezeFreq, 0.22, now);

    const lakeSwell = 0.78 + 0.22 * Math.sin(this._elapsed * 1.15);
    const targetWaterGain = nearWater ? 0.032 * profile.breezeScale * lakeSwell : 0;
    rampParam(nodes.waterGain.gain, targetWaterGain, 0.25, now);

    // 2. Bangladeshi Campus Birdsong
    this._birdTimer -= safeDt;
    if (this._birdTimer <= 0) {
      this._triggerBirdCall(timeOfDay, Boolean(driving), Boolean(isBus));
      this._birdTimer = this._nextBirdInterval(timeOfDay);
    }

    // 3. Subtle Hub Ambience (Main Gate / Academic Plazas / Cafeteria)
    const hubBreath = 0.88 + 0.12 * Math.sin(this._elapsed * 0.31 + 1.1);
    const targetHubGain = nearHub ? 0.038 * profile.hubScale * hubBreath : 0;
    rampParam(nodes.hubGain.gain, targetHubGain, 0.28, now);

    // 4. Surface-Aware Footstep Foley
    if (!driving && grounded && absSpeed > 0.35) {
      const stride = clamp(1.25 + absSpeed * 0.145, 1.3, 2.38);
      this._stepDistance += absSpeed * safeDt;
      if (this._stepDistance >= stride) {
        this._stepDistance = Math.min(stride * 0.5, this._stepDistance - stride);
        this._triggerFootstep(surface, absSpeed);
      }
    } else if (driving) {
      this._stepDistance = 0;
    } else {
      this._stepDistance = Math.min(this._stepDistance, 0.35);
    }

    // 5. Smooth Vehicle Audio (Electric Van vs IU Red Double-Decker Bus)
    if (driving && !isBus) {
      const clampedVanSpeed = Math.min(absSpeed, 14);
      const vanPitch = 95 + clampedVanSpeed * 24;
      const vanSubPitch = 58 + clampedVanSpeed * 11;
      const vanCutoff = 320 + clampedVanSpeed * 85;
      const vanLevel = 0.022 + clamp(clampedVanSpeed / 10, 0, 1) * 0.063;

      rampParam(nodes.vanOsc.frequency, vanPitch, 0.08, now);
      rampParam(nodes.vanSubOsc.frequency, vanSubPitch, 0.08, now);
      rampParam(nodes.vanFilter.frequency, vanCutoff, 0.10, now);
      rampParam(nodes.vanGain.gain, vanLevel, 0.12, now);
      rampParam(nodes.busGain.gain, 0, 0.14, now);
    } else if (driving && isBus) {
      const clampedBusSpeed = Math.min(absSpeed, 32);
      const busPitch = 38 + clampedBusSpeed * 2.5;
      const busSubPitch = 24 + clampedBusSpeed * 1.2;
      const busCutoff = 140 + clampedBusSpeed * 13.5;
      const busLevel = 0.072 + clamp(clampedBusSpeed / 24, 0, 1) * 0.078;

      rampParam(nodes.busOsc.frequency, busPitch, 0.09, now);
      rampParam(nodes.busSubOsc.frequency, busSubPitch, 0.09, now);
      rampParam(nodes.busFilter.frequency, busCutoff, 0.11, now);
      rampParam(nodes.busGain.gain, busLevel, 0.12, now);
      rampParam(nodes.vanGain.gain, 0, 0.14, now);
    } else {
      rampParam(nodes.vanGain.gain, 0, 0.14, now);
      rampParam(nodes.busGain.gain, 0, 0.14, now);
    }
  }

  /** Idempotently stop and disconnect all oscillators, buffers, timers, and close context. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;

    for (const timer of this._timers) {
      clearTimeout(timer);
    }
    this._timers.clear();

    for (const effect of [...this._activeEffects]) {
      for (const src of effect.sources) {
        try { src.onended = null; } catch { /* Optional. */ }
        try { src.stop(); } catch { /* Already stopped. */ }
      }
      for (const node of effect.nodes) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    }
    this._activeEffects.clear();

    if (this._nodes) {
      for (const src of this._nodes.sources) {
        try { src.stop(); } catch { /* Already stopped. */ }
      }
      for (const node of this._nodes.disconnectables) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
      this._nodes = null;
    }

    const ctx = this.context;
    this.context = null;
    if (ctx) {
      try { ctx.close?.(); } catch { /* Browser may reject close. */ }
    }
  }
}
