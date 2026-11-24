import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source contracts: admin views are not mounted in this repository's unit tests.
const dialog = readFileSync(new URL("./AdminCreateUserDialog.vue", import.meta.url), "utf8");
const page = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");
const css = parse(dialog).descriptor.styles[0]!.content;

describe("admin user provisioning", () => {
  it("places a prominent create action beside refresh and returns focus on close", () => {
    expect(page).toContain('class="admin-create-button" @click="openCreate($event)"');
    expect(page).toContain('<AdminCreateUserDialog :model-value="createOpen"');
    expect(page).toContain('@created="handleUserCreated" @closed="restoreCreateFocus"');
    expect(page).toContain('if (createTrigger?.isConnected) createTrigger.focus({ preventScroll: true });');
    expect(page).toContain('search.value = "";\n  statusFilter.value = "all";\n  categoryFilter.value = "all";');
    expect(page).toContain('if (wasFirstPage) void loadUsers();');
    expect(page).toContain('.admin-users-header__actions :deep(.v-btn) { flex: 1 1 9rem;');
  });

  it("matches the catalog form hierarchy and never asks the admin for security answers", () => {
    expect(dialog).toContain('aria-labelledby="admin-create-user-title"');
    expect(dialog).toContain(':fullscreen="isPhone"');
    for (const id of ['admin-create-user-identity-title', 'admin-create-user-password-title', 'admin-create-user-access-title']) {
      expect(dialog).toContain(`id="${id}"`);
    }
    expect(dialog).toContain('v-model="username"');
    expect(dialog).toContain('v-model="password"');
    expect(dialog).toContain('v-model="confirmation"');
    expect(dialog).toContain('v-model="isActive"');
    expect(dialog).not.toContain('v-model="securityQuestions"');
    expect(dialog).toContain('در این فرم پاسخ پرسش‌های امنیتی دریافت نمی‌شود');
    expect(dialog).toContain('کاربر پس از نخستین ورود باید پنج پرسش امنیتی را تکمیل کند');
    expect(css).toContain('.admin-create-user__section + .admin-create-user__section { padding-block-start: .9rem;');
    expect(css).toContain('.admin-create-user__password-fields { grid-template-columns: minmax(0, 1fr);');
  });

  it("validates the shared schema, handles conflicts, and wipes credentials on close", () => {
    expect(dialog).toContain('createAdminUserSchema.safeParse({ username: username.value.trim(), password: password.value, isActive: isActive.value })');
    expect(dialog).toContain('confirmation.value !== password.value');
    expect(dialog).toContain('error.code === "USERNAME_TAKEN"');
    expect(dialog).toContain('const created = await createAdminUser(parsed.data, token);');
    expect(dialog).toContain('emit("created", created);');
    expect(dialog).toContain('password.value = "";\n  confirmation.value = "";');
    expect(dialog).toContain('watch(() => props.modelValue, () => reset());');
    expect(dialog).toContain('type="submit" form="admin-create-user-fields"');
    expect(dialog).toContain(':disabled="saving" @click="close"');
    const descriptor = parse(dialog).descriptor;
    expect(compileTemplate({ filename: "AdminCreateUserDialog.vue", id: "create-user", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminCreateUserDialog.vue", id: "create-user", scoped: true, source: css }).errors).toEqual([]);
  });
});
