// adapters/mailer.js
// -----------------------------------------------------------------
// ADAPTER SWITCH: how email is sent.
//
//   MAIL_MODE=console (default) -> print the email to the backend log
//   MAIL_MODE=ses               -> Amazon SES
//
// WHY console mode: password reset needs email, and making students
// configure an SMTP server (or verify an SES identity) before they can
// log in would stop the lesson before it starts. Printing the reset
// link to the terminal is enough to finish the flow locally.
//
// INTERFACE every implementation must provide:
//   send({ to, subject, text, html? }) -> Promise<{ messageId, delivered }>
//   describe() -> { mode, from }
// -----------------------------------------------------------------

const config = require('../config');

const implementation =
  config.modes.mail === 'ses' ? require('./mailer.ses') : require('./mailer.console');

module.exports = implementation;
