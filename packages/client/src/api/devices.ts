import { devicesSchema, type UserDevice } from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

/**
 * `GET /_user/devices` — the account's live sessions, which is also the only set of ids the server will
 * accept as a priority device.
 *
 * Two properties of the endpoint the settings screen has to respect rather than assume: the response is a
 * **bare array** (no pagination envelope — the route caps itself at `MAX_USER_DEVICE_LIST_ITEMS` = 50
 * rows instead of paging), and its rows are sessions that still hold a refresh token, so a logged-out
 * device is *absent* rather than listed as offline. The panel therefore describes "دستگاه‌های فعال" and
 * never claims to show every device the account ever had.
 */
export async function fetchUserDevices(accessToken: string): Promise<UserDevice[]> {
  const response = await requestJson<unknown>(apiRoutes.user.devices.url, { accessToken });
  return devicesSchema.parse(response);
}
