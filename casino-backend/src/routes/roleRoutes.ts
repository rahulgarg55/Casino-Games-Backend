import { Router } from 'express';
import * as roleController from '../controllers/roleController';
import { body } from 'express-validator';
import validateRequest from '../middlewares/validateRequest';

/**
 * Initializes a new instance of the router.
 * This router handles all the routes related to roles in the casino backend.
 */
const router = Router();

const roleValidation = [
  body('role_id')
    .isInt({ min: 0, max: 2 })
    .withMessage('Role ID must be an integer between 0 and 2'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be between 2-50 characters'),
  body('description')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Description cannot exceed 255 characters'),
];

router.post('/', roleValidation, validateRequest, roleController.createRole);
router.get('/', roleController.getRoles);
router.put('/:id', roleValidation, validateRequest, roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

export default router;
