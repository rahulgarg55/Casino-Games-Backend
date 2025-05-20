import passport from 'passport';
import bcrypt from 'bcrypt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { IPlayer } from '../models/player';
import Player from '../models/player';
import AppleStrategy from 'passport-apple';
import { Strategy as AppleStrategyType, Profile } from 'passport-apple';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

const privateKeyString = fs.readFileSync(
  path.resolve(process.cwd(), 'src/AuthKey_Q863TAJ9VC.p8'),
  'utf8'
).replace(/\r\n/g, '\n').trim();

console.log("-------privateKeyString---------",privateKeyString)

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET,
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      console.log('JWT payload received:', payload);
      const player = await Player.findById(payload.sub);

      if (!player) {
        console.log('No player found for id:', payload.sub);
        return done(null, false);
      }

      if (player.status !== 1) {
        console.log('Player found but status is not active:', player.status);
        return done(null, false);
      }

      console.log('Player authenticated:', player._id);
      return done(null, {
        id: player._id,
        role: player.role_id,
      });
    } catch (error) {
      console.log('Error in JWT strategy:', error);
      return done(error, false);
    }
  })
);

console.log("======config==",{ clientID: process.env.APPLE_CLIENT_ID!,
      teamID: process.env.APPLE_TEAM_ID!,
      keyID: process.env.APPLE_KEY_ID!,
     privateKey: privateKeyString,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/apple/callback`})

passport.use(
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID!,
      teamID: process.env.APPLE_TEAM_ID!,
      keyID: process.env.APPLE_KEY_ID!,
     privateKey: privateKeyString,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/apple/callback`,
       passReqToCallback: true
    },
    async (req,accessToken, refreshToken, idToken, profile, done:any) => {
      try {
        console.log("=====req==",req)
        console.log("=====profile=",profile)
        const decoded: any = jwt.decode(idToken);
        console.log("decoded==========",decoded)

        if (!decoded?.email) {
          throw new Error('Email not found in Apple ID token');
        }

        const email = decoded.email;
        const displayName = decoded.name || 'Apple User';

        let player = await Player.findOne({ email });

        if (!player) {
          const randomPassword = Math.random().toString(36).slice(-12);
          const hashedPassword = await bcrypt.hash(randomPassword, 10);

          player = new Player({
            email,
            fullname: displayName,
            password_hash: hashedPassword,
            is_verified: 1,
            status: 1,
            currency: 0,
            role_id: 0,
            registration_date: new Date(),
            last_login: new Date(),
            profile_picture: '', 
          });

          await player.save();
        } else {
          player.last_login = new Date();
          await player.save();
        }

        done(null, player);
      } catch (error) {
        console.error('Apple login error:', error);
        done(error, null);
      }
    }
  )
);


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let player = await Player.findOne({ email: profile.emails?.[0].value });

        if (!player) {
          const randomPassword = Math.random().toString(36).slice(-12);
          console.log('Generated random password:', randomPassword);
          const hashedPassword = await bcrypt.hash(randomPassword, 10);
          player = new Player({
            email: profile.emails?.[0].value,
            fullname: profile.displayName,
            password_hash: hashedPassword,
            is_verified: 1,
            status: 1,
            currency: 0,
            role_id: 0,
            registration_date: new Date(),
            last_login: new Date(),
            profile_picture: profile.photos?.[0].value,
          });
          await player.save();
        } else {
          player.profile_picture = profile.photos?.[0].value;
          await player.save();
        }

        done(null, player);
      } catch (error) {
        done(error, undefined);
      }
    },
  ),
);

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/facebook/callback`,
      profileFields: ['id', 'emails', 'name', 'displayName'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let player = await Player.findOne({ email: profile.emails?.[0].value });

        if (!player) {
          player = new Player({
            email: profile.emails?.[0].value,
            fullname: profile.displayName,
            is_verified: 1,
            status: 1,
            currency: 0, // Default to USD
            role_id: 0, // Default to User
            registration_date: new Date(),
            last_login: new Date(),
            profile_picture: profile.photos?.[0].value,
          });
          await player.save();
        } else {
          player.profile_picture = profile.photos?.[0].value;
          await player.save();
        }

        done(null, player);
      } catch (error) {
        done(error, undefined);
      }
    },
  ),
);

passport.serializeUser((player: IPlayer, done) => {
  done(null, player._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const player = await Player.findById(id);
    done(null, player);
  } catch (error) {
    done(error, null);
  }
});
