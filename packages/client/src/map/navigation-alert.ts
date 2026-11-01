/** Short, nonverbal navigation chimes. Unlock only from the user's Start action.
 * Browsers that forbid audio or devices in silent mode still receive visual alerts. */
export function createNavigationAlert() {
  let context: AudioContext | null = null;
  function playNotes(notes: readonly (readonly [number, number])[], volume: number): void {
    if (!context || context.state !== "running") return;
    try {
      const start = context.currentTime;
      for (const [delay, frequency] of notes) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        oscillator.connect(gain); gain.connect(context.destination);
        gain.gain.setValueAtTime(0, start + delay);
        gain.gain.linearRampToValueAtTime(volume, start + delay + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, start + delay + 0.16);
        oscillator.start(start + delay); oscillator.stop(start + delay + 0.17);
      }
    } catch { /* A visible alert is always available if audio fails. */ }
  }
  return {
    arm(): void {
      if (typeof AudioContext === "undefined") return;
      try {
        context ??= new AudioContext();
        void context.resume().catch(() => { /* Autoplay may still be blocked. */ });
      } catch { context = null; }
    },
    play(): void { playNotes([[0, 740], [0.18, 590]], 0.14); }, // Descending wrong-turn warning.
    playArrival(): void { playNotes([[0, 523], [0.16, 659], [0.32, 784]], 0.12); }, // Ascending confirmation chime.
    dispose(): void { const old = context; context = null; if (old) void old.close().catch(() => {}); }
  };
}
