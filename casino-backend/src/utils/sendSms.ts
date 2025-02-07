import twilio from 'twilio';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);
console.log('client', client)

export const sendSmsVerification = async (phoneNumber: string, code: string) =>{
    console.log('phoneNumber', phoneNumber)
    const message = await client.messages.create({
        body: `Your Basta Casino verification code is: ${code}. Valid for 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
    });
    console.log('message', message)

    return message.sid;
};