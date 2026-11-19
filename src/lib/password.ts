import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

/** Hachage scrypt (N=16384, r=8, p=1) avec sel aléatoire. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
  });
  return `scrypt$${SCRYPT_COST}$8$1$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, cost, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const derived = await scryptAsync(password.normalize("NFKC"), salt, hash.length / 2, {
      N: Number(cost),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("au moins 8 caractères");
  if (!/[a-zA-Z]/.test(password)) issues.push("au moins une lettre");
  if (!/[0-9]/.test(password)) issues.push("au moins un chiffre");
  return issues;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
