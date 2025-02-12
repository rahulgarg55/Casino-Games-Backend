import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { STATUS, VERIFICATION, TWO_FA } from '../constants';
import { sendResetEmail } from '../utils/sendResetEmail';
import { generateTokenResponse } from '../utils/auth';
import cloudinary from '../utils/cloudinary';
import { sendVerificationEmail } from '../utils/sendEmail';
import { sendSmsVerification } from '../utils/sendSms';
import language from '../models/language';
import  mongoose  from 'mongoose';
import { session } from 'passport';
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
}

interface LoginData {
  email?: string;
  phone_number?: string;
  password: string;
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
  } = data;

  if (!email && !phone_number) {
    throw new Error('Please provide all required fields: username, password, email');
  }


  const query: any[] = [];
  if (email) query.push({ email });
  if (phone_number) query.push({ phone_number });
  if (username) query.push({ username });

  const existingUser = await Player.findOne({ $or: query });
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
    throw new Error('Password must be at least 8 characters long and include a number');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const smsCode = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('verificationToken', verificationToken)
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
    is_2fa: TWO_FA.DISABLED,
    city,
    country,
    gender,
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
  try{
  const player = new Player(playerData);
  await player.save();

  const playerBalance = new PlayerBalance({
    player_id: player._id,
    balance: 0,
    currency: currency,
    is_deleted:0
  });
  await playerBalance.save();
  if (email) {
    await sendVerificationEmail(email, verificationToken);
  } else if (phone_number) {
    await sendSmsVerification(phone_number, smsCode);
  }

  // await session.commitTransaction();
  const tokenData = generateTokenResponse(player);
  return { player, balance:playerBalance, token: tokenData.token, expiresIn: tokenData.expiresIn };
}catch(error){
  // await session.abortTransaction();
  throw error;
}
};

  export const verifyPhoneNumber = async (phoneNumber: string, code: string)=>{
    const player = await Player.findOne({
      phone_number: phoneNumber,
      sms_code: code,
      sms_code_expires: { $gt: new Date() },
    });
    if(!player){
      throw new Error('Invalid or expired verification code');
    }
    player.is_verified = VERIFICATION.VERIFIED;
    player.sms_code = undefined;  
    player.sms_code_expires = undefined;
    await player.save();

    return {message: 'Phone number verified successfully'};
  }

export const login = async (data: LoginData) => {
  const { email, phone_number, password } = data;

  if (!email && !phone_number) {
    throw new Error('Invalid request. Please check your input');
  }
  const query = {
    $or: [
      { email: { $eq: email, $exists: true } },
      { phone_number: { $eq: phone_number, $exists: true } },
    ],
  };

  const player = await Player.findOne(query).select('+password_hash');

  if (!player) {
    throw new Error('Invalid username or password');
  }

  const isMatch = await bcrypt.compare(password, player.password_hash);
  if (!isMatch) {
    throw new Error('Invalid username or password');
  }
  if (player.is_verified === VERIFICATION.UNVERIFIED) {
    throw new Error('Please verify your account');
  }

  if (player.status !== STATUS.ACTIVE) {
    throw new Error('Your account has been locked. Please contact support');
  }

  player.last_login = new Date();
  await player.save();

  const playerBalance = await PlayerBalance.findOne({player_id: player._id});

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
    },
  };
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
  console.log('token', token)
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

export const updateProfile = async (
  playerId: string,
  data: UpdateProfileData,
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('User not found');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('Invalid email format');
  }

  if (data.fullname) player.fullname = data.fullname;
  if (data.email) player.email = data.email;
  if (data.phone_number) player.phone_number = data.phone_number;
  if (data.username) player.username = data.username;
  if (data.language !== undefined) player.language = data.language;
  if (data.patronymic) player.patronymic = data.patronymic;
  if (data.dob) player.dob = data.dob;
  if (data.gender !== undefined) player.gender = data.gender;
  if (data.city !== undefined) player.city = data.city;
  if (data.country !== undefined) player.country = data.country;
 
  try {
    await player.save();
    return player;
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern.username) {
        throw new Error('Username is already taken');
      }
      if (error.keyPattern.email) {
        throw new Error('Email is already registered');
      }
    }
    throw error;
  }
};

export const generateToken = async (player: any) => {
  const token = jwt.sign(
    { id: player._id, role: player.role_id },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' },
  );
  return { token, expiresIn: 28800 };
};
