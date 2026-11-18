// All sound is procedural WebAudio — no audio files. A low engine hum that follows
// speed, a two-tone siren that follows the nearest police car, gunshots, pickups and
// jingles, and a small step-sequencer that plays a sunset-drive loop (bass, pad,
// hats and a plucked lead). Nothing starts until the first user gesture.
import { AUDIO } from './config.js';

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuffer = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let sirenPhaseT = 0;
  let muted = false;
  let musicOn = false;
  let musicTimer = null;
  let step = 0;
  let nextTime = 0;

  // Am – F – C – G, one bar each, as MIDI notes (root, then the chord tones).
  const CHORDS = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 60, 64],
    [55, 59, 62],
  ];
  const BASS = [45, 41, 43, 43];
  // A pentatonic lead, one note per bar position (0 = rest).
  const LEAD = [0, 0, 69, 0, 72, 0, 0, 69, 0, 67, 0, 0, 64, 0, 67, 0];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.9;
      sfxGain.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: two detuned saws through a lowpass.
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(sfxGain);
      engineOsc1.start();
      engineOsc2.start();
      // Siren: one square wave, its pitch flipped by update().
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(sfxGain);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, gain, when, dest) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function noise(dur, gain, filterFreq, when) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  function scheduleStep(stepIndex, when) {
    const bar = Math.floor(stepIndex / 16) % 4;
    const beat = stepIndex % 16;
    // Bass on a syncopated pattern.
    if ([0, 3, 6, 8, 11, 14].includes(beat)) {
      tone(midiToFreq(BASS[bar] - 12), 0.32, 'triangle', 0.5, when, musicGain);
    }
    // Pad at the top of each bar.
    if (beat === 0) {
      for (const note of CHORDS[bar]) {
        tone(midiToFreq(note), 1.9, 'triangle', 0.11, when, musicGain);
        tone(midiToFreq(note + 7), 1.9, 'sine', 0.06, when, musicGain);
      }
    }
    // Hats on the off-beats.
    if (beat % 2 === 1) {
      noise(0.04, 0.1, 8000, when);
    }
    // Lead pluck.
    const lead = LEAD[beat];
    if (lead) tone(midiToFreq(lead), 0.28, 'square', 0.08, when, musicGain);
  }

  function musicTick() {
    if (!ctx || !musicOn) return;
    const ahead = 0.25;
    while (nextTime < ctx.currentTime + ahead) {
      scheduleStep(step, nextTime);
      step = (step + 1) % 64;
      nextTime += 60 / AUDIO.musicBpm / 4;
    }
  }

  return {
    /** Call on the first key or click: builds the context and resumes it. */
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
      return muted;
    },
    isMuted() {
      return muted;
    },
    startMusic() {
      if (!ensure() || musicOn) return;
      musicOn = true;
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      musicTimer = window.setInterval(musicTick, 100);
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    /** Engine hum: speedNorm 0..1, throttle 0..1, inCar whether the player drives. */
    engine(speedNorm, throttle, inCar) {
      if (!ctx) return;
      const freq = AUDIO.engineBase + speedNorm * (AUDIO.engineTop - AUDIO.engineBase) + throttle * 18;
      engineOsc1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.5 + 3, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(500 + speedNorm * 1600, ctx.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(inCar ? 0.05 + throttle * 0.05 + speedNorm * 0.03 : 0, ctx.currentTime, 0.1);
    },
    /** Siren: `nearness` 0..1 (1 = a police car right next to the player). */
    siren(nearness, dt) {
      if (!ctx) return;
      sirenPhaseT += dt;
      if (sirenPhaseT > 0.42) {
        sirenPhaseT = 0;
        sirenPhase = 1 - sirenPhase;
        sirenOsc.frequency.setTargetAtTime(sirenPhase ? 950 : 700, ctx.currentTime, 0.03);
      }
      sirenGain.gain.setTargetAtTime(nearness > 0.02 ? nearness * 0.11 : 0, ctx.currentTime, 0.15);
    },
    shot() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(0.12, 0.5, 3200, t);
      tone(140, 0.1, 'sine', 0.4, t);
    },
    enemyShot() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(0.1, 0.22, 2400, t);
    },
    crash(intensity) {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(0.25, Math.min(0.6, 0.15 + intensity * 0.03), 900, t);
      tone(70, 0.22, 'sine', 0.4, t);
    },
    pickup() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(659, 0.12, 'sine', 0.35, t);
      tone(880, 0.18, 'sine', 0.35, t + 0.09);
    },
    missionDone() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.32, t + i * 0.11));
    },
    wantedUp() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(220, 0.3, 'sawtooth', 0.22, t);
      tone(233, 0.3, 'sawtooth', 0.22, t);
    },
    click() {
      if (!ctx) return;
      tone(880, 0.06, 'sine', 0.25, ctx.currentTime);
    },
    busted() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [392, 370, 349].forEach((f, i) => tone(f, 0.3, 'triangle', 0.3, t + i * 0.16));
    },
  };
}
