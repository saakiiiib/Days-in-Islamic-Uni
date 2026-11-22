import test from 'node:test';
import assert from 'node:assert/strict';
import { CampusAmbientAudio } from '../src/audio/ambient.js';

function createAudioHarness({ noContext = false, startSuspended = false } = {}) {
  const contexts = [];
  const gains = [];
  const filters = [];
  const oscillators = [];
  const bufferSources = [];
  const panners = [];
  const buffers = [];

  function makeParam(initial = 0) {
    const history = [];
    return {
      value: initial,
      history,
      cancelScheduledValues(t) {
        history.push({ op: 'cancel', t });
      },
      setValueAtTime(v, t) {
        this.value = v;
        history.push({ op: 'set', v, t });
      },
      linearRampToValueAtTime(v, t) {
        this.value = v;
        history.push({ op: 'linearRamp', v, t });
      },
      exponentialRampToValueAtTime(v, t) {
        this.value = v;
        history.push({ op: 'expRamp', v, t });
      },
      setTargetAtTime(v, t, tc) {
        this.value = v;
        history.push({ op: 'target', v, t, tc });
      },
    };
  }

  function makeNode(kind) {
    return {
      kind,
      connected: [],
      disconnected: false,
      connect(dest) {
        this.connected.push(dest);
        return dest;
      },
      disconnect() {
        this.disconnected = true;
      },
    };
  }

  class MockAudioContext {
    constructor() {
      this.sampleRate = 22050;
      this.currentTime = 1.0;
      this.state = startSuspended ? 'suspended' : 'running';
      this.destination = { kind: 'destination' };
      this.resumeCalls = 0;
      this.closeCalls = 0;
      contexts.push(this);
    }

    resume() {
      this.resumeCalls += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }

    close() {
      this.closeCalls += 1;
      this.state = 'closed';
      return Promise.resolve();
    }

    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate,
        data,
        getChannelData() {
          return data;
        },
      };
      buffers.push(buf);
      return buf;
    }

    createGain() {
      const node = { ...makeNode('gain'), gain: makeParam(1) };
      gains.push(node);
      return node;
    }

    createBiquadFilter() {
      const node = {
        ...makeNode('filter'),
        type: 'lowpass',
        frequency: makeParam(350),
        Q: makeParam(1),
      };
      filters.push(node);
      return node;
    }

    createOscillator() {
      const node = {
        ...makeNode('oscillator'),
        type: 'sine',
        frequency: makeParam(440),
        started: false,
        stopped: false,
        startAt: null,
        stopAt: null,
        onended: null,
        start(t = 0) {
          this.started = true;
          this.startAt = t;
        },
        stop(t = 0) {
          this.stopped = true;
          this.stopAt = t;
        },
      };
      oscillators.push(node);
      return node;
    }

    createBufferSource() {
      const node = {
        ...makeNode('bufferSource'),
        buffer: null,
        loop: false,
        started: false,
        stopped: false,
        startAt: null,
        stopAt: null,
        onended: null,
        start(t = 0) {
          this.started = true;
          this.startAt = t;
        },
        stop(t = 0) {
          this.stopped = true;
          this.stopAt = t;
        },
      };
      bufferSources.push(node);
      return node;
    }

    createStereoPanner() {
      const node = {
        ...makeNode('stereoPanner'),
        pan: makeParam(0),
      };
      panners.push(node);
      return node;
    }
  }

  const host = noContext ? {} : { AudioContext: MockAudioContext };
  return {
    host,
    contexts,
    gains,
    filters,
    oscillators,
    bufferSources,
    panners,
    buffers,
    advanceTime(sec) {
      for (const ctx of contexts) ctx.currentTime += sec;
    },
  };
}

test('CampusAmbientAudio safely no-ops in headless Node without AudioContext', async () => {
  const defaultAmbient = new CampusAmbientAudio();
  assert.equal(await defaultAmbient.unlock(), false);
  defaultAmbient.update(0.016, { speed: 4.5, grounded: true, surface: 'asphalt' });
  defaultAmbient.dispose();
  assert.equal(defaultAmbient.disposed, true);

  const ambient = new CampusAmbientAudio({ host: {} });
  assert.equal(await ambient.unlock(), false);
  assert.equal(ambient.unlocked, false);

  ambient.setVolume(0.8);
  ambient.setMuted(true);
  ambient.setMuted(false);
  ambient.setSuspended(true);
  ambient.setSuspended(false);
  ambient.update(0.016, { speed: 4, grounded: true, surface: 'grass', nearWater: true, nearHub: true });
  ambient.update(0.016, { speed: 12, driving: true, isBus: true });
  ambient.dispose();
  ambient.dispose(); // idempotent
  assert.equal(ambient.disposed, true);
});

test('unlock creates/resumes AudioContext, builds procedural noise buffers and continuous beds', async () => {
  const h = createAudioHarness({ startSuspended: true });
  const ambient = new CampusAmbientAudio({ host: h.host, volume: 0.6 });

  assert.equal(await ambient.unlock(), true);
  assert.equal(h.contexts.length, 1);
  assert.equal(h.contexts[0].resumeCalls, 1);
  assert.equal(h.contexts[0].state, 'running');
  assert.equal(ambient.unlocked, true);

  // Two procedural buffers (seamless looping breeze noise + short foley burst)
  assert.equal(h.buffers.length, 2);
  assert.ok(h.buffers[0].data.some(v => Math.abs(v) > 0.01), 'procedural noise buffer should contain audio samples');
  assert.equal(h.bufferSources[0].loop, true);
  assert.equal(h.bufferSources[0].started, true);

  // Master gain (gains[0]) starts at 0 and ramps smoothly to 0.6
  const masterGain = h.gains[0];
  assert.ok(masterGain.gain.history.some(e => e.op === 'linearRamp' && Math.abs(e.v - 0.6) < 1e-6));
  ambient.dispose();
});

test('setMuted, setVolume, and setSuspended ramp master gain smoothly to 0 without pops', async () => {
  const h = createAudioHarness();
  const ambient = new CampusAmbientAudio({ host: h.host, volume: 0.5 });
  await ambient.unlock();

  const master = h.gains[0];

  // Volume clamp & smooth ramp
  ambient.setVolume(1.5);
  assert.equal(ambient.volume, 1);
  assert.equal(master.gain.value, 1);

  ambient.setVolume(0.4);
  assert.equal(ambient.volume, 0.4);
  assert.equal(master.gain.value, 0.4);
  assert.equal(master.gain.history.at(-1).op, 'linearRamp');

  // Mute ramps smoothly to 0 and blocks footsteps/birds
  ambient.setMuted(true);
  assert.equal(master.gain.value, 0);
  assert.equal(master.gain.history.at(-1).op, 'linearRamp');
  for (let i = 0; i < 60; i++) {
    ambient.update(0.1, { speed: 5.0, grounded: true, driving: false });
  }
  assert.equal(ambient.footstepCount, 0);
  assert.equal(ambient.birdCallCount, 0);

  // Unmute restores volume smoothly
  ambient.setMuted(false);
  assert.equal(master.gain.value, 0.4);

  // Suspend ramps smoothly to 0 and restores on resume
  ambient.setSuspended(true);
  assert.equal(master.gain.value, 0);
  assert.equal(master.gain.history.at(-1).op, 'linearRamp');

  ambient.setSuspended(false);
  assert.equal(master.gain.value, 0.4);

  ambient.dispose();
});

test('footstep cadence scales naturally from walk to sprint and differentiates surfaces', async () => {
  const h = createAudioHarness();
  const ambient = new CampusAmbientAudio({ host: h.host, random: () => 0.5 });
  await ambient.unlock();

  // Standing still or airborne should never trigger footsteps
  for (let i = 0; i < 30; i++) {
    ambient.update(0.05, { speed: 0.2, grounded: true, driving: false, surface: 'asphalt' });
    ambient.update(0.05, { speed: 4.0, grounded: false, driving: false, surface: 'asphalt' });
    ambient.update(0.05, { speed: 8.0, grounded: true, driving: true, surface: 'asphalt' });
  }
  assert.equal(ambient.footstepCount, 0);

  // Walk for 3.0 seconds on asphalt (3.8 m/s)
  for (let i = 0; i < 60; i++) {
    h.advanceTime(0.05);
    ambient.update(0.05, { speed: 3.8, grounded: true, driving: false, surface: 'asphalt' });
  }
  const walkSteps = ambient.footstepCount;
  assert.ok(walkSteps >= 4 && walkSteps <= 8, `expected natural walk cadence, got ${walkSteps}`);
  assert.equal(ambient.lastFootstepSurface, 'asphalt');
  const asphaltFilterFreq = h.filters.at(-1).frequency.value;

  // Sprint for 3.0 seconds on grass (7.5 m/s) — should produce higher step cadence & softer grass rustle band
  const beforeSprint = ambient.footstepCount;
  for (let i = 0; i < 60; i++) {
    h.advanceTime(0.05);
    ambient.update(0.05, { speed: 7.5, grounded: true, driving: false, surface: 'grass' });
  }
  const sprintSteps = ambient.footstepCount - beforeSprint;
  assert.ok(sprintSteps > walkSteps, `sprint steps (${sprintSteps}) should exceed walk steps (${walkSteps})`);
  assert.equal(ambient.lastFootstepSurface, 'grass');
  const grassFilterFreq = h.filters.at(-1).frequency.value;
  assert.ok(grassFilterFreq > asphaltFilterFreq, 'grass rustle filter should be higher/softer than asphalt tap');

  // Bridge surface step
  const beforeBridge = ambient.footstepCount;
  for (let i = 0; i < 20; i++) {
    h.advanceTime(0.05);
    ambient.update(0.05, { speed: 4.0, grounded: true, driving: false, surface: 'bridge' });
  }
  assert.ok(ambient.footstepCount > beforeBridge);
  assert.equal(ambient.lastFootstepSurface, 'bridge');
  const bridgeFilterFreq = h.filters.at(-1).frequency.value;
  assert.ok(bridgeFilterFreq < asphaltFilterFreq, 'bridge hollow tap filter should be lower/more resonant than asphalt');

  ambient.dispose();
});

test('vehicle audio distinguishes electric van vs IU Red Bus diesel rumble and modulates pitch with speed', async () => {
  const h = createAudioHarness();
  const ambient = new CampusAmbientAudio({ host: h.host, random: () => 0.5 });
  await ambient.unlock();

  // Persistent nodes created in _buildGraph:
  // oscillators: [breezeLfo, vanOsc, vanSubOsc, busOsc, busSubOsc]
  const vanOsc = h.oscillators[1];
  const busOsc = h.oscillators[3];
  const busSubOsc = h.oscillators[4];
  // filters: [breezeFilter, waterFilter, hubBandpass, hubLowpass, vanFilter, busFilter]
  const vanFilter = h.filters[4];
  const busFilter = h.filters[5];
  // gains: [masterGain, breezeGain, breezeLfoGain, waterGain, hubGain, vanSubGain, vanGain, busSubGain, busGain]
  const vanGain = h.gains[6];
  const busGain = h.gains[8];

  assert.equal(vanOsc.type, 'triangle');
  assert.equal(busOsc.type, 'sawtooth');

  // Drive Electric Van at slow then fast speed
  ambient.update(0.05, { driving: true, isBus: false, speed: 1.0 });
  const slowVanFreq = vanOsc.frequency.value;
  const slowVanCutoff = vanFilter.frequency.value;
  const slowVanGain = vanGain.gain.value;
  assert.ok(slowVanGain > 0);
  assert.equal(busGain.gain.value, 0);

  ambient.update(0.05, { driving: true, isBus: false, speed: 8.0 });
  assert.ok(vanOsc.frequency.value > slowVanFreq, 'van motor pitch should rise with speed');
  assert.ok(vanFilter.frequency.value > slowVanCutoff, 'van filter cutoff should open with speed');
  assert.ok(vanGain.gain.value > slowVanGain, 'van motor volume should rise smoothly with speed');

  // Switch to IU Red Double-Decker Bus: idle then cruising speed
  ambient.update(0.05, { driving: true, isBus: true, speed: 0.0 });
  const idleBusFreq = busOsc.frequency.value;
  const idleBusSubFreq = busSubOsc.frequency.value;
  const idleBusCutoff = busFilter.frequency.value;
  assert.equal(vanGain.gain.value, 0, 'van gain should fade to 0 when driving bus');
  assert.ok(busGain.gain.value > 0, 'bus diesel idle should be audible');
  assert.ok(idleBusFreq < slowVanFreq, 'bus diesel fundamental should be deeper than electric van');

  // Cruising (also works with negative reverse speed via Math.abs)
  ambient.update(0.05, { driving: true, isBus: true, speed: -18.0 });
  assert.ok(busOsc.frequency.value > idleBusFreq, 'bus diesel pitch should rise with speed');
  assert.ok(busSubOsc.frequency.value > idleBusSubFreq, 'bus sub-harmonic pitch should rise with speed');
  assert.ok(busFilter.frequency.value > idleBusCutoff, 'bus lowpass cutoff should rise with speed');

  // Exit vehicle: both engine gains fade cleanly to 0
  ambient.update(0.05, { driving: false, isBus: false, speed: 0 });
  assert.equal(vanGain.gain.value, 0);
  assert.equal(busGain.gain.value, 0);

  ambient.dispose();
});

test('nearWater and nearHub smoothly swell campus breeze and hub ambience', async () => {
  const h = createAudioHarness();
  const ambient = new CampusAmbientAudio({ host: h.host, random: () => 0.5 });
  await ambient.unlock();

  const breezeGain = h.gains[1];
  const waterGain = h.gains[3];
  const hubGain = h.gains[4];

  ambient.update(0.05, { nearWater: false, nearHub: false, timeOfDay: 'golden' });
  const openBreeze = breezeGain.gain.value;
  assert.equal(waterGain.gain.value, 0);
  assert.equal(hubGain.gain.value, 0);

  ambient.update(0.05, { nearWater: true, nearHub: true, timeOfDay: 'golden' });
  assert.ok(breezeGain.gain.value > openBreeze, 'breeze should be fuller near IU Lake');
  assert.ok(waterGain.gain.value > 0, 'lake breeze air layer should activate near water');
  assert.ok(hubGain.gain.value > 0, 'hub ambience should fade in near plazas/gate');

  ambient.update(0.05, { nearWater: false, nearHub: false, timeOfDay: 'golden' });
  assert.equal(waterGain.gain.value, 0);
  assert.equal(hubGain.gain.value, 0);

  ambient.dispose();
});

test('Bangladeshi birdsong is lively in morning/golden hour and softly attenuated at dusk', async () => {
  const morningHarness = createAudioHarness();
  const morningAmbient = new CampusAmbientAudio({ host: morningHarness.host, random: () => 0.35 });
  await morningAmbient.unlock();

  // Simulate 24 seconds in morning
  for (let i = 0; i < 120; i++) {
    morningHarness.advanceTime(0.2);
    morningAmbient.update(0.2, { timeOfDay: 'morning', driving: false });
  }
  const morningCount = morningAmbient.birdCallCount;
  const morningGain = morningAmbient.lastBirdGain;
  assert.ok(morningCount >= 2, `expected lively morning birdsong, got ${morningCount}`);
  assert.ok(morningHarness.panners.length >= 2, 'bird calls should use gentle stereo panning');

  const duskHarness = createAudioHarness();
  const duskAmbient = new CampusAmbientAudio({ host: duskHarness.host, random: () => 0.35 });
  await duskAmbient.unlock();

  // Simulate 24 seconds at dusk
  for (let i = 0; i < 120; i++) {
    duskHarness.advanceTime(0.2);
    duskAmbient.update(0.2, { timeOfDay: 'dusk', driving: false });
  }
  assert.ok(duskAmbient.birdCallCount >= 1, 'dusk should still allow occasional calm distant bird call');
  assert.ok(duskAmbient.birdCallCount <= morningCount, 'dusk birdsong should be sparser than morning');
  assert.ok(
    duskAmbient.lastBirdGain < morningGain * 0.4,
    `dusk bird gain (${duskAmbient.lastBirdGain}) should be sharply attenuated vs morning (${morningGain})`
  );

  morningAmbient.dispose();
  duskAmbient.dispose();
});

test('dispose is idempotent and cleanly stops/disconnects all nodes and closes owned context', async () => {
  const h = createAudioHarness();
  const ambient = new CampusAmbientAudio({ host: h.host, random: () => 0.25 });
  await ambient.unlock();

  // Trigger a bird call and a footstep so transient effects are also active
  for (let i = 0; i < 60; i++) {
    h.advanceTime(0.15);
    ambient.update(0.15, { speed: 4.2, grounded: true, driving: false, timeOfDay: 'golden' });
  }
  assert.ok(ambient.footstepCount > 0);
  assert.ok(ambient.birdCallCount > 0);

  ambient.dispose();
  assert.equal(ambient.disposed, true);
  assert.equal(ambient.unlocked, false);
  assert.equal(h.contexts[0].closeCalls, 1);
  assert.equal(h.contexts[0].state, 'closed');

  // Every persistent & active source should be stopped and disconnected
  for (const osc of h.oscillators) {
    assert.equal(osc.stopped, true);
    assert.equal(osc.disconnected, true);
  }
  for (const src of h.bufferSources) {
    assert.equal(src.stopped, true);
    assert.equal(src.disconnected, true);
  }
  for (const gain of h.gains) {
    assert.equal(gain.disconnected, true);
  }

  // Calling dispose again or calling update/unlock after dispose is completely safe
  ambient.dispose();
  assert.equal(h.contexts[0].closeCalls, 1);
  assert.equal(await ambient.unlock(), false);
  ambient.update(0.05, { speed: 5, grounded: true });
});
