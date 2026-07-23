/**
 * Tiny synthesized SFX via WebAudio — no asset files, offline-safe.
 * All sounds are gated by the session's soundOn flag (checked by callers).
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  delay = 0,
) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick: () => tone(880, 0.06, "triangle", 0.05),
  shutter: () => {
    tone(1400, 0.04, "square", 0.06);
    tone(220, 0.12, "sine", 0.05, 0.02);
  },
  whoosh: () => tone(520, 0.18, "sine", 0.04),
  pop: () => tone(660, 0.08, "triangle", 0.05),
  success: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.22, "triangle", 0.06, i * 0.09),
    );
  },
  print: () => tone(140, 0.4, "sawtooth", 0.02),
};
