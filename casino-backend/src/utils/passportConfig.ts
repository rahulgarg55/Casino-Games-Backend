import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import Player from '../models/player';
import { generateTokenResponse } from '../utils/auth';
import { STATUS, VERIFICATION } from '../constants';
import crypto from 'crypto';

const OAuth2Strategy = require('passport-oauth2');

OAuth2Strategy.prototype.parseErrorResponse = function (body, status) {
  console.error("OAuth2 Token Exchange Error Response:", { body, status });
  const json = JSON.parse(body);
  const err = new Error(json.error_description || json.error || 'unknown error') as Error & { code?: string; status?: number };
  err.code = json.error;
  err.status = status;
  return err;
};

// Generate a random password for OAuth users
const generateRandomPassword = () => {
  return crypto.randomBytes(32).toString('hex');
};

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
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google Strategy - Profile:", profile);
        console.log("Google Strategy - Access Token:", accessToken);
        console.log("Google Strategy - Refresh Token:", refreshToken); // Log refresh token

        if (!profile.emails || !profile.emails[0].value) {
          return done(new Error("Email not provided by Google"));
        }

        const email = profile.emails[0].value;
        let player = await Player.findOne({ email });

        if (!player) {
          const password_hash = crypto.randomBytes(32).toString('hex');
          player = new Player({
            email,
            username: profile.displayName || `user_${profile.id}`,
            googleId: profile.id,
            password_hash,
            is_verified: VERIFICATION.VERIFIED,
            status: STATUS.ACTIVE,
            role_id: 0,
            currency: 0,
            registration_date: new Date(),
            refreshToken: refreshToken,
          });
          await player.save();
        } else {
             player.refreshToken = refreshToken; 
             await player.save();
        }

        const tokenData = generateTokenResponse(player);
        return done(null, {
          token: tokenData.token,
          expiresIn: tokenData.expiresIn
        });
      } catch (error) {
        console.error("Google Strategy Error:", error);
        return done(error);
      }
    }
  )
);



passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: `${process.env.AUTH_CALLBACK_URL}/api/auth/facebook/callback`,
      profileFields: ['id', 'emails', 'name'],
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0].value;
        if (!email) {
          return done(new Error("No email provided by Facebook"));
        }

        let player = await Player.findOne({ email });
        
        if (!player) {
          // Generate a random password for the new user
          const password_hash = await generateRandomPassword();
          
          player = await Player.create({
            email,
            username: `${profile.name?.givenName} ${profile.name?.familyName}`,
            facebookId: profile.id,
            password_hash, // Add the password hash
            is_verified: VERIFICATION.VERIFIED,
            status: STATUS.ACTIVE,
            role_id: 0,
            currency: 0,
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
        console.error("Facebook Strategy Error:", error);
        done(error);
      }
    },
  ),
);

export default passport;