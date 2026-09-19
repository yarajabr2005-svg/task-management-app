class AppError extends Error {
  constructor({ code, message, statusCode, details }) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;

    if (details !== undefined) {
      this.details = details;
    }

    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed.', details, code = 'VALIDATION_ERROR') {
    super({ code, message, statusCode: 400, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication is required.', details, code = 'UNAUTHENTICATED') {
    super({ code, message, statusCode: 401, details });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You are not authorized to perform this action.', details, code = 'FORBIDDEN') {
    super({ code, message, statusCode: 403, details });
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', details, code = 'RESOURCE_NOT_FOUND') {
    super({ code, message, statusCode: 404, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with the current state of the resource.', details, code = 'CONFLICT') {
    super({ code, message, statusCode: 409, details });
  }
}

export class GoneError extends AppError {
  constructor(message = 'The requested resource is no longer available.', details, code = 'GONE') {
    super({ code, message, statusCode: 410, details });
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'The request violates a business rule.', details, code = 'UNPROCESSABLE_ENTITY') {
    super({ code, message, statusCode: 422, details });
  }
}

export { AppError };