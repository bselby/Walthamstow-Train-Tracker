// Web Audio API synth honk. Two-tone triangle oscillators (220 Hz + 293 Hz ≈ perfect
// fourth, classic two-tone EMU horn), short attack/decay. Lazy AudioContext so we
// only construct it when the user actually taps — browsers require a user gesture.

let ctx: AudioContext | null = null;

export function toot(): void {
  if (!ctx) {
    const AudioCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return; // older browser — silently no-op
    ctx = new AudioCtor();
  }
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);         // 10 ms attack
  gain.gain.setValueAtTime(0.25, now + 0.16);                   // hold 150 ms
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);   // 200 ms decay
  gain.connect(ctx.destination);

  for (const freq of [220, 293]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.36);
  }
}
