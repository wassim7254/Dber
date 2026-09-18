import { getRequestContext } from "@/infrastructure/request-context/request-context";

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN = /password|passwd|secret|token|authorization|cookie|card|cvv|cvc|pin/i;
const REDACTED = "[REDACTED]";

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value !== null && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return { name: value.name, message: value.message };
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    actorRole: ctx?.role,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.log(line);
      break;
    case "info":
      console.info(line);
      break;
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
