import passport from 'passport';
import bcrypt from 'bcrypt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { IPlayer } from '../models/player';
import Player from '../models/player';

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
        }else{
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
        }else{
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
