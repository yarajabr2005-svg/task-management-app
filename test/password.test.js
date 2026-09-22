import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePassword,
  hashPassword,
} from '../src/utils/password.js';

process.env.BCRYPT_SALT_ROUNDS = '10';

test('hashes and compares passwords without returning plaintext', async () => {
  const password = 'PlainTextPassword123!';
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.match(passwordHash, /^\$2[aby]\$10\$/);
  assert.equal(await comparePassword(password, passwordHash), true);
  assert.equal(await comparePassword('WrongPassword123!', passwordHash), false);
});

test('uses a unique salt for each password hash', async () => {
  const firstHash = await hashPassword('PlainTextPassword123!');
  const secondHash = await hashPassword('PlainTextPassword123!');

  assert.notEqual(firstHash, secondHash);
});

test('rejects invalid passwords before hashing', async () => {
  await assert.rejects(
    () => hashPassword(''),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
  await assert.rejects(
    () => hashPassword('a'.repeat(73)),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
});

test('translates invalid comparison input into generic authentication errors', async () => {
  await assert.rejects(
    () => comparePassword('', 'not-a-hash'),
    (error) => error.code === 'INVALID_CREDENTIALS' && error.statusCode === 401,
  );
  await assert.rejects(
    () => comparePassword('password', 'not-a-hash'),
    (error) => error.code === 'INVALID_CREDENTIALS' && error.statusCode === 401,
  );
});

test('rejects an unsafe bcrypt cost-factor configuration', async () => {
  const originalRounds = process.env.BCRYPT_SALT_ROUNDS;
  process.env.BCRYPT_SALT_ROUNDS = '9';

  await assert.rejects(
    () => hashPassword('PlainTextPassword123!'),
    /BCRYPT_SALT_ROUNDS must be an integer between 10 and 31/,
  );

  process.env.BCRYPT_SALT_ROUNDS = originalRounds;
});