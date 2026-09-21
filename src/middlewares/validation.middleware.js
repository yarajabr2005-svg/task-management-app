import { ValidationError } from '../utils/errors.js';
import {
  requestTargets,
  validateRequest,
} from '../validation/index.js';

export function validate(schema, target) {
  if (!requestTargets.includes(target)) {
    throw new TypeError(
      `Unsupported validation target "${target}". Expected one of: ${requestTargets.join(', ')}.`,
    );
  }

  return function validationMiddleware(request, _response, next) {
    const result = validateRequest(schema, request[target], target);

    if (!result.success) {
      next(new ValidationError(undefined, result.details));
      return;
    }

    Object.defineProperty(request, target, {
      configurable: true,
      enumerable: true,
      value: result.data,
      writable: true,
    });
    next();
  };
}