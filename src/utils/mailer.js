const nodemailer = require('nodemailer');
const eventBus = require('./eventBus');

const port = Number(process.env.SMTP_PORT) || 587;

// Without SMTP_HOST, messages are rendered as JSON and never leave the machine
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : nodemailer.createTransport({ jsonTransport: true });

const sendResetEmail = async ({ email, token }) => {
  const link = `${process.env.APP_URL}/reset-password?token=${token}`;
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Password reset',
    text: `Use this token to reset your password (valid for 15 minutes): ${token}\n\n${link}`,
    html: `<p>Use this token to reset your password (valid for 15 minutes): <code>${token}</code></p><p><a href="${link}">Reset password</a></p>`,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`Password reset email preview: ${preview}`);
  return info;
};

eventBus.on('passwordResetRequested', (data) =>
  sendResetEmail(data).catch((err) => console.error('Password reset email failed:', err.message)),
);

module.exports = { sendResetEmail };
