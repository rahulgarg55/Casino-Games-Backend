import Player from '../models/player';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { STATUS, VERIFICATION, TWO_FA } from '../constants';

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

export const register = async (data: RegistrationData) => {
  const { username, email, phone_number, password, fullname, patronymic, currency } = data;

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
    is_2fa: TWO_FA.DISABLED
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

  return player;
};

export const login = async (data: LoginData) => {
  const { email, phone_number, password } = data;

  const player = await Player.findOne({ $or: [{ email }, { phone_number }] })
    .select('+password_hash');

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
      status: player.status === STATUS.ACTIVE ? 'active' : 'inactive'
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return {
    token,
    user: {
      id: player._id,
      username: player.username,
      email: player.email,
      phone_number: player.phone_number,
      role: player.role_id,
      status: player.status
    }
  };
};