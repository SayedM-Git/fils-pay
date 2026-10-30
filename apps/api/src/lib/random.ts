import { randomInt } from "node:crypto";

/** Generates a string of `n` cryptographically random decimal digits (e.g. "042817"). */
export function randomDigits(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("randomDigits: length must be a positive integer");
  return Array.from({ length: n }, () => randomInt(0, 10).toString()).join("");
}

/** Generates a string of `n` characters drawn uniformly from `alphabet`. */
export function randomFromAlphabet(alphabet: string, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Short display-only reference for receipts and logs (e.g. "FP-A7K2M3"). */
export function displayReference(): string {
  return `FP-${randomFromAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6)}`;
}
