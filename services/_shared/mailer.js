// Outgoing email transport shared by auth-service (verification and reset links) and reminder-service (the weekly review).
// Copied into each service as src/mailer.js: keep the copies identical (CI checks).
//   MAIL_TRANSPORT = ses | smtp | webhook | log   (unset = email is off)
//   ses            = the Amazon SES API, using the function's IAM role (AWS Lambda only: the SDK comes with the
//                    Lambda runtime). MAIL_FROM must be a verified SES identity.
//   MAIL_FROM      = "OpenHabit <no-reply@example.com>"
//   SMTP_URL       = smtp://user:pass@host:587  or  smtps://user:pass@host:465
//                    (Amazon SES, Mailgun, Gmail app passwords... all speak SMTP)
//   MAIL_WEBHOOK_URL = receives {to, subject, text} as JSON (Home Assistant, n8n, a script...)
//   PUBLIC_URL     = the https:// address users open the app at; links in emails point here.
//                    It is never taken from the request: that would let anyone aim a victim's
//                    reset link at their own server.
// "log" prints the whole message, links included, to the service log: for local development only.
import nodemailer from 'nodemailer';

const TRANSPORT = (process.env.MAIL_TRANSPORT || '').toLowerCase();
const FROM = process.env.MAIL_FROM || 'OpenHabit <no-reply@localhost>';
export const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

export const mailEnabled = ['ses', 'smtp', 'webhook', 'log'].includes(TRANSPORT) && /^https?:\/\/[^/]+/.test(PUBLIC_URL)
  && (TRANSPORT !== 'smtp' || !!process.env.SMTP_URL)
  && (TRANSPORT !== 'webhook' || /^https?:\/\//.test(process.env.MAIL_WEBHOOK_URL || ''));

if (TRANSPORT && !mailEnabled) {
  console.error('mail: MAIL_TRANSPORT is set but incomplete (needs PUBLIC_URL plus SMTP_URL or MAIL_WEBHOOK_URL); email features are off');
}

let smtp;
let sesClient;
export async function sendMail({ to, subject, text }) {
  if (!mailEnabled) throw new Error('email is not configured');
  if (TRANSPORT === 'ses') {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    sesClient ||= new SESv2Client({});
    await sesClient.send(new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
    }));
  } else if (TRANSPORT === 'smtp') {
    smtp ||= nodemailer.createTransport(process.env.SMTP_URL);
    await smtp.sendMail({ from: FROM, to, subject, text });
  } else if (TRANSPORT === 'webhook') {
    const res = await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, text }), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`mail webhook answered ${res.status}`);
  } else {
    console.log(`mail (log transport) to ${to}: ${subject}\n${text}`);
  }
}
