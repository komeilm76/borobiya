import { expect, test } from "@playwright/test";
import { e2eCredentials } from "./target";

/** First real-browser stage for T4.5.3: real UI and API, no intercepted routes or SOS writes. */
test("dedicated test user logs in and opens the live/history share form", async ({ page }) => {
  const { username, password } = e2eCredentials(process.env);
  await page.goto("/_auth/login");
  await expect(page.getByRole("heading", { name: "ورود به حساب" })).toBeVisible();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "ورود به حساب" }).click();

  // Fresh browser context: reaching the private route proves actual login + cookie/profile recovery,
  // not a client-side route render with a fabricated bearer.
  await expect(page).toHaveURL(/\/_user\/map(?:[?#]|$)/);
  await expect(page.getByRole("region", { name: "نقشهٔ تعاملی همراهان" })).toBeVisible();

  await page.goto("/_user/location-shares");
  await expect(page.getByRole("heading", { name: "اشتراک موقعیت" })).toBeVisible();
  await page.getByRole("button", { name: "اشتراک تازه" }).click();
  await expect(page.getByRole("dialog", { name: "اشتراک موقعیت" })).toBeVisible();
  // No grant is posted in this stage; later E2E stages need consented test recipients and cleanup.
});
