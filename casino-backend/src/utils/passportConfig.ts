import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import Player from '../models/player';
import * as authService from '../services/authService';
import { models } from 'mongoose';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await Player.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: `${process.env.CLIENT_URL}/api/auth/google/callback`,
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0].value;
    let player = await Player.findOne({ email });

    if (!player) {
      player = await Player.create({
        email,
        username: profile.displayName,
        googleId: profile.id,
        isVerified: true
      });
    }

    const { token, expiresIn } = await authService.generateToken(player);
    
    done(null, { player, token, expiresIn });
  } catch (error) {
    done(error);
  }
}));

// Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID!,
  clientSecret: process.env.FACEBOOK_APP_SECRET!,
  callbackURL: `${process.env.CLIENT_URL}/api/auth/facebook/callback`,
  profileFields: ['id', 'emails', 'name'],
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0].value;
    let player = await Player.findOne({ email });

    if (!player) {
      player = await Player.create({
        email,
        username: `${profile.name.givenName} ${profile.name.familyName}`,
        facebookId: profile.id,
        isVerified: true
      });
    }

    const { token, expiresIn } = await authService.generateToken(player);
    
    done(null, { player, token, expiresIn });
  } catch (error) {
    done(error);
  }
}));

export default passport;