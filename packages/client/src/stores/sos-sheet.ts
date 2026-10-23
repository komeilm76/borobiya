import { ref } from "vue";
import { defineStore } from "pinia";

/** Shared open/close state for the always-accessible SOS bottom sheet (`T3.2.4`). */
export const useSosSheetStore = defineStore("sos-sheet", () => {
  const open = ref(false);

  function openSheet(): void {
    open.value = true;
  }

  function closeSheet(): void {
    open.value = false;
  }

  function setOpen(next: boolean): void {
    open.value = next;
  }

  return { open, openSheet, closeSheet, setOpen };
});
