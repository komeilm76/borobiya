export interface HoldPointer { id: number; x: number; y: number; button: number; primary: boolean; type: string }

/** A stationary primary touch/pen or left mouse hold; drags, multi-touch, taps and right clicks never select. */
export function createHoldToSelect(select: (x: number, y: number, type: string) => void, delay = 550, tolerance = 12) {
  let pending: HoldPointer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; pending = null; };
  const down = (event: HoldPointer) => {
    cancel();
    if (!event.primary || event.button !== 0 || !["mouse", "touch", "pen"].includes(event.type)) return;
    pending = event;
    timer = setTimeout(() => {
      const current = pending;
      cancel();
      if (current) select(current.x, current.y, current.type);
    }, delay);
  };
  const move = (event: HoldPointer) => {
    if (pending?.id === event.id &&
      Math.hypot(event.x - pending.x, event.y - pending.y) > tolerance) cancel();
  };
  const up = (id: number) => { if (pending?.id === id) cancel(); };
  return { down, move, up, cancel, isTouchPending: () => pending?.type === "touch" };
}
