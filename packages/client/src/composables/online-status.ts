import { onScopeDispose, ref, type Ref } from "vue";

function readOnlineStatus(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Browser connectivity as a ref the panel can render.
 *
 * It answers the one question a failed request cannot: a dead connection and a 500 arrive as the same rejection,
 * so a screen that only reads errors ends up calling "no internet" a server fault. Both the dashboard and the
 * dispatch board draw an offline banner from this, and both drop their listeners with the view.
 */
export function useOnlineStatus(): { isOnline: Ref<boolean>; sync: () => void } {
  const isOnline = ref(readOnlineStatus());

  function sync(): void {
    isOnline.value = readOnlineStatus();
  }

  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  onScopeDispose(() => {
    window.removeEventListener("online", sync);
    window.removeEventListener("offline", sync);
  });

  return { isOnline, sync };
}
