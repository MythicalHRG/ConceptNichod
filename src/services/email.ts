import 'server-only';
import { createTransport, type Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;
let cachedCredKey: string | null = null;

function getTransporter(): { transporter: Transporter; user: string } {
  const user = process.env.EMAIL_SERVER_USER?.trim();
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'Missing EMAIL_SERVER_USER or EMAIL_SERVER_PASSWORD environment variables.'
    );
  }

  const credKey = `${user}\0${pass}`;
  if (!cachedTransporter || cachedCredKey !== credKey) {
    cachedTransporter = createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    cachedCredKey = credKey;
  }

  return { transporter: cachedTransporter, user };
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const cleanTo = typeof to === 'string' ? to.trim() : '';
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  if (!cleanTo || /[\r\n\0]/.test(cleanTo) || !cleanTo.includes('@')) {
    throw new Error('Invalid email recipient.');
  }
  if (!cleanSubject || /[\r\n\0]/.test(cleanSubject)) {
    throw new Error('Invalid email subject.');
  }
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Email HTML body is required.');
  }

  const { transporter, user } = getTransporter();

  const mailOptions = {
    from: user,
    to: cleanTo,
    subject: cleanSubject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Failed to send email via SMTP:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Could not send email.');
  }
}
