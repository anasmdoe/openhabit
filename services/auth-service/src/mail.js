// Verification and password-reset emails. The transport lives in mailer.js (shared with reminder-service).
import { PUBLIC_URL } from './mailer.js';
export { mailEnabled, sendMail } from './mailer.js';

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
