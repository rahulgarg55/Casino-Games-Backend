import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export const sendVerificationEmail = async (
  to: string,
  verificationToken: string,
) => {
  const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
  const msg = {
    to,
    from: process.env.EMAIL_FROM!,
    subject: 'Verify Your Email Address',
    text: `Please verify your email by clicking on the link: ${verificationLink}`,
    html: `
      <h1>Verify Your Email Address</h1>
      <p>Thank you for registering! Please verify your email by clicking the link below:</p>
      <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>If you did not register, please ignore this email.</p>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Verification email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send verification email');
  }
};
