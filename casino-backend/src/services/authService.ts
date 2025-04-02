import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { STATUS, VERIFICATION, TWO_FA } from '../constants';
import { sendResetEmail } from '../utils/sendResetEmail';
import { generateTokenResponse, generateReferralCode } from '../utils/auth';
import cloudinary from '../utils/cloudinary';
import { sendVerificationEmail } from '../utils/sendEmail';
import { sendSmsVerification } from '../utils/sendSms';
import Notification, { NotificationType } from '../models/notification';
import { generateSumsubAccessToken, createSumsubApplicant, SumsubTokenResponse } from '../utils/sumsub';
import language from '../models/language';
import mongoose from 'mongoose';
import { session } from 'passport';
import { Affiliate } from '../models/affiliate';
interface RegistrationData {
  username?: string;
  email?: string;
  phone_number?: string;
  password: string;
  fullname?: string;
  patronymic?: string;
  currency: number; // 0 = USD, 1 = INR, 2 = Pound
  language: string;
  gender?: string;
  city?: string;
  country?: string;
  is_affiliate: boolean;
}

interface LoginData {
  email?: string;
  phone_number?: string;
  password: string;
  role_id: number;
}

interface ForgotPasswordData {
  email?: string;
  phone_number?: string;
}

interface ResetPasswordData {
  token: string;
  password: string;
}

interface UpdateProfileData {
  fullname?: string;
  email?: string;
  phone_number?: string;
  username?: string;
  language?: string;
  patronymic?: string;
  dob?: Date;
  gender?: string;
  city?: string;
  country?: string;
}

export const register = async (data: RegistrationData) => {
  const {
    username,
    email,
    phone_number,
    password,
    fullname,
    patronymic,
    currency,
    language,
    gender,
    city,
    country,
    is_affiliate,
  } = data;

  if (!email && !phone_number) {
    throw new Error(
      'Please provide all required fields: username, password, email',
    );
  }

  const query: any[] = [];
  if (email) query.push({ email });
  if (phone_number) query.push({ phone_number });
  if (username) query.push({ username });

  const existingUser = await Player.findOne({ $or: query });
  if (existingUser) {
    throw new Error('User already registered');
  }
  if (existingUser) {
    if (existingUser.username === username) {
      throw new Error('Username is already taken');
    }
    if (existingUser.email === email) {
      throw new Error('Email is already registered');
    }
    if (existingUser.phone_number === phone_number) {
      throw new Error('Phone number is already registered');
    }
  }
  if (password.length < 8 || !/\d/.test(password)) {
    throw new Error(
      'Password must be at least 8 characters long and include a number',
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const smsCode = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('verificationToken', verificationToken);
  const playerData: any = {
    email,
    phone_number,
    fullname,
    password_hash: hashedPassword,
    role_id: 0, // Default to User
    currency,
    language,
    status: STATUS.ACTIVE,
    is_verified: VERIFICATION.UNVERIFIED,
    verification_token: verificationToken,
    verification_token_expires: new Date(Date.now() + 3600000),
    sms_code: phone_number ? smsCode : undefined,
    sms_code_expires: phone_number ? new Date(Date.now() + 600000) : undefined, // 10 minutes
    is_2fa_enabled: TWO_FA.DISABLED,
    two_factor_method: 'email', // Default to email
    city,
    country,
    gender,
    is_affiliate,
  };

  if (username) {
    playerData.username = username;
  }
  if (fullname) {
    playerData.fullname = fullname;
  }
  if (patronymic) {
    playerData.patronymic = patronymic;
  }

  // const session = await mongoose.startSession();
  // session.startTransaction();
  try {
    const player = new Player(playerData);
    await player.save();

    /*If affiliate user*/
    if (playerData.is_affiliate) {
      const referral_code = await generateReferralCode(player._id);

      /*Save Affliate details*/
      await Affiliate.create({
        user_id: player._id,
        referral_code,
      });
    }

    const playerBalance = new PlayerBalance({
      player_id: player._id,
      balance: 0,
      currency: currency,
      is_deleted: 0,
    });
    await playerBalance.save();

    const notification = new Notification({
      type: NotificationType.USER_REGISTERED,
      message: `New user ${username || email || phone_number} has registered`,
      user_id: player._id,
      metadata: {
        username,
        email,
        phone_number,
        country,
        registration_date: new Date(),
      },
    });
    await notification.save();

    if (email) {
      await sendVerificationEmail(email, verificationToken);
    } else if (phone_number) {
      await sendSmsVerification(phone_number, smsCode);
    }

    // await session.commitTransaction();
    const tokenData = generateTokenResponse(player);
    return {
      player,
      balance: playerBalance,
      token: tokenData.token,
      expiresIn: tokenData.expiresIn,
    };
  } catch (error) {
    // await session.abortTransaction();
    throw error;
  }
};

export const verifyPhoneNumber = async (phoneNumber: string, code: string) => {
  const player = await Player.findOne({
    phone_number: phoneNumber,
    sms_code: code,
    sms_code_expires: { $gt: new Date() },
  });
  if (!player) {
    throw new Error('Invalid or expired verification code');
  }
  player.is_verified = VERIFICATION.VERIFIED;
  player.sms_code = undefined;
  player.sms_code_expires = undefined;
  await player.save();

  return { message: 'Phone number verified successfully' };
};

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const login = async (data: LoginData) => {
  const { email, phone_number, password, role_id = 0 } = data;

  if (!email && !phone_number) {
    throw new Error('Invalid request. Please check your input');
  }
  const query = {
    role_id,
    $or: [
      { email: { $eq: email, $exists: true } },
      { phone_number: { $eq: phone_number, $exists: true } },
    ],
  };

  const player = await Player.findOne(query).select('+password_hash');

  if (!player) {
    if (email) {
      throw new Error('Email does not exist');
    }
    throw new Error('User does not exist');
  }

  const isMatch = await bcrypt.compare(password, player.password_hash);
  if (!isMatch) {
    throw new Error('Invalid password');
  }
  if (player.is_verified === VERIFICATION.UNVERIFIED) {
    throw new Error('Please verify your account');
  }

  if (player.status !== STATUS.ACTIVE) {
    throw new Error('Your account has been locked. Please contact support');
  }

  player.last_login = new Date();
  await player.save();

  const playerBalance = await PlayerBalance.findOne({ player_id: player._id });

  if (!process.env.JWT_SECRET) {
    throw new Error('An unexpected error occurred. Please try again later');
  }

  const tokenData = generateTokenResponse(player);
  console.log('tokenData', tokenData.token);

  return {
    token: player.is_2fa_enabled ? undefined : tokenData.token, // Only return token if 2FA is disabled
    user: {
      id: player._id,
      username: player.username,
      email: player.email,
      phone_number: player.phone_number,
      role: player.role_id,
      status: player.status,
      gender: player.gender,
      language: player.language,
      country: player.country,
      city: player.city,
      balance: playerBalance?.balance || 0,
      currency: playerBalance?.currency || 'USD',
      is_2fa_enabled: player.is_2fa_enabled,
      profile_picture: player.profile_picture,
      is_verified: player.is_verified,
      fullname: player.fullname,
      requires2FA: player.is_2fa_enabled === TWO_FA.ENABLED,
    },
  };
};
export const initiate2FA = async (playerId: string) => {
  const player = await Player.findById(playerId).select(
    '+two_factor_secret +two_factor_expires',
  );
  if (!player) {
    throw new Error('Player not found');
  }
  if (player.is_2fa_enabled !== TWO_FA.ENABLED)
    throw new Error('2FA is not enabled for this account');

  const otp = generateOTP();
  player.two_factor_secret = otp;
  player.two_factor_expires = new Date(Date.now() + 600000); // 10 minutes
  await player.save();

  if (player.two_factor_method === 'email' && player.email) {
    await sendOTPByEmail(player.email, otp);
  } else if (player.two_factor_method === 'phone' && player.phone_number) {
    await sendOTPBySMS(player.phone_number, otp);
  } else {
    throw new Error('No valid 2FA method configured');
  }

  return { message: 'OTP sent successfully' };
};
export const verify2FA = async (playerId: string, otp: string) => {
  const player = await Player.findById(playerId).select(
    '+two_factor_secret +two_factor_expires',
  );
  if (!player) {
    throw new Error('Player not found');
  }
  if (!player.two_factor_secret || !player.two_factor_expires) {
    throw new Error('2FA not initiated');
  }
  if (new Date() > player.two_factor_expires) {
    throw new Error('OTP has expired');
  }
  if (player.two_factor_secret !== otp) {
    throw new Error('Invalid OTP');
  }

  player.two_factor_secret = undefined;
  player.two_factor_expires = undefined;
  await player.save();

  const tokenData = generateTokenResponse(player);
  return {
    token: tokenData.token,
    expiresIn: tokenData.expiresIn,
    user: {
      id: player._id,
      username: player.username,
      email: player.email,
      phone_number: player.phone_number,
      role: player.role_id,
      status: player.status,
      gender: player.gender,
      language: player.language,
      country: player.country,
      city: player.city,
      is_2fa_enabled: player.is_2fa_enabled,
      profile_picture: player.profile_picture,
      is_verified: player.is_verified,
      fullname: player.fullname,
    },
  };
};

export const toggle2FA = async (
  playerId: string,
  enabled: boolean,
  method?: 'email' | 'phone',
  password?: string,
) => {
  const player = await Player.findById(playerId).select('+password_hash');
  if (!player) {
    throw new Error('Player not found');
  }
  if (password) {
    const isMatch = await bcrypt.compare(password, player.password_hash);
    if (!isMatch) {
      throw new Error('Invalid password');
    }
  } else {
    throw new Error('Password is required to toggle 2FA');
  }

  player.is_2fa_enabled = enabled ? TWO_FA.ENABLED : TWO_FA.DISABLED;
  if (method) player.two_factor_method = method;
  await player.save();

  return {
    is_2fa_enabled: player.is_2fa_enabled,
    two_factor_method: player.two_factor_method,
    message: `2FA has been ${enabled ? 'enabled' : 'disabled'} successfully`,
  };
};

const sendOTPByEmail = async (to: string, otp: string) => {
  const sgMail = (await import('@sendgrid/mail')).default;
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Email Verification - Basta X Casino</title>
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
          <div style="color: #ffffff;font-size: 21px; font-weight: bold; margin-bottom: 20px">
            Welcome to Basta X Casino!
          </div>
          <div style="margin: 10px">
            <p style="color: #ffffff; font-size: 14px; margin: 0 0 10px 0">
              Your 2FA OTP Code for verification:
            </p>
            <div
              style="
                font-size: 24px;
                font-weight: bold;
                background: linear-gradient(to bottom, #ff1a44, #871628);
                color: #fff;
                padding: 10px 20px;
                display: inline-block;
                border-radius: 50px;
                margin-bottom: 10px;
                letter-spacing: 3px;
              "
            >
              ${otp}
            </div>
            <p style="color: #ffffff; font-size: 12px; margin: 0 0 10px 0">
              (This code is valid for 10 minutes)
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

  const msg = {
    to,
    from: process.env.EMAIL_FROM!,
    subject: 'Your 2FA One-Time Password',
    text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    html: htmlContent,
  };

  await sgMail.send(msg);
};

// Send OTP via SMS (Twilio)
const sendOTPBySMS = async (to: string, otp: string) => {
  const twilio = (await import('twilio')).default;
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  await twilioClient.messages.create({
    body: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
};

export const forgotPassword = async (data: ForgotPasswordData) => {
  const { email, phone_number } = data;
  if (!email && !phone_number) {
    throw new Error('Invalid request. Please check your input');
  }

  const player = await Player.findOne({ $or: [{ email }, { phone_number }] });
  if (!player) {
    throw new Error('No account found with this email address');
  }

  const token = crypto.randomBytes(20).toString('hex');
  console.log('token', token);
  player.reset_password_token = token;
  player.reset_password_expires = new Date(Date.now() + 3600000); // 1 hour

  await player.save();
  await sendResetEmail(email || phone_number!, token);
};

export const resetPassword = async (data: ResetPasswordData) => {
  const { token, password } = data;
  const player = await Player.findOne({
    reset_password_token: token,
    reset_password_expires: { $gt: new Date() },
  });

  if (!player) {
    throw new Error('Invalid or expired reset token');
  }
  player.password_hash = await bcrypt.hash(password, 12);
  player.reset_password_token = undefined;
  player.reset_password_expires = undefined;

  await player.save();
};
export const generateResetToken = async (email: string) => {
  const resetToken = crypto.randomBytes(32).toString('hex');

  const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

  const player = await Player.findOneAndUpdate(
    { email },
    {
      reset_password_token: resetToken,
      reset_password_expires: resetTokenExpires,
    },
    { new: true },
  );

  if (!player) {
    throw new Error('No account found with this email');
  }

  await sendResetEmail(player.email, resetToken);
  return resetToken;
};

export const updateProfile = async (playerId: string, data: UpdateProfileData) => {
  const player = await Player.findById(playerId);
  if (!player) throw new Error('User not found');

  const updates: any = {};
  let logoutRequired = false;

  if (data.email && data.email !== player.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error('Invalid email format');
    }
    
    updates.email = data.email;
    updates.email_verified = false;
    updates.verification_token = crypto.randomBytes(32).toString('hex');
    updates.verification_token_expires = new Date(Date.now() + 3600000); // 1 hour
    logoutRequired = true;
  }

  if (data.phone_number !== undefined) {
    if (data.phone_number && !/^\+?[1-9]\d{1,14}$/.test(data.phone_number)) {
      throw new Error('Invalid phone number format');
    }
    if (data.phone_number !== player.phone_number) {
      const existingPlayer = await Player.findOne({ phone_number: data.phone_number });
      if (existingPlayer && existingPlayer._id.toString() !== playerId) {
        throw new Error('Phone number is already registered');
      }
      updates.phone_number = data.phone_number || null;
      updates.phone_verified = data.phone_number ? false : player.phone_verified;
    }
  }

  // Handle other fields
  if (data.fullname) updates.fullname = data.fullname;
  if (data.username) updates.username = data.username;
  if (data.language) updates.language = data.language;
  if (data.patronymic) updates.patronymic = data.patronymic;
  if (data.dob) updates.dob = new Date(data.dob);
  if (data.gender) updates.gender = data.gender;
  if (data.city) updates.city = data.city;
  if (data.country) updates.country = data.country;

  Object.assign(player, updates);
  await player.save();

  if (updates.email) {
    await sendVerificationEmail(updates.email, updates.verification_token);
  }

  return {
    ...player.toObject(),
    logoutRequired
  };
};

export const getNotifications = async (
  page: number = 1,
  limit: number = 20,
) => {
  const notifications = await Notification.find()
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('user_id', 'username email phone_number');

  const total = await Notification.countDocuments();

  return {
    notifications,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const generateToken = async (player: any) => {
  const token = jwt.sign(
    { id: player._id, role: player.role_id },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' },
  );
  return { token, expiresIn: 28800 };
};

export const verifyOTP = async (playerId: string, otp: string) => {
  const player = await Player.findById(playerId).select(
    '+two_factor_secret +two_factor_expires',
  );

  if (!player) {
    throw new Error('Player not found');
  }

  if (
    !player.two_factor_secret ||
    !player.two_factor_expires ||
    player.two_factor_secret !== otp ||
    new Date() > player.two_factor_expires
  ) {
    throw new Error('Invalid or expired OTP');
  }

  player.two_factor_secret = undefined;
  player.two_factor_expires = undefined;
  await player.save();

  const tokenData = generateTokenResponse(player);

  return {
    token: tokenData.token,
    expiresIn: tokenData.expiresIn,
    user: {
      id: player._id,
      username: player.username,
      email: player.email,
      phone_number: player.phone_number,
      role: player.role_id,
      status: player.status,
      gender: player.gender,
      language: player.language,
      country: player.country,
      city: player.city,
      is_2fa_enabled: player.is_2fa_enabled,
      profile_picture: player.profile_picture,
      is_verified: player.is_verified,
      fullname: player.fullname,
    },
  };
};

/**
 * Initiates Sumsub KYC verification for a player.
 * @param playerId - Internal player ID
 * @returns Sumsub access token and user ID
 * @throws {Error} If player not found or Sumsub API fails
 */
export const initiateSumsubVerification = async (playerId: string): Promise<SumsubTokenResponse> => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  if (!player.email) {
    throw new Error('Player email is required for Sumsub verification');
  }

  if (!player.sumsub_id) {
    const applicantId = await createSumsubApplicant(
      playerId,
      player.email,
      player.phone_number
    );
    player.sumsub_id = applicantId;
    player.sumsub_status = 'pending';
    await player.save();
  }

  return generateSumsubAccessToken(playerId, playerId, 'basic-kyc');
};

/**
 * Updates player Sumsub verification status based on webhook data.
 * @param playerId - Internal player ID
 * @param status - New status ('approved' or 'rejected')
 * @returns Updated player object
 * @throws {Error} If player not found or update fails
 */
export const updateSumsubStatus = async (playerId: string, status: 'approved' | 'rejected') => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  player.sumsub_status = status;
  player.sumsub_verification_date = new Date();
  if (status === 'approved') {
    player.is_verified = VERIFICATION.VERIFIED;
  } else if (status === 'rejected') {
    player.is_verified = VERIFICATION.UNVERIFIED;
  }
  await player.save();

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC status updated to ${status} for user ${player.username || player.email}`,
    user_id: player._id,
    metadata: { sumsub_id: player.sumsub_id, status },
  });
  await notification.save();

  return player;
};
