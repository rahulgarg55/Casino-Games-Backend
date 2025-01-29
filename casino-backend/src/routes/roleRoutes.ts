import { Router } from 'express';
import * as roleController from '../controllers/roleController';

/**
 * Initializes a new instance of the router.
 * This router handles all the routes related to roles in the casino backend.
 */
const router = Router();

router.post('/', roleController.createRole);
router.get('/', roleController.getRoles);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

export default router;