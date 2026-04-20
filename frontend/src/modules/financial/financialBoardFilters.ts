/** Filtros do quadro financeiro (query params: customer, item, obra, start, end). */

export type FinancialBoardUrlFilters = {
  customerId: string;
  itemText: string;
  obraText: string;
  periodStart: string;
  periodEnd: string;
};

export function billingMatchesBoardFilters(billing: any, f: FinancialBoardUrlFilters): boolean {
  const normalizedItemFilter = f.itemText.trim().toLowerCase();
  const normalizedObraFilter = f.obraText.trim().toLowerCase();
  const billingCustomerId = String(billing.customerId?._id || billing.customerId || "");
  const matchesCustomer = !f.customerId || billingCustomerId === f.customerId;

  const itemNames = (billing.items || [])
    .map((item: any) =>
      String(item?.itemId?.name || item?.itemId || "")
        .trim()
        .toLowerCase(),
    )
    .join(" ");
  const matchesItem = !normalizedItemFilter || itemNames.includes(normalizedItemFilter);

  const workAddress = billing.rentalId?.workAddress;
  const obraName = String(workAddress?.workName || "").toLowerCase();
  const obraCity = String(workAddress?.city || "").toLowerCase();
  const obraState = String(workAddress?.state || "").toLowerCase();
  const matchesObra =
    !normalizedObraFilter || `${obraName} ${obraCity} ${obraState}`.includes(normalizedObraFilter);

  const periodStart = billing.periodStart ? new Date(billing.periodStart) : null;
  const periodEnd = billing.periodEnd ? new Date(billing.periodEnd) : null;
  const filterStart = f.periodStart ? new Date(`${f.periodStart}T00:00:00`) : null;
  const filterEnd = f.periodEnd ? new Date(`${f.periodEnd}T23:59:59`) : null;
  const matchesPeriod =
    (!filterStart || (periodEnd && periodEnd >= filterStart)) &&
    (!filterEnd || (periodStart && periodStart <= filterEnd));

  return matchesCustomer && matchesItem && matchesObra && matchesPeriod;
}

export function groupBillingsByFinancialStage(billings: any[]) {
  return {
    pending: billings.filter((b: any) => b.financialStage === "pending"),
    charge: billings.filter((b: any) => b.financialStage === "charge"),
    invoiced: billings.filter((b: any) => b.financialStage === "invoiced"),
    paid: billings.filter((b: any) => b.financialStage === "paid"),
    cancelled: billings.filter((b: any) => b.financialStage === "cancelled"),
  };
}
