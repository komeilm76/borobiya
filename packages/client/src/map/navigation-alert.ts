/** A short, nonverbal two-note navigation chime. Unlock only from the user's Start action.
 * Browsers that forbid audio or devices in silent mode still receive a visual reroute status. */
export function createNavigationAlert() {
  let context: AudioContext | null = null;
  return {
    arm(): void {
      if (typeof AudioContext === "undefined") return;
      try {
        context ??= new AudioContext();
        void context.resume().catch(() => { /* Autoplay may still be blocked. */ });
      } catch { context = null; }
    },
    play(): void {
      if (!context || context.state !== "running") return;
      try {
        const start = context.currentTime;
        for (const [delay, frequency] of [[0, 740], [0.18, 590]]) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = "sine"; oscillator.frequency.value = frequency!;
          oscillator.connect(gain); gain.connect(context.destination);
          gain.gain.setValueAtTime(0, start + delay!);
          gain.gain.linearRampToValueAtTime(0.14, start + delay! + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.001, start + delay! + 0.16);
          oscillator.start(start + delay!); oscillator.stop(start + delay! + 0.17);
        }
      } catch { /* Visual reroute status remains available. */ }
    },
    dispose(): void { const old = context; context = null; if (old) void old.close().catch(() => {}); }
  };
}
