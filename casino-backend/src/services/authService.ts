import Player from '../models/player';
import Role from '../models/role';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

interface RegistrationData {
  username: string;
  email: string;
  password: string;
  role_id: Types.ObjectId;
  fullname: string;
  patronymic: string;
}

interface LoginData {
  email: string;
  password: string;
}

export const register = async (data: RegistrationData) => {
  const { username, email, password, role_id, fullname, patronymic } = data;

  const roleExists = await Role.exists({ _id: role_id });
  if (!roleExists) {
    throw new Error('Invalid role specified');
  }

  const existingUser = await Player.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new Error('Username or email already in use');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const player = new Player({
    username,
    email,
    password_hash: hashedPassword,
    role_id,
    fullname,
    patronymic
  });

  await player.save();

  return player;
};

export const login = async (data: LoginData) => {
  const { email, password } = data;

  const player = await Player.findOne({ email })
    .select('+password_hash')
    .populate('role_id', 'name permissions');

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

  const token = jwt.sign(
    {
      id: player._id,
      role: player.role_id,
      status: player.status
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
      role: player.role_id,
      status: player.status
    }
  };
};