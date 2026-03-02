import { Rental } from "../rentals/rental.model";
import { Transaction } from "../transactions/transaction.model";
import { Maintenance } from "../maintenance/maintenance.model";
import { Item } from "../inventory/item.model";
import { Customer } from "../customers/customer.model";
import mongoose from "mongoose";

class ReportService {
  /**
   * Get rentals report by period
   */
  async getRentalsReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalRentals: number;
    totalRevenue: number;
    byStatus: Record<string, number>;
    byMonth: Array<{ month: string; count: number; revenue: number }>;
  }> {
    const rentals = await Rental.find({
      companyId,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const totalRentals = rentals.length;
    const totalRevenue = rentals.reduce((sum, r) => sum + r.pricing.total, 0);

    const byStatus: Record<string, number> = {};
    rentals.forEach((rental) => {
      byStatus[rental.status] = (byStatus[rental.status] || 0) + 1;
    });

    const byMonthMap: Record<string, { count: number; revenue: number }> = {};
    rentals.forEach((rental) => {
      const month = new Date(rental.createdAt || rental.dates.reservedAt)
        .toISOString()
        .slice(0, 7);
      if (!byMonthMap[month]) {
        byMonthMap[month] = { count: 0, revenue: 0 };
      }
      byMonthMap[month].count += 1;
      byMonthMap[month].revenue += rental.pricing.total;
    });

    const byMonth = Object.entries(byMonthMap)
      .map(([month, data]) => ({
        month,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalRentals,
      totalRevenue,
      byStatus,
      byMonth,
    };
  }

  /**
   * Get financial report
   */
  async getFinancialReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
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
  }> {
    const transactions = await Transaction.find({
      companyId,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    let totalIncome = 0;
    let totalExpenses = 0;

    const categoryMap: Record<string, { income: number; expenses: number }> =
      {};
    const monthMap: Record<string, { income: number; expenses: number }> = {};

    transactions.forEach((transaction) => {
      const month = new Date(transaction.createdAt || new Date())
        .toISOString()
        .slice(0, 7);
      if (!monthMap[month]) {
        monthMap[month] = { income: 0, expenses: 0 };
      }

      if (transaction.type === "income") {
        totalIncome += transaction.amount;
        monthMap[month].income += transaction.amount;
        categoryMap[transaction.category] = categoryMap[
          transaction.category
        ] || { income: 0, expenses: 0 };
        categoryMap[transaction.category].income += transaction.amount;
      } else {
        totalExpenses += transaction.amount;
        monthMap[month].expenses += transaction.amount;
        categoryMap[transaction.category] = categoryMap[
          transaction.category
        ] || { income: 0, expenses: 0 };
        categoryMap[transaction.category].expenses += transaction.amount;
      }
    });

    const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      income: data.income,
      expenses: data.expenses,
    }));

    const byMonth = Object.entries(monthMap)
      .map(([month, data]) => ({
        month,
        income: data.income,
        expenses: data.expenses,
        profit: data.income - data.expenses,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalIncome,
      totalExpenses,
      profit: totalIncome - totalExpenses,
      byCategory,
      byMonth,
    };
  }

  /**
   * Get most rented items
   */
  async getMostRentedItems(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 10,
  ): Promise<
    Array<{
      itemId: string;
      itemName: string;
      rentalCount: number;
      totalRevenue: number;
    }>
  > {
    const dateFilter: any = { companyId };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const rentals = await Rental.find(dateFilter).populate("items.itemId");

    const itemMap: Record<
      string,
      { name: string; count: number; revenue: number }
    > = {};

    rentals.forEach((rental) => {
      rental.items.forEach((item) => {
        const itemId = item.itemId.toString();
        const itemData = item.itemId as any;
        const itemName = itemData?.name || "Item";

        if (!itemMap[itemId]) {
          itemMap[itemId] = { name: itemName, count: 0, revenue: 0 };
        }
        itemMap[itemId].count += item.quantity;
        itemMap[itemId].revenue += item.subtotal;
      });
    });

    return Object.entries(itemMap)
      .map(([itemId, data]) => ({
        itemId,
        itemName: data.name,
        rentalCount: data.count,
        totalRevenue: data.revenue,
      }))
      .sort((a, b) => b.rentalCount - a.rentalCount)
      .slice(0, limit);
  }

  /**
   * Get equipment occupancy rate
   */
  async getEquipmentOccupancyRate(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    Array<{
      itemId: string;
      itemName: string;
      totalDays: number;
      rentedDays: number;
      occupancyRate: number;
    }>
  > {
    const items = await Item.find({ companyId, isActive: true });
    const rentals = await Rental.find({
      companyId,
      $or: [
        {
          "dates.pickupScheduled": { $lte: endDate },
          "dates.returnScheduled": { $gte: startDate },
        },
      ],
    }).populate("items.itemId");

    const totalDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const itemOccupancy: Record<
      string,
      { name: string; rentedDays: Set<string> }
    > = {};

    items.forEach((item) => {
      itemOccupancy[item._id.toString()] = {
        name: item.name,
        rentedDays: new Set(),
      };
    });

    rentals.forEach((rental) => {
      const pickupDate = new Date(rental.dates.pickupScheduled);
      const returnDate = new Date(rental.dates.returnScheduled);

      rental.items.forEach((item) => {
        const itemId = item.itemId.toString();
        if (itemOccupancy[itemId]) {
          const currentDate = new Date(pickupDate);
          while (
            currentDate <= returnDate &&
            currentDate <= endDate &&
            currentDate >= startDate
          ) {
            itemOccupancy[itemId].rentedDays.add(
              currentDate.toISOString().split("T")[0],
            );
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
      });
    });

    return Object.entries(itemOccupancy).map(([itemId, data]) => ({
      itemId,
      itemName: data.name,
      totalDays,
      rentedDays: data.rentedDays.size,
      occupancyRate:
        totalDays > 0 ? (data.rentedDays.size / totalDays) * 100 : 0,
    }));
  }

  /**
   * Get top customers by rental volume
   */
  async getTopCustomers(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 10,
  ): Promise<
    Array<{
      customerId: string;
      customerName: string;
      rentalCount: number;
      totalSpent: number;
    }>
  > {
    const dateFilter: any = { companyId };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const rentals = await Rental.find(dateFilter).populate("customerId");

    const customerMap: Record<
      string,
      { name: string; count: number; spent: number }
    > = {};

    rentals.forEach((rental) => {
      const customerId = rental.customerId.toString();
      const customerData = rental.customerId as any;
      const customerName = customerData?.name || "Cliente";

      if (!customerMap[customerId]) {
        customerMap[customerId] = { name: customerName, count: 0, spent: 0 };
      }
      customerMap[customerId].count += 1;
      customerMap[customerId].spent += rental.pricing.total;
    });

    return Object.entries(customerMap)
      .map(([customerId, data]) => ({
        customerId,
        customerName: data.name,
        rentalCount: data.count,
        totalSpent: data.spent,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);
  }

  /**
   * Get maintenance report
   */
  async getMaintenanceReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // início do dia
    start.setUTCHours(0, 0, 0, 0);

    // final do dia
    end.setUTCHours(23, 59, 59, 999);

    console.log("START:", start);
    console.log("END:", end);

    const maintenances = await Maintenance.find({
      companyId,
      scheduledDate: {
        $gte: start,
        $lte: end,
      },
    });

    const totalMaintenances = maintenances.length;

    const byStatus = {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
    };

    let scheduledCost = 0;
    let inProgressCost = 0;
    let completedCost = 0;

    const byMonthMap: Record<string, { count: number; cost: number }> = {};

    maintenances.forEach((m) => {
      const cost = m.cost || 0;

      //Status
      if (m.status === "scheduled") {
        byStatus.scheduled += 1;
        scheduledCost += cost;
      }

      if (m.status === "in_progress") {
        byStatus.in_progress += 1;
        inProgressCost += cost;
      }

      if (m.status === "completed") {
        byStatus.completed += 1;
        completedCost += cost;
      }

      //Agrupar por mês
      const month = new Date(m.scheduledDate).toISOString().slice(0, 7);

      if (!byMonthMap[month]) {
        byMonthMap[month] = { count: 0, cost: 0 };
      }

      byMonthMap[month].count += 1;
      byMonthMap[month].cost += cost;
    });

    const byMonth = Object.entries(byMonthMap)
      .map(([month, data]) => ({
        month,
        count: data.count,
        cost: data.cost,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const totalCost = scheduledCost + inProgressCost + completedCost;

    return {
      totalMaintenances,
      totalCost,
      byStatus,
      scheduledCost,
      inProgressCost,
      completedCost,
      byMonth,
    };
  }
  async getInventoryReport(companyId: string) {
    const items = await Item.find({ companyId });

    const rentals = await Rental.find({
      companyId,
      status: "completed",
    });

    let totalItems = items.length;
    let activeItems = 0;

    let totalStock = 0;
    let totalAvailable = 0;
    let totalRented = 0;
    let totalReserved = 0;
    let totalMaintenance = 0;
    let totalDamaged = 0;
    let totalActive = 0;

    let totalCompletedRevenue = 0;

    //Soma receita real
    rentals.forEach((rental) => {
      const total = rental.pricing?.total ?? 0;
      totalCompletedRevenue += total;
    });

    items.forEach((item) => {
      if (item.isActive) totalActive++;
    });

    //Dados de estoque
    items.forEach((item) => {
      if (item.isActive) activeItems++;

      const q = item.quantity || {};

      totalStock += q.total ?? 0;
      totalAvailable += q.available ?? 0;
      totalRented += q.rented ?? 0;
      totalReserved += q.reserved ?? 0;
      totalMaintenance += q.maintenance ?? 0;
      totalDamaged += q.damaged ?? 0;
    });

    return {
      totalItems,
      activeItems,
      totalStock,
      totalAvailable,
      totalRented,
      totalReserved,
      totalMaintenance,
      totalDamaged,
      totalCompletedRevenue,
      totalActive,
    };
  }
  async getMostRentedInventoryItems(companyId: string, limit = 5) {
    const items = await Item.find({ companyId })
      .sort({ "quantity.rented": -1 })
      .limit(limit);

    return items.map((item) => ({
      itemId: item._id,
      name: item.name,
      rented: item.quantity.rented || 0,
      total: item.quantity.total,
    }));
  }
}

export const reportService = new ReportService();
