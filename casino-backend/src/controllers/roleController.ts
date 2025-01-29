import { Request, Response } from 'express';
import * as roleService from '../services/roleService';
import { Types } from 'mongoose';

interface RoleRequest extends Request {
  body: {
    name: string;
    description?: string;
  };
}

export const createRole = async (req: RoleRequest, res: Response) => {
  try {
    const role = await roleService.createRole(req.body);
    res.status(201).json(role);
  } catch (error) {
    handleRoleError(res, error, 400, 'Failed to create role');
  }
};

export const getRoles = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const roles = await roleService.getRoles(page, limit);
    res.status(200).json(roles);
  } catch (error) {
    handleRoleError(res, error, 500, 'Failed to fetch roles');
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const id = new Types.ObjectId(req.params.id);
    const role = await roleService.updateRole(id, req.body);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.status(200).json(role);
  } catch (error) {
    handleRoleError(res, error, 400, 'Failed to update role');
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    const id = new Types.ObjectId(req.params.id);
    const role = await roleService.deleteRole(id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.status(200).json({ message: 'Role soft-deleted successfully' });
  } catch (error) {
    handleRoleError(res, error, 400, 'Failed to delete role');
  }
};

// Helper function for error handling
function handleRoleError(
  res: Response,
  error: unknown,
  defaultStatus: number,
  defaultMessage: string
) {
  if (error instanceof Error) {
    const status = error.message.includes('not found') ? 404 : defaultStatus;
    res.status(status).json({ error: error.message });
  } else {
    res.status(defaultStatus).json({ error: defaultMessage });
  }
}