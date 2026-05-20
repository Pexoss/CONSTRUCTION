import mongoose from "mongoose";

/** Filtro por emitente: id do subdocumento, ou `legacy` para faturas sem emitente cadastrado. */
export function mergeInvoiceIssuerFilter(
  query: Record<string, unknown>,
  issuerParam?: string | null,
): void {
  const raw = issuerParam?.trim();
  if (!raw) return;
  if (raw === "legacy") {
    query.$or = [{ billingIssuerId: null }, { billingIssuerId: { $exists: false } }];
    return;
  }
  if (mongoose.isValidObjectId(raw)) {
    query.billingIssuerId = new mongoose.Types.ObjectId(raw);
  }
}
