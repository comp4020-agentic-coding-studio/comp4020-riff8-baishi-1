// Every instrument is synthesized here with the Web Audio API: no samples to
// fetch, license or host, and nothing a 256 MB machine has to serve. Each
// voice is a few oscillators, a noise buffer and a filter, shaped by the
// note or hits shape.ts reads off the mark.
import type { Instrument } from "./layout";
import { type Hit, melodicNote, type Note, percussionHits } from "./shape";

const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_MIDI: Record<string, number> = { piano: 60, strings: 55, flute: 72, bass: 36, synth: 60 };

function midi(instrument: Instrument, step: number): number {
  const octave = Math.floor(step / 5);
  const degree = ((step % 5) + 5) % 5;
  return BASE_MIDI[instrument] + 12 * octave + PENTATONIC[degree];
}

const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export interface Synth {
  ctx: AudioContext;
  play(instrument: Instrument, d: string, width: number, when: number, beat: number): void;
}

export function createSynth(): Synth {
  const ctx = new AudioContext();
  const master = ctx.createDynamicsCompressor();
  const out = ctx.createGain();
  out.gain.value = 0.7;
  master.connect(out).connect(ctx.destination);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  const envelope = (t: number, dur: number, peak: number, attack: number, release: number): GainNode => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    g.connect(master);
    return g;
  };

  // Pitch over the note: a glide for a rising or falling line, a fast
  // alternation for a zigzag, steady otherwise.
  const steer = (param: AudioParam, instrument: Instrument, note: Note, t: number, dur: number, ratio = 1): void => {
    const f0 = hz(midi(instrument, note.step)) * ratio;
    param.setValueAtTime(f0, t);
    if (note.glide !== 0) {
      param.exponentialRampToValueAtTime(hz(midi(instrument, note.step + note.glide)) * ratio, t + dur);
    } else if (note.trill > 0) {
      const f1 = hz(midi(instrument, note.step + 1)) * ratio;
      const n = Math.max(2, Math.round(note.trill * dur));
      for (let i = 1; i < n; i++) param.setValueAtTime(i % 2 ? f1 : f0, t + (dur * i) / n);
    }
  };

  const osc = (type: OscillatorType, t: number, end: number, dest: AudioNode, detune = 0): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  };

  const noiseSource = (t: number, dur: number, dest: AudioNode): void => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  };

  const filter = (type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  };

  const vibrato = (t: number, end: number, o: OscillatorNode, cents: number): void => {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = cents;
    lfo.connect(depth).connect(o.detune);
    lfo.start(t);
    lfo.stop(end);
  };

  function melodic(instrument: Instrument, note: Note, t: number, dur: number): void {
    const g = note.gain;
    const end = t + dur + 0.4;
    switch (instrument) {
      case "piano": {
        const env = envelope(t, Math.min(dur, 1.2), 0.32 * g, 0.005, Math.min(0.6, dur));
        steer(osc("triangle", t, end, env).frequency, instrument, note, t, dur);
        const upper = ctx.createGain();
        upper.gain.value = 0.25;
        upper.connect(env);
        steer(osc("sine", t, end, upper).frequency, instrument, note, t, dur, 2);
        break;
      }
      case "strings": {
        const env = envelope(t, dur, 0.16 * g, Math.min(0.12, dur / 2), 0.25);
        const lp = filter("lowpass", 2200, 0.7, env);
        for (const detune of [-7, 7]) {
          const o = osc("sawtooth", t, end, lp, detune);
          steer(o.frequency, instrument, note, t, dur);
          vibrato(t, end, o, 6);
        }
        break;
      }
      case "flute": {
        const env = envelope(t, dur, 0.28 * g, Math.min(0.05, dur / 2), 0.12);
        const o = osc("sine", t, end, env);
        steer(o.frequency, instrument, note, t, dur);
        vibrato(t, end, o, 10);
        const breath = envelope(t, Math.min(0.15, dur), 0.05 * g, 0.01, 0.08);
        noiseSource(t, 0.2, filter("bandpass", hz(midi(instrument, note.step)), 3, breath));
        break;
      }
      case "bass": {
        const env = envelope(t, dur, 0.35 * g, 0.01, 0.12);
        steer(osc("square", t, end, filter("lowpass", 520, 5, env)).frequency, instrument, note, t, dur);
        break;
      }
      case "synth": {
        const env = envelope(t, dur, 0.14 * g, 0.01, 0.15);
        const lp = filter("lowpass", 3200, 6, env);
        lp.frequency.setValueAtTime(3200, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + Math.max(0.1, dur));
        for (const detune of [-12, 12]) steer(osc("sawtooth", t, end, lp, detune).frequency, instrument, note, t, dur);
        break;
      }
    }
  }

  function hit(instrument: Instrument, h: Hit, t: number): void {
    const g = h.gain;
    if (instrument === "vocal") {
      // A vowel-ish chop: a buzzy source through two formant filters, low
      // "oo", mid "ah", high "ee".
      const formants = [
        [300, 870],
        [730, 1090],
        [270, 2290],
      ][h.voice];
      const env = envelope(t, 0.14, 0.5 * g, 0.008, 0.07);
      const mix = ctx.createGain();
      for (const f of formants) {
        const bp = filter("bandpass", f, 8, env);
        mix.connect(bp);
      }
      const o = osc("sawtooth", t, t + 0.3, mix);
      o.frequency.setValueAtTime([131, 175, 220][h.voice], t);
      o.frequency.exponentialRampToValueAtTime([123, 165, 233][h.voice], t + 0.14);
      return;
    }
    const electro = instrument === "electro";
    if (h.voice === 0) {
      const decay = electro ? 0.45 : 0.18;
      const env = envelope(t, 0.01, 0.9 * g, 0.003, decay);
      const o = osc("sine", t, t + decay + 0.1, env);
      o.frequency.setValueAtTime(electro ? 70 : 150, t);
      o.frequency.exponentialRampToValueAtTime(electro ? 38 : 48, t + decay * 0.7);
    } else if (h.voice === 1) {
      if (electro) {
        // a clap: three quick noise bursts
        for (const k of [0, 0.012, 0.024]) {
          const env = envelope(t + k, 0.005, 0.5 * g, 0.002, k === 0.024 ? 0.12 : 0.02);
          noiseSource(t + k, 0.15, filter("bandpass", 1400, 1.5, env));
        }
      } else {
        const env = envelope(t, 0.01, 0.45 * g, 0.002, 0.14);
        noiseSource(t, 0.2, filter("highpass", 1200, 0.7, env));
        const body = envelope(t, 0.01, 0.3 * g, 0.002, 0.08);
        osc("triangle", t, t + 0.12, body).frequency.value = 185;
      }
    } else {
      const env = envelope(t, 0.005, 0.22 * g, 0.002, electro ? 0.03 : 0.06);
      noiseSource(t, 0.1, filter("highpass", electro ? 9000 : 7000, 1, env));
    }
  }

  return {
    ctx,
    play(instrument, d, width, when, beat) {
      if (instrument === "drums" || instrument === "electro" || instrument === "vocal") {
        for (const h of percussionHits(d, width)) hit(instrument, h, when + h.at * beat);
        return;
      }
      const note = melodicNote(d, width);
      const each = (note.duration * beat) / note.repeats;
      for (let i = 0; i < note.repeats; i++) {
        const t = when + note.start * beat + i * each;
        melodic(instrument, note, t, note.repeats > 1 ? each * 0.7 : each);
      }
    },
  };
}
