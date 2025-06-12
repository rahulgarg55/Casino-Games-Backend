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
} from '../controllers/sumsubController';
import {getSumsubApplicantDocuments} from '../utils/sumsub';
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

router.get(
  '/documents/:applicantId',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { applicantId } = req.params;
      const documents = await getSumsubApplicantDocuments(applicantId);
      res.set('Cache-Control', 'no-store'); // Prevent caching
      res.status(200).json({
        success: true,
        message: (req as any).__('DOCUMENTS_RETRIEVED'),
        data: { documents }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || (req as any).__('FAILED_TO_FETCH_DOCUMENTS')
      });
    }
  }
);

router.get(
  '/documents/:applicantId/images/:imageId',
  passport.authenticate('jwt', { session: false }),
  getDocumentImage
);

export default router;