// adapters/mailer.ses.js
// -----------------------------------------------------------------
// AWS VERSION OF THE MAILER ADAPTER - NOT IMPLEMENTED.
//
//   AWS service: Amazon SES (Simple Email Service)
//   npm package: @aws-sdk/client-sesv2
//                -> npm install @aws-sdk/client-sesv2
//   Turn on with: MAIL_MODE=ses
//
// This is the smallest adapter, and a good one to do first.
//
// BEFORE ANY CODE: two things catch everyone out.
//
// 1. You must VERIFY the sender. SES will not send from an address or
//    domain you have not proved you own. Verify either the single
//    address in MAIL_FROM, or (better) the whole domain with DKIM.
//
// 2. A new SES account is in the SANDBOX. In the sandbox you can only
//    send TO verified addresses, so mail to a patient's real inbox is
//    silently refused. That is fine for learning - verify your own
//    address and send to yourself. To send to anyone, request
//    production access in the SES console.
//
// IAM: the instance role needs ses:SendEmail on your identity. No
// access keys in this file; the SDK uses the instance role.
// -----------------------------------------------------------------

const config = require('../config');
const logger = require('../lib/logger');

// TODO (SES): const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
// let client = null;

// -----------------------------------------------------------------
// TODO (SES): create the client.
//
//   client = new SESv2Client({ region: config.mail.sesRegion });
//
// Note SES is regional and your verified identity lives in one region.
// config.mail.sesRegion falls back to AWS_REGION.
// Fail fast here if config.mail.from is empty.
// -----------------------------------------------------------------
async function init() {
  throw new Error(
    'mailer.ses.init() is not implemented yet. Fill it in, or run with MAIL_MODE=console.'
  );
}

// -----------------------------------------------------------------
// TODO (SES): send the email.
//
//   const response = await client.send(new SendEmailCommand({
//     FromEmailAddress: config.mail.from,
//     Destination: { ToAddresses: [to] },
//     Content: {
//       Simple: {
//         Subject: { Data: subject, Charset: 'UTF-8' },
//         Body: { Text: { Data: text, Charset: 'UTF-8' } },
//       },
//     },
//   }));
//   return { messageId: response.MessageId, delivered: true };
//
// TWO THINGS TO KEEP FROM mailer.console.js
//
// * Log that mail was sent, with the recipient and subject, but NEVER
//   the body. Password reset links and temporary passwords travel in
//   that body, and a log line is not the place for either.
//
// * Decide what a failure should do. This app sends mail during
//   forgot-password and when an admin creates a doctor. If SES is down
//   or throttled, do you fail the whole request, or log the error and
//   carry on? Failing is honest ("we could not send it"); carrying on
//   leaves the user waiting for an email that will never arrive. For
//   password reset, failing is the better answer - and note that
//   routes/auth.routes.js deliberately returns the same response
//   whether or not the account exists, so think about what the user
//   should see.
//
// ALSO WORTH KNOWING once it works:
//   * SES throttles you (a sending rate per second). Bulk mail needs
//     queueing - SQS, or SES's own bulk API.
//   * Set up bounce and complaint handling via SNS. Ignoring bounces
//     ruins your sender reputation, and AWS will eventually suspend
//     sending.
// -----------------------------------------------------------------
async function send({ to, subject, text }) {
  throw new Error(
    'mailer.ses.send() is not implemented yet. Fill it in, or run with MAIL_MODE=console.'
  );
}

function describe() {
  return {
    mode: 'ses',
    from: config.mail.from,
    region: config.mail.sesRegion || '(SES_REGION not set)',
    implemented: false,
  };
}

module.exports = { init, send, describe };
