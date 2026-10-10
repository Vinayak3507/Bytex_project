import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const id = () => randomUUID();
export const token = () => randomBytes(32).toString('base64url');
export const hashToken = (value) => createHash('sha256').update(value).digest('hex');

export const tokensMatch = (provided, expectedHash) => {
  if (!provided || !expectedHash) return false;
  const given = Buffer.from(hashToken(provided));
  const expected = Buffer.from(expectedHash);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

export const joinCode = () => randomBytes(4).toString('hex').toUpperCase();
