import { AppError, ValidationError } from '../utils/errors.js';

export function notFoundMiddleware(request, _response, next) {
  const error = new AppError({
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${request.method} ${request.originalUrl} was not found.`,
    statusCode: 404,
  });

  next(error);
}

export function errorMiddleware(error, _request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const normalizedError = error.type === 'entity.parse.failed'
    ? new ValidationError('Request body contains malformed JSON.')
    : error;
  const isExpectedError = normalizedError instanceof AppError;
  const statusCode = isExpectedError ? normalizedError.statusCode : 500;
  const code = isExpectedError ? normalizedError.code : 'INTERNAL_SERVER_ERROR';
  const message = isExpectedError
    ? normalizedError.message
    : 'An unexpected error occurred.';
  const details = isExpectedError && normalizedError.details !== undefined
    ? normalizedError.details
    : {};

  if (!isExpectedError) {
    console.error(normalizedError);
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
      details,
    },
  });
}