import { createHash, randomBytes } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');
