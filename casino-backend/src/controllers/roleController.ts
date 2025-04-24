import { Request, Response } from 'express';
import * as roleService from '../services/roleService';
import { Types } from 'mongoose';

interface RoleRequest extends Request {
  body: {
    role_id: number; // 0 = User, 1 = Admin, 2 = Affiliate
    name: string;
    description?: string;
  };
}

export const createRole = async (req: RoleRequest, res: Response) => {
  try {
    const role = await roleService.createRole(req.body,req);
    res.status(201).json(role);
  } catch (error) {
    handleRoleError(res, error, 400, (req as any).__('FAILED_CREATE_ROLE'));
  }
};

export const getRoles = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const roles = await roleService.getRoles(page, limit);
    res.status(200).json(roles);
  } catch (error) {
    handleRoleError(res, error, 500,  (req as any).__('FAILED_FETCH_ROLE'));
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const role = await roleService.updateRole(id, req.body,req);
    if (!role) return res.status(404).json({ error: (req as any).__('ROLE_NOT_FOUND') });
    res.status(200).json(role);
  } catch (error) {
    handleRoleError(res, error, 400, (req as any).__('FAILED_UPDATE_ROLE'));
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const role = await roleService.deleteRole(id);
    if (!role) return res.status(404).json({ error: (req as any).__('ROLE_NOT_FOUND')  });
    res.status(200).json({ message: (req as any).__('ROLE_DELETED') });
  } catch (error) {
    handleRoleError(res, error, 400,(req as any).__('FAILED_DELETE_ROLE'));
  }
};

function handleRoleError(
  res: Response,
  error: unknown,
  defaultStatus: number,
  defaultMessage: string,
) {
  if (error instanceof Error) {
    const status = error.message.includes('not found') ? 404 : defaultStatus;
    res.status(status).json({ error: error.message });
  } else {
    res.status(defaultStatus).json({ error: defaultMessage });
  }
}
