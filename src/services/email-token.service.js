import EmailToken from '../models/email-token.model.js';
import { GoneError, ResourceNotFoundError, ValidationError } from '../utils/errors.js';
import {
  generateEmailToken,
  getEmailTokenExpiration,
  hashEmailToken,
  verifyEmailToken,
} from '../utils/email-token.js';

const TOKEN_TYPES = new Set(['verification', 'reset']);

function assertTokenType(type) {
  if (!TOKEN_TYPES.has(type)) {
    throw new ValidationError('Email token type is invalid.', undefined, 'VALIDATION_ERROR');
  }
}

function normalizeTimestamp(now) {
  const timestamp = new Date(now);

  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationError('Email token timestamp is invalid.');
  }

  return timestamp;
}

function tokenNotFoundError(type) {
  const name = type === 'verification' ? 'VERIFICATION' : 'RESET';
  return new ResourceNotFoundError(
    'Email token was not found.',
    undefined,
    `${name}_TOKEN_NOT_FOUND`,
  );
}

export async function issueEmailToken({ userId, type, now = new Date(), EmailTokenModel = EmailToken }) {
  assertTokenType(type);

  const rawToken = generateEmailToken();
  const issuedAt = normalizeTimestamp(now);

  await EmailTokenModel.updateMany(
    { userId, type, usedAt: null },
    { $set: { usedAt: issuedAt } },
  ).exec();

  const tokenRecord = await EmailTokenModel.create({
    userId,
    hashedToken: hashEmailToken(rawToken),
    type,
    expiresAt: getEmailTokenExpiration(type, issuedAt.getTime()),
    usedAt: null,
  });

  return { rawToken, tokenRecord };
}

export async function consumeEmailToken({
  rawToken,
  type,
  now = new Date(),
  EmailTokenModel = EmailToken,
}) {
  assertTokenType(type);
  const consumedAt = normalizeTimestamp(now);

  const hashedToken = hashEmailToken(rawToken);
  const tokenRecord = await EmailTokenModel.findOne({ hashedToken, type })
    .select('+hashedToken')
    .exec();

  if (!tokenRecord) {
    throw tokenNotFoundError(type);
  }

  verifyEmailToken(tokenRecord.hashedToken, rawToken, {
    expiresAt: tokenRecord.expiresAt,
    usedAt: tokenRecord.usedAt,
    type,
    now: consumedAt,
  });

  const consumedRecord = await EmailTokenModel.findOneAndUpdate(
    {
      _id: tokenRecord._id,
      usedAt: null,
      expiresAt: { $gt: consumedAt },
    },
    { $set: { usedAt: consumedAt } },
    { new: true },
  ).exec();

  if (!consumedRecord) {
    const tokenExpired = tokenRecord.expiresAt.getTime() <= consumedAt.getTime();
    throw new GoneError(
      'Email token is no longer available.',
      undefined,
      `${type.toUpperCase()}_TOKEN_${tokenExpired ? 'EXPIRED' : 'USED'}`,
    );
  }

  return consumedRecord;
}