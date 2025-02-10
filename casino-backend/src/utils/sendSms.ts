import twilio from 'twilio';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);
console.log('client', client)

export const sendSmsVerification = async (phoneNumber: string, code: string) => {
    try {
        console.log('phoneNumber', phoneNumber);
        const message = await client.messages.create({
            body: `Your Basta Casino verification code is: ${code}. Valid for 10 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: `+91${phoneNumber}`
        });
        console.log('message', message);
        return message.sid;
    } catch (error) {
        console.error('Error sending SMS:', error);
        throw new Error('Failed to send SMS verification code');
    }
};