import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && Buffer.byteLength(value, "utf8") <= 256;
}
export async function hashPassword(password: string) {
  if (!validPassword(password)) throw new Error("Password must be 12–256 UTF-8 bytes (at least 12 characters)");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string | null) {
  if (typeof password !== "string" || Buffer.byteLength(password) > 256) return false;
  const parts = (encoded ?? "").split("$");
  const valid = parts.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Do comparable work for unknown users / passwordless accounts too.
  const salt = valid ? parts[1] : "0".repeat(32);
  const expected = Buffer.from(valid ? parts[2] : "0".repeat(128), "hex");
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, expected) && valid;
}
