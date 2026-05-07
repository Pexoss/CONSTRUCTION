import { Rental } from "../rentals/rental.model";
import { Transaction } from "../transactions/transaction.model";
import { Maintenance } from "../maintenance/maintenance.model";
import { Item } from "../inventory/item.model";
import { Customer } from "../customers/customer.model";
import { Billing } from "../billings/billing.model";
import { Invoice } from "../invoices/invoice.model";

export type ReceivablesReport = {
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
};

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
    contractedRevenue: number;
    billedRevenue: number;
    pendingRevenue: number;
    depositTotal: number;
    byStatus: Record<string, number>;
    byMonth: Array<{ month: string; count: number; revenue: number; contractedRevenue: number }>;
  }> {
    const { start, end } = this.normalizeReportRange(startDate, endDate);
    const [rentals, billings] = await Promise.all([
      Rental.find({
        companyId,
        createdAt: { $gte: start, $lte: end },
      }),
      Billing.find({
        companyId,
        status: { $ne: "cancelled" },
        billingDate: { $gte: start, $lte: end },
      }).lean(),
    ]);

    const totalRentals = rentals.length;
    const contractedRevenue = rentals.reduce((sum, r) => sum + Number(r.pricing.total || 0), 0);
    const depositTotal = rentals.reduce((sum, r) => sum + Number(r.pricing.deposit || 0), 0);
    const billedRevenue = billings.reduce(
      (sum, b) => sum + Number(b.calculation?.total || 0),
      0,
    );
    const pendingRevenue = billings.reduce(
      (sum, b) => sum + Number(b.outstandingAmount ?? b.calculation?.total ?? 0),
      0,
    );
    const totalRevenue = billedRevenue;

    const byStatus: Record<string, number> = {};
    rentals.forEach((rental) => {
      byStatus[rental.status] = (byStatus[rental.status] || 0) + 1;
    });

    const byMonthMap: Record<
      string,
      { count: number; revenue: number; contractedRevenue: number }
    > = {};
    rentals.forEach((rental) => {
      const month = new Date(rental.createdAt || rental.dates.reservedAt)
        .toISOString()
        .slice(0, 7);
      if (!byMonthMap[month]) {
        byMonthMap[month] = { count: 0, revenue: 0, contractedRevenue: 0 };
      }
      byMonthMap[month].count += 1;
      byMonthMap[month].revenue += 0;
      byMonthMap[month].contractedRevenue += Number(rental.pricing.total || 0);
    });
    billings.forEach((billing) => {
      const month = new Date(billing.billingDate || billing.createdAt || new Date())
        .toISOString()
        .slice(0, 7);
      if (!byMonthMap[month]) {
        byMonthMap[month] = { count: 0, revenue: 0, contractedRevenue: 0 };
      }
      byMonthMap[month].revenue += Number(billing.calculation?.total || 0);
    });

    const byMonth = Object.entries(byMonthMap)
      .map(([month, data]) => ({
        month,
        count: data.count,
        revenue: data.revenue,
        contractedRevenue: data.contractedRevenue,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalRentals,
      totalRevenue,
      contractedRevenue,
      billedRevenue,
      pendingRevenue,
      depositTotal,
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
    billedInPeriod: number;
    receivedInPeriod: number;
    pendingTotal: number;
    byCategory: Array<{ category: string; income: number; expenses: number }>;
    byMonth: Array<{
      month: string;
      income: number;
      expenses: number;
      profit: number;
    }>;
  }> {
    const { start, end } = this.normalizeReportRange(startDate, endDate);
    const [transactions, billings, pendingBillings] = await Promise.all([
      Transaction.find({
        companyId,
        createdAt: { $gte: start, $lte: end },
      }),
      Billing.find({
        companyId,
        status: { $ne: "cancelled" },
        billingDate: { $gte: start, $lte: end },
      }).lean(),
      Billing.find({
        companyId,
        status: { $nin: ["paid", "cancelled"] },
      }).lean(),
    ]);

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

    const billedInPeriod = billings.reduce(
      (sum, billing) => sum + Number(billing.calculation?.total || 0),
      0,
    );
    const receivedFromBillings = billings.reduce(
      (sum, billing: any) =>
        sum +
        (billing.paymentHistory || []).reduce(
          (acc: number, payment: any) => acc + Number(payment.amount || 0),
          0,
        ),
      0,
    );
    const receivedInPeriod = totalIncome || receivedFromBillings;
    const pendingTotal = pendingBillings.reduce(
      (sum, billing) => sum + Number(billing.outstandingAmount ?? billing.calculation?.total ?? 0),
      0,
    );

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
      billedInPeriod,
      receivedInPeriod,
      pendingTotal,
      byCategory,
      byMonth,
    };
  }

  async getInvoicesGeneratedReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalInvoices: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    cancelledAmount: number;
    byStatus: Record<string, number>;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      customerName: string;
      rentalNumber?: string;
      issueDate: string;
      dueDate: string;
      paidDate: string | null;
      status: string;
      total: number;
    }>;
  }> {
    const { start, end } = this.normalizeReportRange(startDate, endDate);
    const invoices = await Invoice.find({
      companyId,
      issueDate: { $gte: start, $lte: end },
    })
      .populate("customerId", "name")
      .populate("rentalId", "rentalNumber")
      .sort({ issueDate: 1 })
      .lean();

    const byStatus: Record<string, number> = {};
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let cancelledAmount = 0;

    const rows = invoices.map((invoice: any) => {
      const total = Number(invoice.total || 0);
      byStatus[invoice.status] = (byStatus[invoice.status] || 0) + 1;

      if (invoice.status === "cancelled") {
        cancelledAmount += total;
      } else {
        totalAmount += total;
        if (invoice.status === "paid") {
          paidAmount += total;
        } else {
          pendingAmount += total;
        }
      }

      return {
        id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerId?.name || "Cliente",
        rentalNumber: invoice.rentalId?.rentalNumber,
        issueDate: invoice.issueDate?.toISOString?.() || new Date(invoice.issueDate).toISOString(),
        dueDate: invoice.dueDate?.toISOString?.() || new Date(invoice.dueDate).toISOString(),
        paidDate: invoice.paidDate
          ? invoice.paidDate?.toISOString?.() || new Date(invoice.paidDate).toISOString()
          : null,
        status: invoice.status,
        total,
      };
    });

    return {
      totalInvoices: invoices.length,
      totalAmount,
      paidAmount,
      pendingAmount,
      cancelledAmount,
      byStatus,
      invoices: rows,
    };
  }

  async getRentalItemsPeriodsReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
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
    }>;
  }> {
    const { start, end } = this.normalizeReportRange(startDate, endDate);
    const billings = await Billing.find({
      companyId,
      status: { $ne: "cancelled" },
      periodStart: { $lte: end },
      periodEnd: { $gte: start },
      "items.0": { $exists: true },
    })
      .populate("customerId", "name")
      .populate("rentalId", "rentalNumber")
      .populate("items.itemId", "name")
      .sort({ periodStart: 1, periodEnd: 1 })
      .lean();

    const byRentalType: Record<string, { quantity: number; amount: number }> = {};
    let totalAmount = 0;
    let totalQuantity = 0;

    const rows = billings.flatMap((billing: any) =>
      (billing.items || []).map((item: any) => {
        const itemName = item.itemId?.name || "Item";
        const rentalType = String(billing.rentalType || "daily");
        const quantity = Number(item.quantity || 0);
        const subtotal = Number(item.subtotal || 0);

        if (!byRentalType[rentalType]) {
          byRentalType[rentalType] = { quantity: 0, amount: 0 };
        }
        byRentalType[rentalType].quantity += quantity;
        byRentalType[rentalType].amount += subtotal;
        totalQuantity += quantity;
        totalAmount += subtotal;

        return {
          billingId: String(billing._id),
          billingNumber: billing.billingNumber,
          rentalNumber: billing.rentalId?.rentalNumber,
          customerName: billing.customerId?.name || "Cliente",
          itemName,
          unitId: item.unitId,
          periodStart: billing.periodStart?.toISOString?.() || new Date(billing.periodStart).toISOString(),
          periodEnd: billing.periodEnd?.toISOString?.() || new Date(billing.periodEnd).toISOString(),
          rentalType,
          quantity,
          unitPrice: Number(item.unitPrice || 0),
          periodsCharged: Number(item.periodsCharged || 0),
          subtotal,
          status: billing.status,
        };
      }),
    );

    return {
      totalLines: rows.length,
      totalAmount,
      totalQuantity,
      byRentalType,
      items: rows,
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

  private normalizeReportRange(startDate: Date, endDate: Date) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Recebimentos no período (data de pagamento) e pendências (fechamentos aprovados não pagos + faturas em rascunho/enviadas).
   */
  async getReceivablesReport(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReceivablesReport> {
    const { start, end } = this.normalizeReportRange(startDate, endDate);

    const [paidBillings, pendingBillings, paidInvoices, pendingInvoices] =
      await Promise.all([
        Billing.find({
          companyId,
          status: "paid",
          paymentDate: { $gte: start, $lte: end },
        })
          .populate("customerId", "name")
          .populate("rentalId", "rentalNumber")
          .lean(),
        Billing.find({
          companyId,
          status: "approved",
        })
          .populate("customerId", "name")
          .populate("rentalId", "rentalNumber")
          .lean(),
        Invoice.find({
          companyId,
          status: "paid",
          paidDate: { $gte: start, $lte: end },
        })
          .populate("customerId", "name")
          .lean(),
        Invoice.find({
          companyId,
          status: { $in: ["draft", "sent"] },
        })
          .populate("customerId", "name")
          .lean(),
      ]);

    const customerName = (c: unknown) =>
      c && typeof c === "object" && c !== null && "name" in c
        ? String((c as { name?: string }).name || "—")
        : "—";

    const paidBillingAmount = (billing: any) => {
      const payments = billing.paymentHistory || [];
      const paid = payments.reduce(
        (sum: number, payment: any) => sum + Number(payment.amount || 0),
        0,
      );
      return paid > 0 ? paid : Number(billing.calculation?.total || 0);
    };
    const billingOutstanding = (billing: any) =>
      Number(billing.outstandingAmount ?? billing.calculation?.total ?? 0);

    const fechReceived = paidBillings.reduce((s, b) => s + paidBillingAmount(b), 0);
    const fechPending = pendingBillings.reduce(
      (s, b) => s + billingOutstanding(b),
      0,
    );

    const fatReceived = paidInvoices.reduce((s, i) => s + (i.total ?? 0), 0);
    const fatPending = pendingInvoices.reduce((s, i) => s + (i.total ?? 0), 0);

    const rentalNum = (rentalId: unknown) =>
      rentalId &&
      typeof rentalId === "object" &&
      rentalId !== null &&
      "rentalNumber" in rentalId
        ? String((rentalId as { rentalNumber?: string }).rentalNumber ?? "")
        : undefined;

    const paidInPeriod: ReceivablesReport["paidInPeriod"] = [
      ...paidBillings.map((b) => ({
        kind: "fechamento" as const,
        id: String(b._id),
        documentNumber: b.billingNumber,
        customerName: customerName(b.customerId),
        amount: paidBillingAmount(b),
        paymentDate: b.paymentDate
          ? new Date(b.paymentDate).toISOString()
          : null,
        paymentMethod: b.paymentMethod ?? null,
        rentalNumber: rentalNum(b.rentalId),
        dueDate: null,
      })),
      ...paidInvoices.map((inv) => ({
        kind: "fatura" as const,
        id: String(inv._id),
        documentNumber: inv.invoiceNumber,
        customerName: customerName(inv.customerId),
        amount: inv.total ?? 0,
        paymentDate: inv.paidDate
          ? new Date(inv.paidDate).toISOString()
          : null,
        paymentMethod: inv.paymentMethod ?? null,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString() : null,
      })),
    ].sort((a, b) =>
      String(b.paymentDate ?? "").localeCompare(String(a.paymentDate ?? "")),
    );

    const pending: ReceivablesReport["pending"] = [
      ...pendingBillings.map((b) => ({
        kind: "fechamento" as const,
        id: String(b._id),
        documentNumber: b.billingNumber,
        customerName: customerName(b.customerId),
        amount: billingOutstanding(b),
        dueDate: null,
        referenceDate: b.billingDate
          ? new Date(b.billingDate).toISOString()
          : null,
        status: b.status,
        rentalNumber: rentalNum(b.rentalId),
      })),
      ...pendingInvoices.map((inv) => ({
        kind: "fatura" as const,
        id: String(inv._id),
        documentNumber: inv.invoiceNumber,
        customerName: customerName(inv.customerId),
        amount: inv.total ?? 0,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString() : null,
        referenceDate: inv.issueDate
          ? new Date(inv.issueDate).toISOString()
          : null,
        status: inv.status,
      })),
    ].sort((a, b) =>
      String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? "")),
    );

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summary: {
        fechamento: {
          receivedInPeriod: fechReceived,
          pendingTotal: fechPending,
          paidCountInPeriod: paidBillings.length,
          pendingCount: pendingBillings.length,
        },
        fatura: {
          receivedInPeriod: fatReceived,
          pendingTotal: fatPending,
          paidCountInPeriod: paidInvoices.length,
          pendingCount: pendingInvoices.length,
        },
        totals: {
          receivedInPeriod: fechReceived + fatReceived,
          pendingTotal: fechPending + fatPending,
        },
      },
      paidInPeriod,
      pending,
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
    let totalInventoryValue = 0;

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

      const currentValue = Number(item.depreciation?.currentValue ?? item.depreciation?.initialValue ?? 0);
      const unitsCount = item.trackingType === "unit" ? item.units?.length || 0 : q.total || 0;
      totalInventoryValue += currentValue * unitsCount;
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
      totalInventoryValue,
      totalValue: totalInventoryValue,
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
