import express, { Router } from 'express';
import {
  startSumsubVerification,
  startSumsubVerificationWithLink,
  sumsubWebhook,
} from '../controllers/sumsubController';
import passport from 'passport';

const router = Router();

router.post(
  '/start',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerification,
);

router.post(
  '/start-with-link',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerificationWithLink,
);

router.post('/webhook', sumsubWebhook);

export default router;
