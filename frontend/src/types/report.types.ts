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
  byMonth: Array<{ month: string; income: number; expenses: number; profit: number }>;
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
  byType: { preventive: number; corrective: number };
  byStatus: Record<string, number>;
  byMonth: Array<{ month: string; count: number; cost: number }>;
}
