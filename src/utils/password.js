import bcrypt from 'bcrypt';
import { AuthenticationError, ValidationError } from './errors.js';

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 31;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials.';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}(?![\s\S])/;

function getSaltRounds() {
  const configuredRounds = process.env.BCRYPT_SALT_ROUNDS?.trim();
  const saltRounds = Number(configuredRounds);

  if (
    !configuredRounds
    || !Number.isInteger(saltRounds)
    || saltRounds < MIN_SALT_ROUNDS
    || saltRounds > MAX_SALT_ROUNDS
  ) {
    throw new Error(
      `BCRYPT_SALT_ROUNDS must be an integer between ${MIN_SALT_ROUNDS} and ${MAX_SALT_ROUNDS}.`,
    );
  }

  return saltRounds;
}

function assertPlainPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new ValidationError('Password must be a non-empty string.');
  }

  if (Buffer.byteLength(plainPassword, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES) {
    throw new ValidationError('Password must not exceed 72 UTF-8 bytes.');
  }
}

function invalidCredentialsError() {
  return new AuthenticationError(
    INVALID_CREDENTIALS_MESSAGE,
    undefined,
    'INVALID_CREDENTIALS',
  );
}

export async function hashPassword(plainPassword) {
  assertPlainPassword(plainPassword);
  const saltRounds = getSaltRounds();

  try {
    return await bcrypt.hash(plainPassword, saltRounds);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error('Password hashing failed.');
  }
}

export async function comparePassword(plainPassword, hashedPassword) {
  if (
    typeof plainPassword !== 'string'
    || plainPassword.length === 0
    || typeof hashedPassword !== 'string'
    || hashedPassword.length === 0
  ) {
    throw invalidCredentialsError();
  }

  if (Buffer.byteLength(plainPassword, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES) {
    throw invalidCredentialsError();
  }

  if (!BCRYPT_HASH_PATTERN.test(hashedPassword)) {
    throw invalidCredentialsError();
  }

  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (_error) {
    throw invalidCredentialsError();
  }
}