import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Password hashing (§4): scrypt with a per-password random salt. Stored in the
 * modular PHC string format `scrypt$<salt-b64>$<hash-b64>`; verification is
 * timing-safe. Plaintext passwords are never persisted or logged.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}
