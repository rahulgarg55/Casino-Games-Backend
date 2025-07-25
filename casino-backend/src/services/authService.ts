import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { STATUS, VERIFICATION, TWO_FA } from '../constants';
import {
  sendResetEmail,
  sendResetAffiliateEmail,
} from '../utils/sendResetEmail';
import {
  generateTokenResponse,
  generateReferralCode,
  generateTokenForAffialite,
} from '../utils/auth';
import cloudinary from '../utils/cloudinary';
import { sendVerificationEmail } from '../utils/sendEmail';
import { sendSmsVerification, formatE164PhoneNumber } from '../utils/sendSms';
import Notification, { NotificationType } from '../models/notification';
import {
  generateSumsubAccessToken,
  createSumsubApplicant,
  SumsubTokenResponse,
} from '../utils/sumsub';
import language from '../models/language';
import mongoose from 'mongoose';
import { session } from 'passport';
import { Affiliate, IAffiliate } from '../models/affiliate';
// import { Affiliate } from '../models/affiliate';
import Role from '../models/role';
import { logger } from '../utils/logger';

interface RegistrationData {
  username?: string;
  email?: string;
  phone_number?: string;
  country_code?: string;
  password: string;
  fullname?: string;
  patronymic?: string;
  currency: number; // 0 = USD, 1 = INR, 2 = Pound
  language: string;
  gender?: string;
  city?: string;
  country?: string;
  is_affiliate: boolean;
  role_id: number;
  referralCode?: string;
}

interface LoginData {
  email?: string;
  phone_number?: string;
  country_code?: string;
  password: string;
  role_id: number;
}

interface AffiliateLoginData {
  email: string;
  password: string;
}

interface ForgotPasswordData {
  email?: string;
  phone_number?: string;
  country_code?: string;
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

export const register = async (data: RegistrationData, req: any) => {
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
    role_id,
    referralCode,
  } = data;

  if (!email && !phone_number) {
    throw new Error(
      'Please provide all required fields: username, password, email',
    );
  }

  let e164PhoneNumber: string | undefined;
  if (phone_number) {
    const countryCode = data.country_code || req.body.country_code || '+91';
    e164PhoneNumber = formatE164PhoneNumber(countryCode, phone_number);
  }

  const query: any[] = [];
  if (email) query.push({ email });
  if (e164PhoneNumber) query.push({ phone_number: e164PhoneNumber }); // Use E.164 formatted number
  if (username) query.push({ username });

  const existingUser = await Player.findOne({ $or: query });
  if (existingUser) {
    if (existingUser.username === username) {
      throw new Error('User already exists');
    }
    if (existingUser.email === email) {
      throw new Error('Email is already registered');
    }
    if (existingUser.phone_number === e164PhoneNumber) {
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

  const playerData: any = {
    email: email || undefined,
    fullname,
    password_hash: hashedPassword,
    role_id: role_id || 0,
    currency,
    language,
    status: STATUS.ACTIVE,
    is_verified: VERIFICATION.UNVERIFIED,
    verification_token: verificationToken,
    verification_token_expires: new Date(Date.now() + 3600000),
    is_2fa_enabled: TWO_FA.DISABLED,
    two_factor_method: 'email',
    city,
    country,
    gender,
  };

  if (phone_number) {
    const countryCode = data.country_code || req.body.country_code || '+91';
    const e164PhoneNumber = formatE164PhoneNumber(countryCode, phone_number);
    playerData.phone_number = e164PhoneNumber;
    playerData.sms_code = smsCode;
    playerData.sms_code_expires = new Date(Date.now() + 600000); // 10 minutes
  }

  if (username) {
    playerData.username = username;
  }
  if (fullname) {
    playerData.fullname = fullname;
  }
  if (patronymic) {
    playerData.patronymic = patronymic;
  }

  // Handle referral code from body or query params
  let finalReferralCode = referralCode || req.query.ref;

  // Send verification email/SMS before DB transaction (optional, can be moved inside if you want atomicity)
  if (email) {
    await sendVerificationEmail(email, verificationToken);
  } else if (phone_number) {
    logger.info(`[Register] Player registered with phone. Attempting to send verification SMS to ${playerData.phone_number}`);
    await sendSmsVerification(playerData.phone_number, smsCode);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      // If referral, validate and update affiliate
      if (finalReferralCode) {
        const referringAffiliate = await Affiliate.findOne({
          referralCode: finalReferralCode,
        }).session(session);
        if (!referringAffiliate) {
          throw new Error((req as any).__('INVALID_REFERRAL'));
        }
        if (referringAffiliate.status !== STATUS.ACTIVE) {
          throw new Error((req as any).__('AFFILIATE_NOT_VERFIFIED_YET'));
        }
        playerData.referredBy = referringAffiliate._id;
        playerData.referredByName = `${referringAffiliate.firstname} ${referringAffiliate.lastname}`;
        // Increment totalClicks for the affiliate
        await Affiliate.findByIdAndUpdate(
          referringAffiliate._id,
          { $inc: { totalClicks: 1 } },
          { new: true, session }
        );
      }

      const player = new Player(playerData);
      await player.save({ session });

      const playerBalance = new PlayerBalance({
        player_id: player._id,
        balance: 0,
        currency: currency,
        is_deleted: 0,
      });
      await playerBalance.save({ session });

      // Increment totalSignups if referred
      if (finalReferralCode && playerData.referredBy) {
        await Affiliate.findByIdAndUpdate(
          playerData.referredBy,
          { $inc: { totalSignups: 1 } },
          { new: true, session }
        );
      }

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
          referralCode: finalReferralCode || null,
        },
      });
      await notification.save({ session });

      const tokenData = generateTokenResponse(player);
      result = {
        player,
        balance: playerBalance,
        token: tokenData.token,
        expiresIn: tokenData.expiresIn,
      };
    });
    return result;
  } finally {
    session.endSession();
  }
};
export const affiliateRegister = async (data: RegistrationData) => {
  const { email, password, username, phone_number, fullname } = data;

  const affiliateRole = await Role.findOne({ role_id: 2 });
  if (!affiliateRole) {
    throw new Error('Affiliate role not configured in the system');
  }

  const existingPlayer = await Player.findOne({
    $or: [{ email }, { phone_number }],
  });
  if (existingPlayer) {
    throw new Error('Email or phone number already in use');
  }

  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  const player = new Player({
    email,
    phone_number,
    username,
    password_hash,
    role_id: 2,
    status: 1,
    is_verified: true,
    last_login: new Date(),
    fullname,
    currency: 0,
  });

  await player.save();

  const referral_code = `AFF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const affiliate = new Affiliate({
    user_id: player._id,
    referral_code,
    commission_rate: 10,
    total_earnings: 0,
    status: 'Active',
  });

  await affiliate.save();

  const playerBalance = new PlayerBalance({
    player_id: player._id,
    balance: 0,
    currency: 0,
  });
  await playerBalance.save();

  if (!process.env.JWT_SECRET) {
    throw new Error('An unexpected error occurred. Please try again later');
  }

  const tokenData = generateTokenResponse(player);

  return {
    token: tokenData.token,
    user: {
      id: player._id,
      username: player.username,
      email: player.email,
      phone_number: player.phone_number,
      role: player.role_id,
      status: player.status,
      balance: playerBalance.balance,
      currency: playerBalance.currency,
      is_verified: player.is_verified,
      fullname: player.fullname,
      referral_code: affiliate.referral_code,
    },
  };
};
export const verifyPhoneNumber = async (phoneNumber: string, code: string, countryCode: string, req: any) => {
  const player = await Player.findOne({
    phone_number: phoneNumber,
    sms_code: code,
    sms_code_expires: { $gt: new Date() },
  });
  if (!player) throw new Error((req as any).__('INVALID_CODE'));
  player.is_verified = VERIFICATION.VERIFIED;
  player.phone_verified = true;
  player.country_code = countryCode;
  player.sms_code = undefined;
  player.sms_code_expires = undefined;
  await player.save();
  return player;
};

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const login = async (data: LoginData,req:any) => {
  let { email, phone_number, password, role_id = 0, country_code } = data;

  // If phone_number and country_code are provided, format to E.164
  if (phone_number && country_code) {
    phone_number = formatE164PhoneNumber(country_code, phone_number);
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
      throw new Error((req as any).__('EMAIL_NOT_EXIST'));
    }
    throw new Error((req as any).__('USER_NOT_EXIST'));
  }

  const isMatch = await bcrypt.compare(password, player.password_hash);
  if (!isMatch) {
    throw new Error((req as any).__('INVALID_PASSWORD'));
  }
  if (player.is_verified === VERIFICATION.UNVERIFIED) {
    throw new Error((req as any).__('VERIFY_YOUR_ACCOUNT'));
  }

  if (player.status !== STATUS.ACTIVE) {
    throw new Error((req as any).__('YOUR_ACCOUNT_IS_LOCK'));
  }

  player.last_login = new Date();
  await player.save();

  const playerBalance = await PlayerBalance.findOne({ player_id: player._id });

  if (!process.env.JWT_SECRET) {
    throw new Error((req as any).__('UNEXPECTED_ERR'));
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

export const affiliateLogin = async (data: LoginData) => {
  const { email, phone_number, password, role_id = 2 } = data;

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
    throw new Error('Affiliate does not exist');
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

  const affiliate = await Affiliate.findOne({ user_id: player._id });
  if (!affiliate) {
    throw new Error('Affiliate profile not found');
  }

  player.last_login = new Date();
  await player.save();

  const playerBalance = await PlayerBalance.findOne({ player_id: player._id });

  if (!process.env.JWT_SECRET) {
    throw new Error('An unexpected error occurred. Please try again later');
  }

  const tokenData = generateTokenResponse(player);

  return {
    token: tokenData.token,
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
      profile_picture: player.profile_picture,
      is_verified: player.is_verified,
      fullname: player.fullname,
      referral_code: affiliate.referral_code,
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
export const verify2FA = async (playerId: string, otp: string,req:any) => {
  const player = await Player.findById(playerId).select(
    '+two_factor_secret +two_factor_expires',
  );
  if (!player) {
    throw new Error((req as any).__('PLAYER_NOT_FOUND'));
  }
  if (!player.two_factor_secret || !player.two_factor_expires) {
    throw new Error((req as any).__('2FA_NOT_INITATED'));
  }
  if (new Date() > player.two_factor_expires) {
    throw new Error((req as any).__('OTP_EXPIRED'));
  }
  if (player.two_factor_secret !== otp) {
    throw new Error((req as any).__('INVALID_OTP'));
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
  req?:any
) => {
  const player = await Player.findById(playerId).select('+password_hash');
  if (!player) {
    throw new Error((req as any).__('PLAYER_NOT_FOUND'));
  }
  if (password) {
    const isMatch = await bcrypt.compare(password, player.password_hash);
    if (!isMatch) {
      throw new Error((req as any).__('INVALID_PASSWORD'));
    }
  } else {
    throw new Error((req as any).__('PASSWORD_REQUIRED_FOR_TOGGLE'));
  }

  player.is_2fa_enabled = enabled ? TWO_FA.ENABLED : TWO_FA.DISABLED;
 if (enabled && method) {
    player.two_factor_method = method;
  } else if (!enabled) {
    player.two_factor_method = undefined;
  }  await player.save();

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
              If you didn't request this, please ignore this email.
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

const sendOTPBySMS = async (to: string, otp: string) => {
  logger.info(`[Twilio] [sendSmsVerification] Attempting to send OTP via SMS to ${to}`);
  try {
    const twilio = (await import('twilio')).default;
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
    
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!from) {
      logger.error('[Twilio] Twilio "From" number is not configured.');
      throw new Error('Twilio "From" number is not configured.');
    }

    logger.info('[Twilio] Sending SMS with details:', { from, to });

    const message = await twilioClient.messages.create({
      body: `Your 2FA OTP is: ${otp}. It expires in 10 minutes.`,
      from,
      to,
    });
    logger.info('[Twilio] OTP SMS sent successfully. Full response:', message);
  } catch (error: any) {
    logger.error('[Twilio] Failed to send OTP SMS. Full error:', error);
    throw new Error(`[Twilio] Failed to send OTP SMS: ${error.message}`);
  }
};

export const forgotPassword = async (data: ForgotPasswordData, req: any) => {
  let { email, phone_number, country_code } = data;
  if (!email && !phone_number) {
    throw new Error((req as any).__('INVALID_REQUEST'));
  }

  let e164PhoneNumber: string | undefined;
  if (phone_number) {
    const code = country_code || req.body?.country_code || '+91';
    e164PhoneNumber = formatE164PhoneNumber(code, phone_number);
    const phoneExists = await Player.findOne({ phone_number: e164PhoneNumber });
    if (!phoneExists) {
      throw new Error((req as any).__('NO_ACCOUNT_WITH_PHONE'));
    }
    phone_number = e164PhoneNumber;
  }

  if (email) {
    const emailExists = await Player.findOne({ email });
    if (!emailExists) {
      throw new Error((req as any).__('NO_ACCOUNT_WITH_EMAIL'));
    }
  }

  // Construct query based on provided input
  let query;
  if (email) {
    query = { email };
  } else if (phone_number) {
    query = { phone_number };
  } else {
    throw new Error((req as any).__('INVALID_REQUEST'));
  }

  const player = await Player.findOne(query);
  if (!player) {
    throw new Error((req as any).__('NO_ACCOUNT_WITH_EMAIL_OR_PHONE'));
  }

  if (phone_number && !email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    player.reset_password_otp = otp;
    player.reset_password_otp_expires = new Date(Date.now() + 10 * 60 * 1000);
    await player.save();
    console.log('[forgotPassword] Updated player after OTP save:', player);
    try {
      await sendSmsVerification(phone_number, otp, 'reset_password');
      console.log(`Password reset OTP sent to ${phone_number}`);
      return;
    } catch (error) {
      player.reset_password_otp = undefined;
      player.reset_password_otp_expires = undefined;
      await player.save();
      throw new Error((req as any).__('FAILED_TO_SEND_RESET_EMAIL'));
    }
  }

  // Email reset logic remains unchanged
  const token = crypto.randomBytes(20).toString('hex');
  player.reset_password_token = token;
  player.reset_password_expires = new Date(Date.now() + 3600000);
  await player.save();
  try {
    await sendResetEmail(email || phone_number!, token);
    console.log(`Password reset email sent to ${email || phone_number}`);
  } catch (error) {
    player.reset_password_token = undefined;
    player.reset_password_expires = undefined;
    await player.save();
    throw new Error((req as any).__('FAILED_TO_SEND_RESET_EMAIL'));
  }
};

export const resetPassword = async (data: ResetPasswordData, req: any) => {
  const { token, password } = data;

  try {
    // Find player with valid reset token
    const player = await Player.findOne({
      reset_password_token: token,
      reset_password_expires: { $gt: new Date() },
    }).select('+password_hash');

    if (!player) {
      throw new Error((req as any).__('INVALID_EXPRIRE_TOKEN'));
    }

    console.log(`Resetting password for user: ${player.email || player.phone_number}`);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update player with new password and clear reset tokens
    const updatedPlayer = await Player.findByIdAndUpdate(
      player._id,
      {
        $set: {
          password_hash: hashedPassword,
          reset_password_token: undefined,
          reset_password_expires: undefined
        }
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!updatedPlayer) {
      console.error('Failed to update password - player not found');
      throw new Error('Failed to update password');
    }

    // Verify the password was actually updated by attempting to find the player with new password
    const verifyPlayer = await Player.findById(player._id).select('+password_hash');
    if (!verifyPlayer || !verifyPlayer.password_hash) {
      console.error('Failed to verify password update - player not found or password not set');
      throw new Error('Failed to update password');
    }

    const isMatch = await bcrypt.compare(password, verifyPlayer.password_hash);
    if (!isMatch) {
      console.error('Password verification failed after update');
      throw new Error('Failed to update password');
    }

    console.log(`Password updated successfully for ${updatedPlayer.email || updatedPlayer.phone_number}`);
    return true;
  } catch (error) {
    console.error('Error in resetPassword:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to update password'
    );
  }
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

export const updateProfile = async (
  playerId: string,
  data: UpdateProfileData,
) => {
  const player = await Player.findById(playerId);
  if (!player) throw new Error('User not found');

  const updates: any = {};
  let verificationToken: string | undefined;

  if (data.email && data.email !== player.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error('Invalid email format');
    }
    const emailExists = await Player.findOne({
      email: data.email,
      _id: { $ne: playerId },
    });
    if (emailExists) {
      throw new Error('Email is already registered');
    }

    verificationToken = crypto.randomBytes(32).toString('hex');
    updates.new_email = data.email;
    updates.verification_token = verificationToken;
    updates.verification_token_expires = new Date(Date.now() + 3600000);
    updates.email_verified = false;
    console.log(`Setting new_email to ${data.email} for player ${playerId}`);
  }

  // Handle other fields
  if (data.phone_number !== undefined) {
    if (data.phone_number && !/^\+?[1-9]\d{1,14}$/.test(data.phone_number)) {
      throw new Error('Invalid phone number format');
    }
    if (data.phone_number !== player.phone_number) {
      const existingPlayer = await Player.findOne({
        phone_number: data.phone_number,
        _id: { $ne: playerId },
      });
      if (existingPlayer) {
        throw new Error('Phone number is already registered');
      }
      updates.phone_number = data.phone_number || null;
      updates.phone_verified = data.phone_number
        ? false
        : player.phone_verified;
        updates.is_verified = 0;
    }
  }

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
  console.log(`Player ${playerId} updated with new_email: ${player.new_email}`);

  if (verificationToken && updates.new_email) {
    console.log(`Sending verification email to ${updates.new_email}`);
    await sendVerificationEmail(updates.new_email, verificationToken);
  }

  return {
    ...player.toObject(),
    logoutRequired: false,
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

export const verifyOTP = async (playerId: string, otp: string,req:any) => {
  const player = await Player.findById(playerId).select(
    '+two_factor_secret +two_factor_expires',
  );

  if (!player) {
    throw new Error((req as any).__('PLAYER_NOT_FOUND'));
  }

  if (
    !player.two_factor_secret ||
    !player.two_factor_expires ||
    player.two_factor_secret !== otp ||
    new Date() > player.two_factor_expires
  ) {
    throw new Error((req as any).__('OTP_EXPIRED'));
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
export const initiateSumsubVerification = async (
  playerId: string,
): Promise<SumsubTokenResponse> => {
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
      player.phone_number,
    );
    player.sumsub_id = applicantId;
    player.sumsub_status = 'not_started';
    await player.save();
  }

  logger.info('[Sumsub] [initiateSumsubVerification] Initiating Sumsub verification for player', { playerId });
  return generateSumsubAccessToken(playerId, playerId, 'basic-kyc');
};

/**
 * Updates player Sumsub verification status based on webhook data.
 * @param playerId - Internal player ID
 * @param status - New status ('approved_sumsub' or 'rejected_sumsub')
 * @returns Updated player object
 * @throws {Error} If player not found or update fails
 */
export const updateSumsubStatus = async (
  playerId: string,
  status: 'approved_sumsub' | 'rejected_sumsub',
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  player.sumsub_status = status;
  player.sumsub_verification_date = new Date();
  if (status === 'approved_sumsub') {
    player.is_verified = VERIFICATION.VERIFIED;
  } else if (status === 'rejected_sumsub') {
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

export const registerAffiliate = async (data: IAffiliate,req:any) => {
  const {
    firstname,
    lastname,
    email,
    phonenumber,
    country,
    password,
    referralCode,
    promotionMethod,
    hearAboutUs,
    status,
    marketingEmailsOptIn,
  } = data;

  /*Check if user exists*/
  const existingUser = await Affiliate.findOne({ email });
  if (existingUser) {
    if (existingUser.email === email) {
      throw new Error('Email is already registered');
    }
    if (existingUser.phonenumber === phonenumber) {
      throw new Error('Phone number is already registered');
    }
  }

  /* Check if referral code already exists */
  if (referralCode) {
    const existingReferral = await Affiliate.findOne({ referralCode });
    if (existingReferral) {
      throw new Error((req as any).__('REFERRAL_CODE_ALREADY_USE'));
    }
  }

  if (
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[@$!%*?&]/.test(password)
  ) {
    throw new Error(
      (req as any).__('PASSWORD_MUST_LONG'),
    );
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 3600000);

  try {
    const hashedPassword = password
      ? await bcrypt.hash(password, 12)
      : undefined;
    const newAffiliate = new Affiliate({
      ...data,
      password: hashedPassword,
      referralCode:
        referralCode || generateReferralCode(new mongoose.Types.ObjectId()),
      verification_token: verificationToken,
      verification_token_expires: verificationTokenExpires,
    });
    newAffiliate.save();
    const affiliateObject = newAffiliate.toObject();
    delete affiliateObject.password;

    /*Send verification email*/
    await sendVerificationEmail(email, verificationToken, true);

    return affiliateObject;
  } catch (error) {
    throw error;
  }
};

export const loginAffiliate = async (data: AffiliateLoginData,req:any) => {
  const { email, password } = data;

  if (!email) {
    throw new Error((req as any).__('INVALID_REQUEST'));
  }

  const affiliate = await Affiliate.findOne({ email }).select('+password');

  if (!affiliate) {
    throw new Error((req as any).__('EMAIL_NOT_EXIST'));
  }

  if (affiliate.status === STATUS.INACTIVE) {
    throw new Error((req as any).__('PLEASE_VERIFY_ACCOUNT'));
  }

  if (affiliate.status === STATUS.BANNED) {
    throw new Error((req as any).__('AFFILIATE_ACCOUNT_SUSPEND'));
  }
  console.log('affiliate.status :>> ', affiliate.status);
  const isMatch = await bcrypt.compare(password, affiliate.password);
  console.log('isMatch :>> ', isMatch);

  if (!isMatch) {
    throw new Error((req as any).__('INVALID_PASSWORD'));
  }

  if (!process.env.JWT_SECRET) {
    throw new Error((req as any).__('UNEXPECTED_ERR'));
  }

  const tokenData = generateTokenForAffialite(affiliate);
  console.log('tokenData', tokenData.token);

  const user = affiliate.toObject();
  delete user.password;

  return {
    token: tokenData.token,
    user,
  };
};

export const affiliateforgotPassword = async (data: ForgotPasswordData,req:any) => {
  const { email } = data;
  if (!email) {
    throw new Error((req as any).__('INVALID_REQUEST'));
  }

  const affiliate = await Affiliate.findOne({ email });
  if (!affiliate) {
    throw new Error((req as any).__('NO_ACCOUNT_WITH_EMAIL'));
  }

  const token = crypto.randomBytes(20).toString('hex');
  affiliate.reset_password_token = token;
  affiliate.reset_password_expires = new Date(Date.now() + 3600000); // 1 hour

  await affiliate.save();
  await sendResetAffiliateEmail(email, token);
};

export const affiliateResetPassword = async (data: ResetPasswordData,req:any) => {
  const { token, password } = data;
  const affiliate = await Affiliate.findOne({
    reset_password_token: token,
    reset_password_expires: { $gt: new Date() },
  });

  if (!affiliate) {
    throw new Error((req as any).__('INVALID_EXPRIRE_TOKEN'));
  }
  affiliate.password = await bcrypt.hash(password, 12);
  affiliate.reset_password_token = undefined;
  affiliate.reset_password_expires = undefined;

  await affiliate.save();
};
