// adapters/mailer.console.js
// -----------------------------------------------------------------
// LOCAL implementation of the mailer: write the email to the terminal.
//
// The message is printed as a readable block rather than a JSON log
// line, because the whole point is that a student can SEE the reset
// link and click it. Everything else in this app logs JSON; this is the
// deliberate exception.
// -----------------------------------------------------------------

const crypto = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');

async function send({ to, subject, text }) {
  const messageId = `console-${crypto.randomUUID()}`;

  // A structured line first, so log tooling still sees that mail was sent.
  // Note it records the recipient and subject but NOT the body: reset
  // links are as good as passwords and must not sit in a log file.
  logger.info('Email sent', { mailMode: 'console', to, subject, messageId });

  const divider = '='.repeat(68);
  process.stdout.write(
    `\n${divider}\n` +
      `EMAIL (not really sent - MAIL_MODE=console)\n` +
      `${divider}\n` +
      `From:    ${config.mail.from}\n` +
      `To:      ${to}\n` +
      `Subject: ${subject}\n` +
      `${'-'.repeat(68)}\n` +
      `${text}\n` +
      `${divider}\n\n`
  );

  return { messageId, delivered: true };
}

function describe() {
  return { mode: 'console', from: config.mail.from };
}

module.exports = { send, describe };
