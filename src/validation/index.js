import { z } from 'zod';

const objectIdPattern = /^[0-9a-fA-F]{24}(?![\s\S])/;

export const requestTargets = Object.freeze([
  'body',
  'query',
  'params',
  'cookies',
  'headers',
]);

export const objectIdSchema = z.string().regex(
  objectIdPattern,
  'Must be a valid MongoDB ObjectId.',
);

export function isObjectId(value) {
  return typeof value === 'string' && objectIdPattern.test(value);
}

export function validateRequest(schema, value, target) {
  const result = schema.safeParse(value);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: [target, ...issue.path].join('.'),
      code: issue.code,
      message: issue.message,
    }));

    return { success: false, details };
  }

  return { success: true, data: result.data };
}

export const validateBody = (schema, value) => validateRequest(schema, value, 'body');
export const validateQuery = (schema, value) => validateRequest(schema, value, 'query');
export const validateParams = (schema, value) => validateRequest(schema, value, 'params');
export const validateCookies = (schema, value) => validateRequest(schema, value, 'cookies');
export const validateHeaders = (schema, value) => validateRequest(schema, value, 'headers');