import { readFileSync } from "node:fs";
import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLogoutConfirmation } from "./use-logout-confirmation";

function mount(logout: () => Promise<void>, navigate: () => Promise<unknown>) {
  const authenticated = ref(true);
  const scope = effectScope();
  let confirmation!: ReturnType<typeof useLogoutConfirmation>;
  scope.run(() => {
    confirmation = useLogoutConfirmation({ isAuthenticated: authenticated, logout, onLoggedOut: navigate });
  });
  return { confirmation, authenticated, scope };
}

describe("logout confirmation", () => {
  it("only opens on the first click and leaves the session and route alone when cancelled", async () => {
    const logout = vi.fn(async () => {});
    const navigate = vi.fn(async () => {});
    const { confirmation, scope } = mount(logout, navigate);
    confirmation.request();
    expect(confirmation.open.value).toBe(true);
    expect(logout).not.toHaveBeenCalled();
    confirmation.cancel();
    await confirmation.confirm();
    expect(confirmation.open.value).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    scope.stop();
  });

  it("allows only one confirmed logout and prevents dismissal while it is pending", async () => {
    let finish!: () => void;
    const logout = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const navigate = vi.fn(async () => {});
    const { confirmation, scope } = mount(logout, navigate);
    confirmation.request();
    const pending = confirmation.confirm();
    confirmation.confirm();
    confirmation.cancel();
    expect(confirmation.open.value).toBe(true);
    expect(confirmation.submitting.value).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(confirmation.open.value).toBe(false);
    expect(confirmation.submitting.value).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("returns to login after an offline logout", async () => {
    const authenticated = ref(true);
    const logout = vi.fn(async () => { authenticated.value = false; throw new Error("offline"); });
    const navigate = vi.fn(async () => {});
    const scope = effectScope();
    let confirmation!: ReturnType<typeof useLogoutConfirmation>;
    scope.run(() => { confirmation = useLogoutConfirmation({ isAuthenticated: authenticated, logout, onLoggedOut: navigate }); });
    confirmation.request();
    await confirmation.confirm();
    expect(navigate).toHaveBeenCalledOnce();
    expect(confirmation.open.value).toBe(false);
    confirmation.request();
    expect(confirmation.open.value).toBe(false);
    scope.stop();
  });

  it("dismisses the prompt when the account signs out elsewhere", () => {
    const logout = vi.fn(async () => {});
    const navigate = vi.fn(async () => {});
    const { confirmation, authenticated, scope } = mount(logout, navigate);
    confirmation.request();
    authenticated.value = false;
    expect(confirmation.open.value).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    scope.stop();
  });

  it("wires the profile action and accessible dialog without mounting a Vue component", () => {
    const view = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
    const menu = readFileSync(new URL("../components/shell/AccountProfileMenu.vue", import.meta.url), "utf8");
    expect(view).toContain('@request-logout="logoutConfirmation.request()"');
    expect(menu).toContain("emit('request-logout')");
    expect(view).toContain(':model-value="logoutConfirmation.open.value"');
    expect(view).toContain(':persistent="logoutConfirmation.submitting.value"');
    expect(view).toContain('aria-labelledby="logout-confirm-title"');
    expect(view).toContain('@click="logoutConfirmation.cancel()"');
    expect(view).toContain('@click="logoutConfirmation.confirm()"');
    expect(view).not.toContain('@click="logout"');
  });
});
