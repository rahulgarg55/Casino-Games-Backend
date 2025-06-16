import express, { Router } from 'express';
import {
  startSumsubVerification,
  startSumsubVerificationWithLink,
  sumsubWebhook,
  getSumsubStatus,
  uploadDocument,
  approvePlayerKYC,
  rejectPlayerKYC,
  getDocumentImage,
  getPendingKYCs,
} from '../controllers/sumsubController';
import { getSumsubApplicantDocuments } from '../utils/sumsub';
import passport from 'passport';
import multer from 'multer';
import Player from '../models/player';

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
  },
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

router.post('/webhook', express.raw({ type: 'application/json' }), sumsubWebhook);

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
  approvePlayerKYC
);

router.post(
  '/reject/:playerId',
  rejectPlayerKYC
);

router.get('/documents/:applicantId', async (req, res) => {
  try {
    const { applicantId } = req.params;
    console.log('applicantId', applicantId)

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    const documents = await getSumsubApplicantDocuments(applicantId);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      message: 'DOCUMENTS_RETRIEVED',
      data: { documents },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch documents',
    });
  }
});

router.get('/documents/:applicantId/images/:imageId', passport.authenticate('jwt', { session: false }), getDocumentImage);

router.get(
  '/pending-kycs',
  // passport.authenticate('jwt', { session: false }),
  getPendingKYCs
);

export default router;