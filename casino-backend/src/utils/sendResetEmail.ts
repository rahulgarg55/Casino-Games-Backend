import nodemailer from 'nodemailer';
import { createTransport, TransportOptions } from 'nodemailer';

let transporter = nodemailer.createTransport({
  service: "gmail",
  port:465,
  secure:true,
  logger:true,
  secureConnection:false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls:{
    rejectUnauthorized:true
  }
} as TransportOptions);

const getEmailContent = (resetUrl: string) => ({
  subject: 'Password Reset Request',
  text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
  html: `<p>You requested a password reset. Click the link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
});

export const sendResetEmail = async (to: string, token: string) => {
  console.log('to', to);
  console.log('token', token)
  try {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const { subject, text, html } = getEmailContent(resetUrl);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send reset email:', error);
    throw new Error('Failed to send reset email');
  }
};