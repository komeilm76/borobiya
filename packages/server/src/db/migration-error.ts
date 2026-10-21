const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/\S+/gi;
const PASSWORD_PARAMETER_PATTERN = /(\b(?:password|passwd)\b\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const MAX_CAUSE_DEPTH = 6;

type ErrorWithMetadata = Error & { cause?: unknown; code?: unknown };

function redactMessage(message: string, databaseUrl?: string): string {
  let safeMessage = message;
  if (databaseUrl) {
    safeMessage = safeMessage.split(databaseUrl).join("[redacted DATABASE_URL]");
  }
  return safeMessage
    .replace(DATABASE_URL_PATTERN, "[redacted DATABASE_URL]")
    .replace(PASSWORD_PARAMETER_PATTERN, "$1[redacted]");
}

/** Return useful migration diagnostics while keeping credentials out of logs. */
export function safeMigrationErrorDetails(error: unknown, databaseUrl?: string): string[] {
  const details: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      const metadata = current as ErrorWithMetadata;
      const code = typeof metadata.code === "string" ? `${metadata.code}: ` : "";
      const message = redactMessage(current.message || current.name, databaseUrl);
      if (message) details.push(`${code}${message}`);
      current = metadata.cause;
      continue;
    }

    if (typeof current === "string") {
      details.push(redactMessage(current, databaseUrl));
      break;
    }

    if (typeof current === "object") {
      const metadata = current as { cause?: unknown; code?: unknown; message?: unknown };
      if (typeof metadata.message === "string") {
        const code = typeof metadata.code === "string" ? `${metadata.code}: ` : "";
        details.push(`${code}${redactMessage(metadata.message, databaseUrl)}`);
        current = metadata.cause;
        continue;
      }
    }

    break;
  }

  return details;
}
