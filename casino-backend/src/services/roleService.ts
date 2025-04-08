import Role, { IRole } from '../models/role';

interface RoleData {
  role_id: number; // 0 = User, 1 = Admin, 2 = Affiliate
  name: string;
  description?: string;
}

export const createRole = async (data: RoleData): Promise<IRole> => {
  const existingRole = await Role.findOne({ role_id: data.role_id });
  if (existingRole) {
    throw new Error('Role ID already exists');
  }

  const role = new Role(data);
  return role.save();
};

export const getRoles = async (
  page: number = 1,
  limit: number = 10,
): Promise<IRole[]> => {
  return Role.find({})
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

export const updateRole = async (
  id: number,
  data: Partial<RoleData>,
): Promise<IRole | null> => {
  if (data.role_id !== undefined) {
    const existingRole = await Role.findOne({ role_id: data.role_id });
    if (existingRole && existingRole.role_id !== id) {
      throw new Error('Role ID already exists');
    }
  }

  return Role.findByIdAndUpdate({ role_id: id }, data, {
    new: true,
    runValidators: true,
  });
};

export const deleteRole = async (id: number): Promise<IRole | null> => {
  return Role.findByIdAndUpdate(
    { role_id: id },
    { is_deleted: true },
    { new: true },
  );
};
