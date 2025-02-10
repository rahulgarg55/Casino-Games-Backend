import twilio, { Twilio } from 'twilio';

// Enable debug logging through environment variable
process.env.TWILIO_LOG_LEVEL = 'debug';


const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

export const sendSmsVerification = async (phoneNumber: string, code: string) => {
    try {
        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');

        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            throw new Error('Twilio credentials are not properly configured');
        }

        console.log('Sending SMS to:', `+91${cleanPhoneNumber}`);
        
        const message = await client.messages.create({
            body: `Your Basta Casino verification code is: ${code}. Valid for 10 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: `+91${cleanPhoneNumber}`,
            // Optional: Add statusCallback to track delivery status
            statusCallback: process.env.SMS_STATUS_WEBHOOK_URL
        });

        console.log('SMS sent successfully. Message SID:', message.sid);
        return message.sid;
    } catch (error) {
        // Handle specific Twilio errors
        if (error.code === 21606) {
            throw new Error('The Twilio phone number is not capable of sending messages to this destination. Please contact support.');
        } else if (error.code === 21211) {
            throw new Error('Invalid phone number format');
        } else if (error.code === 20003) {
            throw new Error('Authentication error - please check Twilio credentials');
        }

        // Log the complete error for debugging
        console.error('Detailed SMS error:', {
            code: error.code,
            message: error.message,
            moreInfo: error.moreInfo,
            status: error.status
        });

        throw new Error(`Failed to send SMS verification code: ${error.message}`);
    }
};