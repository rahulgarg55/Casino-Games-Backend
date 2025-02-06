import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import Player from '../models/player';
import { generateTokenResponse } from '../utils/auth'; // Import this instead of generateToken
import { STATUS, VERIFICATION } from '../constants'; // Import your constants

passport.serializeUser((user: any, done) => {
  done(null, { id: user.id, role: user.role_id });
});

passport.deserializeUser(
  async (serializedUser: { id: string; role: number }, done) => {
    try {
      const user = await Player.findById(serializedUser.id);
      if (!user) return done(null, false);
      done(null, { sub: user._id, role: user.role_id });
    } catch (error) {
      done(error);
    }
  },
);

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.CLIENT_URL}/api/auth/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0].value;
        let player = await Player.findOne({ email });

        if (!player) {
          player = await Player.create({
            email,
            username: profile.displayName,
            googleId: profile.id,
            is_verified: VERIFICATION.VERIFIED, // Use your verification constant
            status: STATUS.ACTIVE, // Use your status constant
            role_id: 0, // Default role
            currency: 0, // Default currency
            registration_date: new Date(),
          });
        }

        const tokenData = generateTokenResponse(player);

        done(null, {
          player,
          token: tokenData.token,
          expiresIn: tokenData.expiresIn,
        });
      } catch (error) {
        done(error);
      }
    },
  ),
);

// Facebook Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: `${process.env.CLIENT_URL}/api/auth/facebook/callback`,
      profileFields: ['id', 'emails', 'name'],
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0].value;
        let player = await Player.findOne({ email });

        if (!player) {
          player = await Player.create({
            email,
            username: `${profile.name?.givenName} ${profile.name?.familyName}`,
            facebookId: profile.id,
            is_verified: VERIFICATION.VERIFIED, // Use your verification constant
            status: STATUS.ACTIVE, // Use your status constant
            role_id: 0, // Default role
            currency: 0, // Default currency
            registration_date: new Date(),
          });
        }

        const tokenData = generateTokenResponse(player);

        done(null, {
          player,
          token: tokenData.token,
          expiresIn: tokenData.expiresIn,
        });
      } catch (error) {
        done(error);
      }
    },
  ),
);

export default passport;
