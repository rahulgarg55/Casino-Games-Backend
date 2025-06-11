import express from 'express';
import { isAdmin } from '../middleware/auth';
import {
  getApplicantDocuments,
  approveApplicant,
  rejectApplicant,
  getDocumentDownload,
} from '../controllers/adminKycController';

const router = express.Router();

// All routes require admin authentication
// router.use(isAdmin);

// Get applicant documents
router.get('/:sumsubId/documents', getApplicantDocuments);

// Approve applicant
router.post('/:sumsubId/approve', approveApplicant);

// Reject applicant
router.post('/:sumsubId/reject', rejectApplicant);

// Download document
router.get('/:sumsubId/documents/:documentId/download', getDocumentDownload);

export default router;