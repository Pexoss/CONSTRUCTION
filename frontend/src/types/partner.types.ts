export interface Partner {
  _id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePartnerData {
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  notes?: string;
  isActive?: boolean;
}

export type PartnerLoanStatus =
  | "with_customer"
  | "awaiting_partner_return"
  | "returned_to_partner"
  | "cancelled";

export interface PartnerLoan {
  _id: string;
  companyId: string;
  partnerId:
    | string
    | { _id: string; name: string; phone?: string; document?: string };
  rentalId: string | { _id: string; rentalNumber?: string; status?: string };
  lineId: string;
  itemId: string | { _id: string; name: string; sku?: string; customId?: string };
  quantity: number;
  ownQuantity: number;
  quantityWithCustomer: number;
  agreedCost?: number;
  notes?: string;
  status: PartnerLoanStatus;
  returnedToPartnerQty: number;
  returnedToPartnerAt?: string;
  createdAt?: string;
}

export interface PartnerLoanSummary {
  withCustomerQty: number;
  awaitingPartnerReturnQty: number;
  pendingAgreedCost: number;
}

export interface PartnerSupplyInput {
  partnerId: string;
  quantity: number;
  agreedCost?: number;
  notes?: string;
}
