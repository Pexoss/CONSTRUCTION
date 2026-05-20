export interface RentalsReport {
  totalRentals: number;
  totalRevenue: number;
  contractedRevenue?: number;
  billedRevenue?: number;
  pendingRevenue?: number;
  byStatus: Record<string, number>;
  byMonth: Array<{
    month: string;
    count: number;
    revenue: number;
    contractedRevenue?: number;
  }>;
}

export interface FinancialReport {
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  billedInPeriod?: number;
  receivedInPeriod?: number;
  pendingTotal?: number;
  byCategory: Array<{ category: string; income: number; expenses: number }>;
  byMonth: Array<{
    month: string;
    income: number;
    expenses: number;
    profit: number;
  }>;
}

export interface InvoicesGeneratedReport {
  totalInvoices: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  cancelledAmount: number;
  byStatus: Record<string, number>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    issuerCnpjDisplay: string;
    issuerLabel: string | null;
    customerName: string;
    rentalNumber?: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
    status: string;
    total: number;
  }>;
}

export interface RentalItemsPeriodsReport {
  totalLines: number;
  totalAmount: number;
  totalQuantity: number;
  byRentalType: Record<string, { quantity: number; amount: number }>;
  items: Array<{
    billingId: string;
    billingNumber: string;
    rentalNumber?: string;
    customerName: string;
    itemName: string;
    unitId?: string;
    periodStart: string;
    periodEnd: string;
    rentalType: string;
    quantity: number;
    unitPrice: number;
    periodsCharged: number;
    subtotal: number;
    status: string;
    equipmentSituationLabel: string;
    equipmentSituationSortKey: string;
  }>;
}

export interface MostRentedItem {
  itemId: string;
  itemName: string;
  rentalCount: number;
  totalRevenue: number;
}

export interface OccupancyRate {
  itemId: string;
  itemName: string;
  totalDays: number;
  rentedDays: number;
  occupancyRate: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  rentalCount: number;
  totalSpent: number;
}

export interface MaintenanceReport {
  totalMaintenances: number;
  totalCost: number;

  byStatus: {
    scheduled: number;
    in_progress: number;
    completed: number;
  };

  completedCost: number;
  inProgressCost: number;
  scheduledCost: number;

  byMonth: Array<{ month: string; count: number; cost: number }>;
}

export interface InventoryReport {
  totalItems: number;
  totalValue: number;
  totalInventoryValue?: number;
  lowStockItems: number;
  totalCompletedRevenue: number;
  activeItems: number;
  totalAvailable: number;
  totalDamaged: number;
  totalMaintenance: number;
  totalRented: number;
  totalReserved: number;
  totalStock: number;
  totalActive: number;
  items: {
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
  }[];
  byCategory?: {
    category: string;
    quantity: number;
    value: number;
  }[];
  mostUsedItems?: {
    itemId: string;
    itemName: string;
    quantity: number;
    totalValue: number;
  }[];
}
export interface ReceivablesReport {
  period: { startDate: string; endDate: string };
  summary: {
    fechamento: {
      receivedInPeriod: number;
      pendingTotal: number;
      paidCountInPeriod: number;
      pendingCount: number;
    };
    fatura: {
      receivedInPeriod: number;
      pendingTotal: number;
      paidCountInPeriod: number;
      pendingCount: number;
    };
    totals: {
      receivedInPeriod: number;
      pendingTotal: number;
    };
  };
  paidInPeriod: Array<{
    kind: "fechamento" | "fatura";
    id: string;
    documentNumber: string;
    customerName: string;
    amount: number;
    paymentDate: string | null;
    paymentMethod: string | null;
    rentalNumber?: string;
    dueDate: string | null;
  }>;
  pending: Array<{
    kind: "fechamento" | "fatura";
    id: string;
    documentNumber: string;
    customerName: string;
    amount: number;
    dueDate: string | null;
    referenceDate: string | null;
    status: string;
    rentalNumber?: string;
  }>;
}
