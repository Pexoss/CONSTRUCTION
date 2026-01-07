import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { RoleType } from '../../shared/constants/roles';

export interface IUser extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: RoleType;
  isActive: boolean;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  updateLastLogin(): Promise<void>;
}

export interface IUserPublic {
  _id: string;
  companyId: string;
  name: string;
  email: string;
  role: RoleType;
  isActive: boolean;
  lastLogin?: Date;
}
