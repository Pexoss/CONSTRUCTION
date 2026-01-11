import { Document } from 'mongoose';
import mongoose from 'mongoose';

export interface ICustomer extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  notes?: string;
  isBlocked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
