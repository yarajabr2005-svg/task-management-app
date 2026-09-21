import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/utils/jwt.js';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

test('creates and verifies an access token with only documented claims', () => {
  const token = createAccessToken({ sub: 'user-id', role: 'user' });
  const payload = verifyAccessToken(token);

  assert.deepEqual(payload.sub, 'user-id');
  assert.equal(payload.role, 'user');
  assert.equal(payload.iss, 'test-issuer');
  assert.equal(payload.aud, 'test-audience');
  assert.equal(typeof payload.iat, 'number');
  assert.equal(typeof payload.exp, 'number');
  assert.equal(Object.hasOwn(payload, 'email'), false);
});

test('creates and verifies a refresh token with a separate token identity', () => {
  const token = createRefreshToken({ sub: 'user-id' });
  const payload = verifyRefreshToken(token);

  assert.equal(payload.sub, 'user-id');
  assert.equal(typeof payload.jti, 'string');
  assert.equal(Object.hasOwn(payload, 'role'), false);
});

test('rejects an access token with the refresh secret or an invalid token', () => {
  const refreshToken = createRefreshToken({ sub: 'user-id' });

  assert.throws(
    () => verifyAccessToken(refreshToken),
    (error) => error.code === 'UNAUTHENTICATED' && error.statusCode === 401,
  );
  assert.throws(
    () => verifyAccessToken('not-a-jwt'),
    (error) => error.code === 'UNAUTHENTICATED' && error.statusCode === 401,
  );
});

test('rejects unsupported claims before signing', () => {
  assert.throws(
    () => createAccessToken({ sub: 'user-id', role: 'user', email: 'user@example.com' }),
    /unsupported claim\(s\): email/,
  );
});