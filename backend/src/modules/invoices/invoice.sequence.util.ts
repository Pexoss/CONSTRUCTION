import mongoose from "mongoose";
import { Invoice } from "./invoice.model";

/** Próximo número sequencial apenas com dígitos (compartilha série legada MIX com alfanuméricos — estes são ignorados no max). */
export async function allocateNextInvoiceSequenceNumber(
  companyId: mongoose.Types.ObjectId,
  billingIssuerId: mongoose.Types.ObjectId | null | undefined,
  /** Piso da série para este emitente (configuração por CNPJ na empresa). Próximo = max(piso, maior já usado + 1). */
  sequenceStartMin = 1,
): Promise<string> {
  const match: Record<string, unknown> = { companyId };
  if (billingIssuerId) {
    match.billingIssuerId = billingIssuerId;
  } else {
    match.$or = [{ billingIssuerId: null }, { billingIssuerId: { $exists: false } }];
  }

  const [agg] = await Invoice.aggregate([
    { $match: match },
    {
      $addFields: {
        seqNum: {
          $let: {
            vars: { str: { $toString: "$invoiceNumber" } },
            in: {
              $cond: {
                if: { $regexMatch: { input: "$$str", regex: "^[0-9]+$" } },
                then: { $toInt: "$$str" },
                else: 0,
              },
            },
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: "$seqNum" } } },
  ]);

  const floor =
    typeof sequenceStartMin === "number" && Number.isFinite(sequenceStartMin)
      ? Math.max(1, Math.floor(sequenceStartMin))
      : 1;
  const next = Math.max(floor, (agg?.maxSeq ?? 0) + 1);
  return String(next);
}
