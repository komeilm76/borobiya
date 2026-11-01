/** Short, nonverbal navigation chimes. Unlock only from the user's Start action.
 * Browsers that forbid audio or devices in silent mode still receive visual alerts. */
export function createNavigationAlert() {
  let context: AudioContext | null = null;
  let unlock: Promise<void> | null = null;
  let arrivalGeneration = 0;
  let arrivalQueued = false;
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
  function cancelArrival(): void { arrivalGeneration++; arrivalQueued = false; }
  return {
    arm(): void {
      if (typeof AudioContext === "undefined") return;
      try {
        context ??= new AudioContext();
        unlock = context.resume().catch(() => { /* Autoplay may still be blocked. */ });
      } catch { context = null; }
    },
    play(): void { playNotes([[0, 740], [0.18, 590]], 0.14); }, // Descending wrong-turn warning.
    playArrival(): void {
      const notes = [[0, 523], [0.16, 659], [0.32, 784]] as const;
      if (!context) return;
      if (context.state === "running") { playNotes(notes, 0.12); return; }
      // A just-started journey may arrive before resume() resolves on mobile.
      // Do not drop that chime, or play it after acknowledgement was dismissed.
      if (!unlock || arrivalQueued) return;
      arrivalQueued = true;
      const current = context, generation = arrivalGeneration;
      void unlock.then(() => {
        if (context === current && generation === arrivalGeneration) {
          playNotes(notes, 0.12); // Still silent if the browser refused the unlock.
          arrivalQueued = false;
        }
      });
    },
    cancelArrival,
    dispose(): void {
      cancelArrival();
      const old = context; context = null; unlock = null;
      if (old) void old.close().catch(() => {});
    }
  };
}
