import Role, { IRole } from '../models/role';
import { Types } from 'mongoose';

interface RoleData {
  name: string;
  description?: string;
}

export const createRole = async (data: RoleData): Promise<IRole> => {
  const existingRole = await Role.findOne({ name: data.name });
  if (existingRole) {
    throw new Error('Role name already exists');
  }

  const role = new Role(data);
  return role.save();
};

export const getRoles = async (page: number = 1, limit: number = 10): Promise<IRole[]> => {
  return Role.find({})
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

export const updateRole = async (
  id: Types.ObjectId,
  data: Partial<RoleData>
): Promise<IRole | null> => {
  if (data.name) {
    const existingRole = await Role.findOne({ name: data.name });
    if (existingRole && !existingRole._id.equals(id)) {
      throw new Error('Role name already exists');
    }
  }

  return Role.findByIdAndUpdate(
    id,
    data,
    { new: true, runValidators: true }
  );
};

export const deleteRole = async (id: Types.ObjectId): Promise<IRole | null> => {
  return Role.findByIdAndUpdate(
    id,
    { is_deleted: true },
    { new: true }
  );
};