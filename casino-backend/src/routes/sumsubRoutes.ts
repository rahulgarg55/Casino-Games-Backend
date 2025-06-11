import express, { Router } from 'express';
import {
  startSumsubVerification,
  startSumsubVerificationWithLink,
  sumsubWebhook,
  getSumsubStatus,
  uploadDocument,
  approvePlayerKYC,
  rejectPlayerKYC,
} from '../controllers/sumsubController';
import passport from 'passport';
import multer from 'multer';

const router = Router();

const storage = multer.memoryStorage();
const documentUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

router.post(
  '/start',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerification
);

router.post(
  '/start-with-link',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerificationWithLink
);

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  sumsubWebhook
);

router.get(
  '/status',
  passport.authenticate('jwt', { session: false }),
  getSumsubStatus
);

router.post(
  '/upload',
  passport.authenticate('jwt', { session: false }),
  documentUpload.single('document'),
  uploadDocument
);

router.post(
  '/approve/:playerId',
  passport.authenticate('jwt', { session: false }),
  approvePlayerKYC
);

router.post(
  '/reject/:playerId',
  passport.authenticate('jwt', { session: false }),
  rejectPlayerKYC
);

export default router;