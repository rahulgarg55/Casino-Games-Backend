import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export const sendVerificationEmail = async (
  to: string,
  verificationToken: string,
) => {
  const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Verify Your Email - Basta X Casino</title>
      </head>
      <body
        style="
          background-color: #0b132b;
          font-family: Arial, sans-serif;
          color: #ffffff;
          text-align: center;
          font-size: 12px;
          margin: 0;
          padding: 0;
        "
      >
        <div
          style="
            max-width: 600px;
            margin: 0 auto;
            background: #102a4e;
            border-radius: 10px;
            box-shadow: 0px 0px 10px rgba(255, 255, 255, 0.1);
            border: 2px solid #ff3366;
            color: #ffffff;
            text-align: center;
          "
        >
          <div
            style="
              background: #172f59;
              background: linear-gradient(180deg, #102a4e 0%, #1e3a72 100%);
              width: 100%;
              height: 115px;
              border-radius: 10px;
              position: relative;
              margin-bottom: 20px;
              text-align: center;
            "
          >
            <table role="presentation" width="100%" height="120">
              <tr>
                <td align="center" valign="middle">
                  <img
                    src="https://res.cloudinary.com/dfgbdr9o4/image/upload/v1741341426/vyi78ke0du3ta1zntseh.png"
                    alt="Basta X Casino Logo"
                    style="max-width: 200px"
                  />
                </td>
              </tr>
            </table>
          </div>

          <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px">
            Verify Your Email Address
          </div>
          <div style="margin: 10px">
            <p style="font-size: 14px; margin: 0 0 10px 0">
              Thank you for registering! Please verify your email by clicking the link below:
            </p>
            <a
              href="${verificationLink}"
              style="
                display: inline-block;
                font-size: 16px;
                font-weight: bold;
                background: linear-gradient(to bottom, #ff1a44, #871628);
                color: #fff;
                padding: 10px 20px;
                border-radius: 50px;
                text-decoration: none;
                margin: 20px auto;
              "
            >
              Verify Email
            </a>

            <p style="font-size: 12px; margin: 0 0 10px 0">
              If you did not register, please ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const msg = {
    to,
    from: process.env.EMAIL_FROM!,
    subject: 'Verify Your Email Address',
    text: `Please verify your email by clicking on the link: ${verificationLink}`,
    html: htmlContent,
  };

  try {
    await sgMail.send(msg);
    console.log(`Verification email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send verification email');
  }
};