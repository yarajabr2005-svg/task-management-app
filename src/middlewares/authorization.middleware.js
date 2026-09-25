import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

export function requireRole(role) {
  if (typeof role !== 'string' || role.trim().length === 0) {
    throw new TypeError('A non-empty role is required.');
  }

  return function roleAuthorizationMiddleware(request, _response, next) {
    if (!request.user) {
      throw new AuthenticationError();
    }

    if (request.user.role !== role) {
      throw new AuthorizationError(
        'You are not authorized to perform this action.',
        undefined,
        'FORBIDDEN',
      );
    }

    next();
  };
}