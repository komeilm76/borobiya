/** A browser test must opt into one *dedicated nonproduction* origin. Never infer a target from Vite env. */
export function e2eTarget(env: Record<string, string | undefined>): {
  baseURL: string;
  ignoreHTTPSErrors: boolean;
} {
  if (env.BOROBIYA_E2E_NONPRODUCTION !== "I_ACKNOWLEDGE_NONPRODUCTION") {
    throw new Error("E2E requires explicit nonproduction acknowledgement.");
  }
  const input = env.BOROBIYA_E2E_BASE_URL;
  if (!input) throw new Error("E2E requires a dedicated nonproduction base URL.");
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error("E2E base URL must be an absolute origin."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      !url.hostname || url.username || url.password || url.href !== `${url.origin}/`) {
    throw new Error("E2E base URL must be an HTTPS origin (HTTP only on loopback), with no path or credentials.");
  }
  const insecure = env.BOROBIYA_E2E_INSECURE_CERT;
  if (insecure && insecure !== "0" && insecure !== "1") throw new Error("Invalid E2E certificate option.");
  if (insecure === "1" && url.protocol !== "https:") throw new Error("Certificate override requires HTTPS.");
  return { baseURL: url.origin, ignoreHTTPSErrors: insecure === "1" };
}

/** Credentials are supplied at runtime, never committed or included in a failure message. */
export function e2eCredentials(env: Record<string, string | undefined>): { username: string; password: string } {
  const username = env.BOROBIYA_E2E_USERNAME;
  const password = env.BOROBIYA_E2E_PASSWORD;
  if (!username?.trim() || !password) throw new Error("E2E requires dedicated test credentials.");
  return { username, password };
}
