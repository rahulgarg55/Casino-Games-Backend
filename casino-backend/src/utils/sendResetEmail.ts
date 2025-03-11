import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const getEmailContent = (resetUrl: string) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Password Reset - Basta X Casino</title>
      </head>
      <body
        style="
          background-color: #fff;
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
          <!-- Gradient Banner Top -->
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
            <!-- Centered Logo -->
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
          <div
            style="
              color: #ffffff;
              font-size: 21px;
              font-weight: bold;
              margin-bottom: 20px;
            "
          >
            Password Reset Request
          </div>
          <div style="margin: 10px">
            <p style="color: #ffffff; font-size: 14px; margin: 0 0 10px 0">
              You requested a password reset. Click the button below to reset your
              password:
            </p>
            <a
              href="${resetUrl}"
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
              Reset Password
            </a>
            <p style="color: #ffffff; font-size: 12px; margin: 0 0 10px 0">
              (This link is valid for 10 minutes)
            </p>
            <!-- Connect with us above Social Media Links -->
            <div
              style="
                font-size: 16px;
                font-weight: bold;
                margin-top: 20px;
                margin-bottom: 10px;
                color: #ffffff;
              "
            >
              Connect with us
            </div>
            <!-- Social Media Links with Icons -->
            <div style="margin-bottom: 20px">
              <a
                href="https://facebook.com"
                style="
                  margin: 0 10px;
                  text-decoration: none;
                  color: #ff3366;
                  font-size: 14px;
                "
              >
                <img
                  src="https://cdn-icons-png.flaticon.com/512/733/733547.png"
                  alt="Facebook"
                  title="Follow us on Facebook"
                  style="
                    width: 20px;
                    height: 20px;
                    vertical-align: middle;
                    margin-right: 5px;
                  "
                />
              </a>
              <a
                href="https://twitter.com"
                style="
                  margin: 0 10px;
                  text-decoration: none;
                  color: #ff3366;
                  font-size: 14px;
                "
              >
                <img
                  src="https://cdn-icons-png.flaticon.com/512/733/733579.png"
                  alt="Twitter"
                  title="Follow us on Twitter"
                  style="
                    width: 20px;
                    height: 20px;
                    vertical-align: middle;
                    margin-right: 5px;
                  "
                />
              </a>
              <a
                href="https://instagram.com"
                style="
                  margin: 0 10px;
                  text-decoration: none;
                  color: #ff3366;
                  font-size: 14px;
                "
              >
                <img
                  src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png"
                  alt="Instagram"
                  title="Follow us on Instagram"
                  style="
                    width: 20px;
                    height: 20px;
                    vertical-align: middle;
                    margin-right: 5px;
                  "
                />
              </a>
            </div>
            <div
              style="
                margin-top: 20px;
                margin-bottom: 20px;
                font-size: 12px;
                color: #b0b0b0;
              "
            >
              If you didn’t request this, please ignore this email.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: 'Password Reset Request',
    text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
    html: htmlContent,
  };
};

export const sendResetEmail = async (to: string, token: string) => {
  try {
    const resetUrl = `${process.env.CLIENT_URL}/reset-new-password?token=${token}`;
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