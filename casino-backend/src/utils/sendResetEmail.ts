import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const getEmailContent = (resetUrl: string) => ({
  subject: 'Password Reset Request',
  text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
  html: `<p>You requested a password reset. Click the link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
});

export const sendResetEmail = async (to: string, token: string) => {
  try {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const { subject, text, html } = getEmailContent(resetUrl);

    const msg = {
      to,
      from: process.env.EMAIL_FROM || 'default@example.com',
      subject,
      text,
      html,
    };

    await sgMail.send(msg);
  } catch (error) {
    console.error('Failed to send reset email:', error);
    throw new Error('Failed to send reset email');
  }
};
