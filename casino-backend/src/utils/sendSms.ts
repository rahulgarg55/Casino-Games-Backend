import twilio, { Twilio } from 'twilio';
import { logger } from './logger';

process.env.TWILIO_LOG_LEVEL = 'debug';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

/**
 * Formats a phone number to E.164 using country code and phone number.
 * If the phone number already starts with '+', returns as is.
 */
export function formatE164PhoneNumber(countryCode: string, phoneNumber: string): string {
  if (!countryCode || !phoneNumber) throw new Error('Country code and phone number are required');
  const cleanCountry = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  const cleanPhone = phoneNumber.replace(/^\+/, '');
  if (phoneNumber.startsWith('+')) return phoneNumber;
  return `${cleanCountry}${cleanPhone}`;
}

export const sendSmsVerification = async (
  phoneNumber: string,
  code: string,
  context: 'registration' | 'reset_password' = 'registration'
) => {
  logger.info('[Twilio] Attempting to send SMS.', { phoneNumber, code, context });

  // Log Twilio env variables (masking sensitive info)
  logger.info('[Twilio] Using credentials:', {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? process.env.TWILIO_ACCOUNT_SID.slice(0, 6) + '***' : 'MISSING',
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? '***' : 'MISSING',
  });

  let messageBody = '';
  if (context === 'reset_password') {
    messageBody = `Your Basta Casino password reset code is: ${code}. Valid for 10 minutes.`;
  } else {
    messageBody = `Your Basta Casino verification code is: ${code}. Valid for 10 minutes.`;
  }

  try {
    if (!phoneNumber) {
      logger.error('[Twilio] Error: Phone number is required.');
      throw new Error('Phone number is required');
    }

    if (
      !process.env.TWILIO_ACCOUNT_SID ||
      !process.env.TWILIO_AUTH_TOKEN ||
      !process.env.TWILIO_PHONE_NUMBER
    ) {
      logger.error('[Twilio] Error: Twilio credentials are not properly configured.', {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'MISSING',
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING',
      });
      throw new Error('Twilio credentials are not properly configured');
    }

    const from = process.env.TWILIO_PHONE_NUMBER;
    const to = formatE164PhoneNumber('+91', phoneNumber);

    logger.info('[Twilio] Formatted E.164 phone number:', { to });

    logger.info('[Twilio] Sending SMS with details:', { from, to });

    const message = await client.messages.create({
      body: messageBody,
      from,
      to,
      // Optional: Add statusCallback to track delivery status
      statusCallback: process.env.SMS_STATUS_WEBHOOK_URL,
    });

    logger.info('[Twilio] SMS sent successfully. Full response:', message);
    return message.sid;
  } catch (error: any) {
    logger.error('[Twilio] Full error object:', error);

    if (error.code === 21606) {
      logger.error('[Twilio] Error 21606: The "From" phone number is not capable of sending messages to this destination.');
      throw new Error(
        'The Twilio phone number is not capable of sending messages to this destination. Please contact support.',
      );
    } else if (error.code === 21211) {
      logger.error('[Twilio] Error 21211: Invalid "To" phone number format.');
      throw new Error('Invalid phone number format');
    } else if (error.code === 20003) {
      logger.error('[Twilio] Error 20003: Authentication error - check credentials.', {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'MISSING',
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING',
      });
      throw new Error('Authentication error - please check Twilio credentials');
    }

    logger.error('[Twilio] Detailed SMS error:', {
      code: error.code,
      message: error.message,
      moreInfo: error.moreInfo,
      status: error.status,
    });

    throw new Error(`[Twilio] Failed to send SMS verification code: ${error.message}`);
  }
};

export const sendResetSms = async (phoneNumber: string, resetUrl: string) => {
  logger.info('[Twilio] Attempting to send password reset SMS.', { phoneNumber, resetUrl });
  try {
    if (!phoneNumber) {
      logger.error('[Twilio] Error: Phone number is required.');
      throw new Error('Phone number is required');
    }
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      logger.error('[Twilio] Error: Twilio credentials are not properly configured.');
      throw new Error('Twilio credentials are not properly configured');
    }
    const from = process.env.TWILIO_PHONE_NUMBER;
    const to = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const message = await client.messages.create({
      body: `Reset your Basta Casino password: ${resetUrl} (valid for 1 hour)`,
      from,
      to,
      statusCallback: process.env.SMS_STATUS_WEBHOOK_URL,
    });
    logger.info('[Twilio] Password reset SMS sent successfully. Full response:', message);
    return message.sid;
  } catch (error: any) {
    logger.error('[Twilio] Failed to send password reset SMS:', error);
    throw new Error(`[Twilio] Failed to send password reset SMS: ${error.message}`);
  }
};
