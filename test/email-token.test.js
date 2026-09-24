import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailProvider } from '../src/providers/email-provider.js';
import {
  consumeEmailToken,
  issueEmailToken,
} from '../src/services/email-token.service.js';
import {
  EMAIL_TOKEN_TTL_MS,
  generateEmailToken,
  getEmailTokenExpiration,
  hashEmailToken,
  verifyEmailToken,
} from '../src/utils/email-token.js';

function query(value) {
  return {
    select() {
      return this;
    },
    exec: async () => value,
  };
}

test('issues and atomically consumes a token through the contract service', async () => {
  const records = [];
  const emailTokenModel = {
    updateMany() {
      return query({ acknowledged: true });
    },
    async create(record) {
      const created = { _id: 'token-id', ...record };
      records.push(created);
      return created;
    },
    findOne() {
      return query(records[0] ?? null);
    },
    findOneAndUpdate() {
      return query(records[0] ?? null);
    },
  };

  const issued = await issueEmailToken({
    userId: 'user-id',
    type: 'verification',
    now: new Date('2026-09-24T12:00:00.000Z'),
    EmailTokenModel: emailTokenModel,
  });
  const consumed = await consumeEmailToken({
    rawToken: issued.rawToken,
    type: 'verification',
    now: new Date('2026-09-24T12:01:00.000Z'),
    EmailTokenModel: emailTokenModel,
  });

  assert.equal(consumed._id, 'token-id');
  assert.equal(issued.tokenRecord.hashedToken.length, 64);
});

test('provides an injectable verification and reset email adapter', async () => {
  const messages = [];
  const provider = createEmailProvider(async (message) => {
    messages.push(message);
  });

  await provider.sendVerificationEmail({ to: 'user@example.com', token: 'verification' });
  await provider.sendPasswordResetEmail({ to: 'user@example.com', token: 'reset' });

  assert.deepEqual(messages.map(({ type }) => type), ['verification', 'reset']);
  assert.throws(() => createEmailProvider(), TypeError);
});

test('uses the contract token lifetimes', () => {
  const now = Date.now();

  assert.equal(getEmailTokenExpiration('verification', now).getTime(), now + EMAIL_TOKEN_TTL_MS.verification);
  assert.equal(getEmailTokenExpiration('reset', now).getTime(), now + EMAIL_TOKEN_TTL_MS.reset);
  assert.throws(() => getEmailTokenExpiration('other', now), TypeError);
});

test('generates a cryptographically random token and hashes it', () => {
  const token = generateEmailToken();

  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.match(hashEmailToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(token, generateEmailToken());
});

test('verifies a valid token and rejects a mismatched token', () => {
  const token = generateEmailToken();
  const hashedToken = hashEmailToken(token);

  assert.equal(
    verifyEmailToken(hashedToken, token, {
      type: 'verification',
      expiresAt: new Date(Date.now() + 60_000),
    }),
    true,
  );

  assert.throws(
    () => verifyEmailToken(hashedToken, 'invalid-token', { type: 'verification' }),
    { code: 'EMAIL_TOKEN_INVALID', statusCode: 401 },
  );
});

test('rejects expired and already-used tokens with contract errors', () => {
  const token = generateEmailToken();
  const hashedToken = hashEmailToken(token);

  assert.throws(
    () => verifyEmailToken(hashedToken, token, {
      type: 'reset',
      expiresAt: new Date(Date.now() - 1),
    }),
    { code: 'RESET_TOKEN_EXPIRED', statusCode: 410 },
  );

  assert.throws(
    () => verifyEmailToken(hashedToken, token, {
      type: 'verification',
      usedAt: new Date(),
    }),
    { code: 'VERIFICATION_TOKEN_USED', statusCode: 410 },
  );
});