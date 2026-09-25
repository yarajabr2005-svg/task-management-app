import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/middlewares/authorization.middleware.js';
import { AuthenticationError, AuthorizationError } from '../src/utils/errors.js';

test('allows an authenticated user with the required role', () => {
  const request = { user: { id: 'admin-id', role: 'admin' } };
  let nextCalled = false;

  requireRole('admin')(request, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('rejects an authenticated user without the required role', () => {
  assert.throws(
    () => requireRole('admin')({ user: { id: 'user-id', role: 'user' } }, {}, () => {}),
    (error) => error instanceof AuthorizationError
      && error.statusCode === 403
      && error.code === 'FORBIDDEN',
  );
});

test('requires authentication before checking a role', () => {
  assert.throws(
    () => requireRole('admin')({}, {}, () => {}),
    (error) => error instanceof AuthenticationError
      && error.statusCode === 401
      && error.code === 'UNAUTHENTICATED',
  );
});

test('rejects an empty role configuration', () => {
  assert.throws(() => requireRole(''), /non-empty role/);
  assert.throws(() => requireRole(), /non-empty role/);
});