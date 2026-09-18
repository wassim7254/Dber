/**
 * JSON value type used across serialization boundaries (API payloads,
 * idempotency snapshots, audit/outbox documents).
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type JsonObject = { [key: string]: Json };

/**
 * Stable, key-sorted JSON serialization. Used for idempotency request hashes
 * so that identical payloads with different key order hash identically.
 * Accepts structured values (Date, bigint) and normalizes them deterministically.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

/**
 * Converts arbitrary serializable values (DTOs, entities) into the Json
 * transport shape: Dates become ISO strings, bigints become strings.
 * Non-serializable values are a programming error and throw.
 */
export function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new Error("Refusing to serialize non-finite number");
      return value;
    case "bigint":
      return value.toString();
    default:
      break;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "function") continue;
      output[key] = toJson(item);
    }
    return output;
  }
  throw new Error(`Refusing to serialize value of type ${typeof value}`);
}
