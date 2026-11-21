// Locally bundled Gateron Black Ink recordings from tplai/kbsim (MIT).
// See public/audio/black-ink/ATTRIBUTION.md and LICENSE.md.
// Undo uses yottasounds’ real typewriter recording (CC0); see audio/typewriter/ATTRIBUTION.md.
const sampleURLs = [1, 2, 3].map(
  (n) => `${import.meta.env.BASE_URL}audio/black-ink/press-${n}.mp3`,
);
const undoSampleURL = `${import.meta.env.BASE_URL}audio/typewriter/keypress.mp3`;
export class PuzzleSounds {
  constructor(disabled = () => false) {
    this.disabled = disabled;
    this.context = null;
    this.samples = [];
    this.undoSample = null;
    // Decode away from the real-time audio context, before the first keypress.
    this.ready = this.load();
  }
  async load() {
    try {
      const Decoder = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
      if (!Decoder) return;
      const decoder = new Decoder(1, 1, 44100);
      const decode = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw Error('Audio unavailable');
        return decoder.decodeAudioData(await response.arrayBuffer());
      };
      // A missing asset must not prevent the other sound family from loading.
      await Promise.all([
        Promise.all(sampleURLs.map(decode))
          .then((samples) => {
            this.samples = samples;
          })
          .catch(() => {
            this.samples = [];
          }),
        decode(undoSampleURL)
          .then((sample) => {
            this.undoSample = sample;
          })
          .catch(() => {
            this.undoSample = null;
          }),
      ]);
    } catch {
      this.samples = [];
      this.undoSample = null;
    }
  }
  play(kind = 'move') {
    if (this.disabled()) return;
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      const context = (this.context ??= new Audio());
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (kind === 'undo') this.playUndo(context);
      else if (kind === 'suffix') {
        const now = context.currentTime,
          gain = context.createGain(),
          tone = context.createOscillator();
        gain.connect(context.destination);
        tone.type = 'sine';
        tone.frequency.setValueAtTime(320, now);
        tone.frequency.exponentialRampToValueAtTime(150, now + 0.11);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.1, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        tone.connect(gain);
        tone.start(now);
        tone.stop(now + 0.15);
        tone.onended = () => gain.disconnect();
      } else if (this.samples.length) this.playSample(context);
      else
        this.ready.then(() => {
          if (!this.disabled() && this.samples.length) this.playSample(context);
        });
    } catch {
      /* Audio never blocks puzzle input. */
    }
  }
  playUndo(context) {
    if (this.undoSample) this.playBuffer(context, this.undoSample, 0.32, 2400);
    else
      this.ready
        .then(() => {
          if (!this.disabled() && this.undoSample)
            this.playBuffer(context, this.undoSample, 0.32, 2400);
        })
        .catch(() => {});
  }

  playSample(context) {
    this.playBuffer(context, this.samples[Math.floor(Math.random() * this.samples.length)], 0.55);
  }
  playBuffer(context, buffer, volume, lowpassHz = null) {
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    // Gently roll off the typebar's sharp high end without changing its pitch.
    const filter = lowpassHz ? context.createBiquadFilter() : null;
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.value = lowpassHz;
      filter.Q.value = 0.5;
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(context.destination);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
    };
  }
}
