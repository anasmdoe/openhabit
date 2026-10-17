// Outgoing email for verification and password-reset links.
//   MAIL_TRANSPORT = smtp | webhook | log   (unset = email is off)
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

export const mailEnabled = ['smtp', 'webhook', 'log'].includes(TRANSPORT) && /^https?:\/\/[^/]+/.test(PUBLIC_URL)
  && (TRANSPORT !== 'smtp' || !!process.env.SMTP_URL)
  && (TRANSPORT !== 'webhook' || /^https?:\/\//.test(process.env.MAIL_WEBHOOK_URL || ''));

if (TRANSPORT && !mailEnabled) {
  console.error('mail: MAIL_TRANSPORT is set but incomplete (needs PUBLIC_URL plus SMTP_URL or MAIL_WEBHOOK_URL); email features are off');
}

let smtp;
export async function sendMail({ to, subject, text }) {
  if (!mailEnabled) throw new Error('email is not configured');
  if (TRANSPORT === 'smtp') {
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

export const verifyLink = (token) => `${PUBLIC_URL}/?verify=${encodeURIComponent(token)}`;
export const resetLink = (token) => `${PUBLIC_URL}/?reset=${encodeURIComponent(token)}`;

export const verifyMessage = (name, token) => ({
  subject: 'Confirm your email for OpenHabit',
  text: `Hi${name ? ` ${name}` : ''},\n\nConfirm your email address to finish setting up OpenHabit:\n\n${verifyLink(token)}\n\n` +
    'The link works once and expires in 24 hours. If you did not create an account, ignore this message.\n',
});

export const resetMessage = (name, token) => ({
  subject: 'Reset your OpenHabit password',
  text: `Hi${name ? ` ${name}` : ''},\n\nSomeone asked to reset the password for this OpenHabit account. To choose a new one:\n\n${resetLink(token)}\n\n` +
    'The link works once and expires in 1 hour. If it was not you, ignore this message; your password has not changed.\n',
});
