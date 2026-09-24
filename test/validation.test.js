import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  isObjectId,
  objectIdSchema,
  validateRequest,
} from '../src/validation/index.js';
import { validate } from '../src/middlewares/validation.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

const validObjectId = '64f1c9b8f1a2c00123456789';

test('validates MongoDB ObjectIds', () => {
  assert.equal(isObjectId(validObjectId), true);
  assert.equal(isObjectId('not-an-object-id'), false);
  assert.equal(isObjectId(`${validObjectId}\n`), false);
  assert.equal(objectIdSchema.safeParse(`${validObjectId}\n`).success, false);
  assert.equal(objectIdSchema.safeParse(validObjectId).success, true);
});

test('reports field paths for every request target', () => {
  for (const target of ['body', 'query', 'params', 'cookies', 'headers']) {
    const result = validateRequest(z.object({ name: z.string() }), {}, target);

    assert.equal(result.success, false);
    assert.equal(result.details[0].field, `${target}.name`);
  }
});

test('middleware replaces the request target with parsed data', () => {
  const request = { query: { page: '2' } };
  const schema = z.object({ page: z.coerce.number().int().positive() });
  let nextError;

  validate(schema, 'query')(request, {}, (error) => {
    nextError = error;
  });

  assert.equal(nextError, undefined);
  assert.equal(request.query.page, 2);
});

test('middleware forwards validation failures as ValidationError', () => {
  const request = { params: { id: 'invalid' } };
  let nextError;

  validate(z.object({ id: objectIdSchema }), 'params')(request, {}, (error) => {
    nextError = error;
  });

  assert.equal(nextError.code, 'VALIDATION_ERROR');
  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.details[0].field, 'params.id');
});

test('global error middleware translates malformed JSON errors', () => {
  let responseBody;
  let responseStatus;
  const response = {
    headersSent: false,
    status(statusCode) {
      responseStatus = statusCode;
      return this;
    },
    json(body) {
      responseBody = body;
    },
  };

  errorMiddleware({ type: 'entity.parse.failed' }, {}, response, () => {});

  assert.equal(responseStatus, 400);
  assert.equal(responseBody.error.code, 'VALIDATION_ERROR');
  assert.equal(responseBody.error.message, 'Request body contains malformed JSON.');
});