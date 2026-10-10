import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const scrypt = promisify(scryptCallback);
const SCRYPT_COST = 32_768;
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const sessionExpiresAt = (now = Date.now()) => new Date(now + SESSION_TTL_MS).toISOString();

export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT_COST}$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

export const verifyPassword = async (password, encoded) => {
  const [algorithm, cost, blockSize, parallelism, saltText, keyText] = String(encoded ?? '').split('$');
  if (algorithm !== 'scrypt' || Number(cost) !== SCRYPT_COST || blockSize !== '8' || parallelism !== '1' || !saltText || !keyText) return false;
  try {
    const expected = Buffer.from(keyText, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, {
      N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

export const publicHost = (host) => ({ id: host.id, email: host.email, createdAt: host.createdAt });
