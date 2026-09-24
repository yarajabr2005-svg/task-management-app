function requireRecipient(message) {
  if (!message || typeof message.to !== 'string' || message.to.trim() === '') {
    throw new TypeError('Email messages require a recipient.');
  }
}

export function createEmailProvider(sendEmail) {
  if (typeof sendEmail !== 'function') {
    throw new TypeError('Email provider requires a sendEmail function.');
  }

  return Object.freeze({
    sendVerificationEmail(message) {
      requireRecipient(message);
      return sendEmail({ ...message, type: 'verification' });
    },

    sendPasswordResetEmail(message) {
      requireRecipient(message);
      return sendEmail({ ...message, type: 'reset' });
    },
  });
}