import { hash, verify } from '@node-rs/argon2';

// argon2id with OWASP's minimum recommended parameters.
const params = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, params);

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Burns comparable time when there is no user, so login timing doesn't reveal which emails exist. */
const dummy = hash('timing-equaliser-not-a-password', params);
export async function verifyAgainstDummy(password: string) {
  await verifyPassword(await dummy, password);
}
