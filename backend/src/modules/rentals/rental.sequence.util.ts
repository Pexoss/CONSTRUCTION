import mongoose from "mongoose";
import { IRental } from "./rental.types";

function sequenceFloor(sequenceStartMin = 1): number {
  if (typeof sequenceStartMin === "number" && Number.isFinite(sequenceStartMin)) {
    return Math.max(1, Math.floor(sequenceStartMin));
  }
  return 1;
}

/**
 * Próximo número de contrato só com dígitos.
 * Considera números já numéricos e o sufixo legado ALGUEL-/RENT-…-000123.
 * Próximo = max(piso configurado, maior já usado + 1).
 */
export async function allocateNextRentalSequenceNumber(
  companyId: mongoose.Types.ObjectId | string,
  sequenceStartMin = 1,
): Promise<string> {
  const companyOid =
    typeof companyId === "string"
      ? new mongoose.Types.ObjectId(companyId)
      : companyId;

  const RentalModel = mongoose.model<IRental>("Rental");
  const [agg] = await RentalModel.aggregate([
    { $match: { companyId: companyOid } },
    {
      $addFields: {
        seqNum: {
          $let: {
            vars: {
              str: { $toString: { $ifNull: ["$rentalNumber", ""] } },
            },
            in: {
              $cond: {
                if: { $regexMatch: { input: "$$str", regex: "^[0-9]+$" } },
                then: {
                  $convert: {
                    input: "$$str",
                    to: "long",
                    onError: 0,
                    onNull: 0,
                  },
                },
                else: {
                  $let: {
                    vars: {
                      found: {
                        $regexFind: {
                          input: "$$str",
                          regex: "^(ALGUEL|RENT)-[^-]+-([0-9]+)$",
                        },
                      },
                    },
                    in: {
                      $cond: {
                        if: { $ne: ["$$found", null] },
                        then: {
                          $convert: {
                            input: {
                              $arrayElemAt: ["$$found.captures", 1],
                            },
                            to: "long",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        else: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: "$seqNum" } } },
  ]);

  const next = Math.max(sequenceFloor(sequenceStartMin), Number(agg?.maxSeq ?? 0) + 1);
  return String(next);
}
