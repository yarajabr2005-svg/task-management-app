import { AppError } from '../utils/errors.js';

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

  const isExpectedError = error instanceof AppError;
  const statusCode = isExpectedError ? error.statusCode : 500;
  const code = isExpectedError ? error.code : 'INTERNAL_SERVER_ERROR';
  const message = isExpectedError
    ? error.message
    : 'An unexpected error occurred.';
  const details = isExpectedError && error.details !== undefined
    ? error.details
    : {};

  if (!isExpectedError) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
      details,
    },
  });
}