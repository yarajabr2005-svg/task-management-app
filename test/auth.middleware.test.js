import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth } from '../src/middlewares/auth.middleware.js';
import { AuthenticationError, AuthorizationError } from '../src/utils/errors.js';

function createUserModel(user) {
  return {
    findOne(filter) {
      assert.deepEqual(filter, { _id: 'user-id', isDeleted: false });
      return { exec: async () => user };
    },
  };
}

function createRequest(authorization) {
  return { headers: { authorization } };
}

const payload = { sub: 'user-id', role: 'user' };
const user = {
  _id: 'user-id',
  email: 'user@example.com',
  username: 'yara_dev',
  role: 'user',
  emailVerified: true,
  emailVerifiedAt: new Date('2026-09-18T14:20:00.000Z'),
  avatar: null,
  bio: '',
  timezone: 'UTC',
  createdAt: new Date('2026-09-18T14:13:00.000Z'),
  updatedAt: new Date('2026-09-18T14:20:00.000Z'),
  passwordHash: 'must-not-be-attached',
  isDeleted: false,
};

test('verifies Bearer token and attaches only safe user fields', async () => {
  const request = createRequest('Bearer access-token');
  const requireAuth = createRequireAuth({
    UserModel: createUserModel(user),
    verifyToken: (token) => {
      assert.equal(token, 'access-token');
      return payload;
    },
  });

  await requireAuth(request, {}, () => {});

  assert.equal(request.user.id, 'user-id');
  assert.equal(request.user.email, user.email);
  assert.equal(Object.hasOwn(request.user, 'passwordHash'), false);
  assert.equal(Object.hasOwn(request.user, 'isDeleted'), false);
});

test('rejects missing or malformed authorization headers', async () => {
  const requireAuth = createRequireAuth({ verifyToken: () => payload });

  await assert.rejects(
    () => requireAuth(createRequest(undefined), {}, () => {}),
    (error) => error instanceof AuthenticationError && error.code === 'UNAUTHENTICATED',
  );
  await assert.rejects(
    () => requireAuth(createRequest('Basic credentials'), {}, () => {}),
    (error) => error instanceof AuthenticationError && error.statusCode === 401,
  );
});

test('rejects deleted and disabled accounts', async () => {
  const deletedRequireAuth = createRequireAuth({
    UserModel: createUserModel(null),
    verifyToken: () => payload,
  });
  await assert.rejects(
    () => deletedRequireAuth(createRequest('Bearer access-token'), {}, () => {}),
    (error) => error instanceof AuthenticationError,
  );

  const disabledRequireAuth = createRequireAuth({
    UserModel: createUserModel({ ...user, isDisabled: true }),
    verifyToken: () => payload,
  });
  await assert.rejects(
    () => disabledRequireAuth(createRequest('Bearer access-token'), {}, () => {}),
    (error) => error instanceof AuthorizationError && error.code === 'ACCOUNT_DISABLED',
  );
});