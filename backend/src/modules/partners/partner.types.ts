import { Document } from "mongoose";
import mongoose from "mongoose";

export interface IPartner extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PartnerLoanStatus =
  | "with_customer"
  | "awaiting_partner_return"
  | "returned_to_partner"
  | "cancelled";

export interface IPartnerLoan extends Document {
  companyId: mongoose.Types.ObjectId;
  partnerId: mongoose.Types.ObjectId;
  rentalId: mongoose.Types.ObjectId;
  lineId: string;
  itemId: mongoose.Types.ObjectId;
  /** Quantidade pegada do parceiro */
  quantity: number;
  /** Quantidade própria baixada no estoque nesta linha */
  ownQuantity: number;
  /** Ainda com o cliente (parte do parceiro) */
  quantityWithCustomer: number;
  agreedCost?: number;
  notes?: string;
  status: PartnerLoanStatus;
  returnedToPartnerQty: number;
  returnedToPartnerAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
