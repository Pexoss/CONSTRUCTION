export interface RentalsReport {
  totalRentals: number;
  totalRevenue: number;
  byStatus: Record<string, number>;
  byMonth: Array<{ month: string; count: number; revenue: number }>;
}

export interface FinancialReport {
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  byCategory: Array<{ category: string; income: number; expenses: number }>;
  byMonth: Array<{
    month: string;
    income: number;
    expenses: number;
    profit: number;
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
export interface InvoicesReport {
  totalInvoices: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  invoices: {
    invoiceId: string;
    customerName: string;
    issueDate: string;
    dueDate: string;
    amount: number;
    status: string;
  }[];
}
