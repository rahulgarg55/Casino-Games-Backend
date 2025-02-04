import Player from '../models/player';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { STATUS, VERIFICATION, TWO_FA } from '../constants';
import { sendResetEmail } from '../utils/sendResetEmail';
import { generateTokenResponse } from '../utils/auth';

interface RegistrationData {
  username?: string;
  email?: string;
  phone_number?: string;
  password: string;
  fullname?: string;
  patronymic?: string;
  currency: number; // 0 = USD, 1 = INR, 2 = Pound
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
  } = data;

  if (!email && !phone_number) {
    throw new Error('Either email or phone number is required');
  }

  const query: any[] = [];
  if (email) query.push({ email });
  if (phone_number) query.push({ phone_number });
  if (username) query.push({ username });

  const existingUser = await Player.findOne({ $or: query });
  if (existingUser) {
    throw new Error('Username, email, or phone number already in use');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const playerData: any = {
    email,
    phone_number,
    password_hash: hashedPassword,
    role_id: 0, // Default to User
    currency,
    status: STATUS.ACTIVE,
    is_verified: VERIFICATION.UNVERIFIED,
    is_2fa: TWO_FA.DISABLED,
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

  const player = new Player(playerData);
  await player.save();

  const tokenData = generateTokenResponse(player);

  return { player, token: tokenData.token, expiresIn: tokenData.expiresIn };
};

export const login = async (data: LoginData) => {
  const { email, phone_number, password } = data;
  if (!email && !phone_number) {
    throw new Error('Either email or phone number is required');
  }
  const player = await Player.findOne({
    $or: [{ email }, { phone_number }],
  }).select('+password_hash');

  if (!player) {
    throw new Error('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, player.password_hash);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  player.last_login = new Date();
  await player.save();

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret not configured');
  }
  if (player.is_verified === VERIFICATION.UNVERIFIED) {
    throw new Error('Please verify your email first');
  }

  const token = jwt.sign(
    {
      id: player._id,
      role: player.role_id,
      status: player.status === STATUS.ACTIVE ? 'active' : 'inactive',
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );

  return {
    token,
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
    },
  };
};

export const forgotPassword = async (data: ForgotPasswordData) => {
  const { email, phone_number } = data;
  if (!email && !phone_number) {
    throw new Error('Either email or phone number is required');
  }

  const player = await Player.findOne({ $or: [{ email }, { phone_number }] });
  if (!player) {
    throw new Error('User not found');
  }

  const token = crypto.randomBytes(20).toString('hex');
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
    throw new Error('Password reset token is invalid or has expired');
  }

  player.password_hash = await bcrypt.hash(password, 12);
  player.reset_password_token = undefined;
  player.reset_password_expires = undefined;

  await player.save();
};

export const updateProfile = async (
  playerId: string,
  data: UpdateProfileData,
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  // Object.assign(player, data);
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
  await player.save();

  return player;
};
export const generateToken = async (player: any) => {
  const token = jwt.sign(
    { id: player._id, role: player.role_id }, 
    process.env.JWT_SECRET!, 
    { expiresIn: '8h' }
  );
  return { token, expiresIn: 28800 };
};