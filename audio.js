let context;
export function tone(kind, enabled = true) {
  if (!enabled) return;
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    context.resume().catch(() => {});
    const notes =
      kind === "rescue"
        ? [523, 659, 784, 1047]
        : kind === "sweep"
          ? [220, 330]
          : kind === "scan"
            ? [440, 660]
            : [330];
    notes.forEach((frequency, i) => {
      const o = context.createOscillator(),
        g = context.createGain(),
        start = context.currentTime + i * 0.09;
      o.type = "sine";
      o.frequency.setValueAtTime(frequency, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.07, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      o.connect(g);
      g.connect(context.destination);
      o.start(start);
      o.stop(start + 0.24);
    });
  } catch {}
}
