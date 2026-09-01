import { Rental } from "./rental.model";
import { Item } from "../inventory/item.model";
import { ItemMovement } from "../inventory/itemMovement.model";
import {
  IRental,
  RentalStatus,
  IRentalItem,
  IRentalPricing,
  IRentalService,
  IRentalWorkAddress,
  IRentalChangeHistory,
  IRentalPendingApproval,
  IRentalResponsibleContact,
  RentalType,
  RentalDetails,
  UpdateRentalStatusResponse,
} from "./rental.types";
import mongoose, { Error } from "mongoose";
import { randomUUID } from "crypto";
import { ICustomer } from "../customers/customer.types";
import { Customer } from "../customers/customer.model";
import { RoleType } from "../../shared/constants/roles";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "../../shared/utils/http-error.util";
import {
  canApplyDiscount,
  canBypassCustomerCpfAsAdmin,
  canUpdateRentalStatus,
} from "../../helpers/UserPermission";
import { rentalCpfBypassService } from "./rental-cpf-bypass.service";
import {
  ownStockQuantity,
  partnerService,
  partnerStockQuantity,
} from "../partners/partner.service";
import { Partner } from "../partners/partner.model";
import { notificationService } from "../notification/notification.service";
import { User } from "../users/user.model";
import billingService, {
  applyPeriodRateOverride,
  calculateBillingPeriod,
  calculateRentalLineAmount,
  effectivePricingPeriods,
  periodRateFromInventory,
  registeredPeriodRateFromInventory,
  resolveBillingTotal,
} from "../billings/billing.service";
import {
  isValidCpfCnpj,
  normalizeDocument,
} from "../../shared/utils/document.utils";
import { Billing } from "../billings/billing.model";
import { Charge } from "../charges/charge.model";
import { Invoice } from "../invoices/invoice.model";
import { asIdString, buildRentalLineKey } from "../../shared/utils/rental-line-key.util";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  normalizeDateForBilling,
  addBillingDays,
  getPeriodEndInclusive,
  getPeriodLengthDays as getPeriodLengthDaysFromUtil,
  isLocalMidnight,
} from "../../shared/utils/rental-period.util";
import { formatCurrencyBr } from "../../shared/utils/money-display.util";
import { accentInsensitiveRegexFilter } from "../../shared/utils/accent-insensitive.util";
class RentalService {
  private getPeriodLengthDays(rentalType: RentalType): number {
    return getPeriodLengthDaysFromUtil(rentalType);
  }

  private addDays(date: Date, days: number): Date {
    return addBillingDays(date, days);
  }

  private normalizeDate(date: Date): Date {
    return normalizeDateForBilling(date);
  }

  /** Igual ao deduplica em fechamentos diários com horário: encontra docs antigos só com meia-noite. */
  private billingInstantOrDayMatch(
    d: Date,
  ): Date | { $in: Date[] } {
    if (!isLocalMidnight(d)) {
      const dayOnly = new Date(d);
      dayOnly.setHours(0, 0, 0, 0);
      return { $in: [d, dayOnly] };
    }
    return d;
  }

  private normalizeCpf(value?: string | null): string {
    return normalizeDocument(value);
  }

  private isValidCpf(value?: string | null): boolean {
    return isValidCpfCnpj(value);
  }

  /** Linha ainda em aberto (sem devolução registrada); evita bater na linha histórica repetindo itemId/unitId. */
  private findOpenRentalItemIndex(
    items: IRentalItem[] | undefined,
    itemId: string,
    unitId?: string | null,
    lineId?: string | null,
  ): number {
    const id = itemId.toString();
    const list = items || [];
    const wantLine =
      lineId != null && String(lineId).trim() !== ""
        ? String(lineId).trim()
        : undefined;

    const matches = list
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (item.returnActual) return false;
        if (item.itemId.toString() !== id) return false;
        if (unitId != null && String(unitId).trim() !== "") {
          return item.unitId === unitId;
        }
        return !item.unitId;
      });

    if (matches.length === 0) return -1;

    if (wantLine) {
      const hit = matches.find(
        ({ item }) =>
          typeof item.lineId === "string" && item.lineId.trim() === wantLine,
      );
      return hit ? hit.index : -1;
    }

    if (matches.length > 1) {
      throw badRequest(
        "Este contrato tem mais de uma linha aberta deste equipamento. Informe lineId ao devolver ou fechar cada segmento.",
      );
    }

    return matches[0].index;
  }

  private findOpenRentalItem(
    items: IRentalItem[] | undefined,
    itemId: string,
    unitId?: string | null,
    lineId?: string | null,
  ): IRentalItem | undefined {
    const idx = this.findOpenRentalItemIndex(items, itemId, unitId, lineId);
    if (idx === -1) return undefined;
    return (items || [])[idx];
  }

  private findRentalLineItemForPatch(
    rental: IRental,
    patch: {
      itemId: string;
      unitId?: string;
      lineId?: string | null;
    },
  ): IRentalItem | undefined {
    const id = String(patch.itemId).trim();
    const unit =
      patch.unitId != null && String(patch.unitId).trim() !== ""
        ? String(patch.unitId).trim()
        : undefined;
    const want =
      typeof patch.lineId === "string" && patch.lineId.trim().length > 0
        ? patch.lineId.trim()
        : undefined;

    const sameItem = (rental.items || []).filter(
      (i) => asIdString(i.itemId) === id,
    );

    if (want) {
      const byLine = sameItem.find(
        (i) =>
          typeof i.lineId === "string" && String(i.lineId).trim() === want,
      );
      if (byLine) return byLine;
    }

    const candidates = sameItem.filter((i) => {
      if (unit !== undefined) return String(i.unitId || "").trim() === unit;
      return !i.unitId;
    });
    const sansLine = candidates.filter(
      (i) => !(typeof i.lineId === "string" && i.lineId.trim().length > 0),
    );
    if (sansLine.length === 1) return sansLine[0];
    if (candidates.length === 1) return candidates[0];

    if (unit !== undefined) {
      const openSameItem = sameItem.filter((i) => !i.returnActual);
      if (openSameItem.length === 1) return openSameItem[0];
    }
    return undefined;
  }

  private isLoanLine(item: { isLoan?: boolean } | null | undefined): boolean {
    return item?.isLoan === true;
  }

  private sameScheduleMoment(
    left?: Date | string | null,
    right?: Date | string | null,
  ): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return (
      Math.abs(new Date(left).getTime() - new Date(right).getTime()) < 60_000
    );
  }

  private hasItemScheduleOrQtyChanges(
    existingItem: IRentalItem,
    itemUpdate: {
      quantity?: number;
      rentalType?: RentalType;
      pickupScheduled?: string | Date;
      returnScheduled?: string | Date;
      recalculateScheduledReturn?: boolean;
      historicalDelivery?: boolean;
      isLoan?: boolean;
      unitId?: string;
    },
  ): boolean {
    if (itemUpdate.unitId !== undefined) {
      const nextUnit = String(itemUpdate.unitId || "").trim();
      const prevUnit = String(existingItem.unitId || "").trim();
      if (nextUnit !== prevUnit) {
        return true;
      }
    }
    if (itemUpdate.quantity !== undefined) {
      const nextQty = Math.max(1, Math.floor(Number(itemUpdate.quantity)));
      if (nextQty !== Number(existingItem.quantity || 1)) {
        return true;
      }
    }
    if (
      itemUpdate.rentalType &&
      itemUpdate.rentalType !== existingItem.rentalType
    ) {
      return true;
    }
    if (
      itemUpdate.isLoan !== undefined &&
      itemUpdate.isLoan === true !== !!existingItem.isLoan
    ) {
      return true;
    }
    if (
      itemUpdate.pickupScheduled &&
      !this.sameScheduleMoment(
        itemUpdate.pickupScheduled,
        existingItem.pickupScheduled,
      )
    ) {
      return true;
    }
    if (
      itemUpdate.returnScheduled !== undefined &&
      !this.sameScheduleMoment(
        itemUpdate.returnScheduled,
        existingItem.returnScheduled,
      )
    ) {
      return true;
    }
    if (itemUpdate.recalculateScheduledReturn === true) {
      return true;
    }
    if (itemUpdate.historicalDelivery !== undefined) {
      return true;
    }
    return false;
  }

  private rentalLineCountSameEquipment(
    rental: IRental,
    itemId: string,
    unitId?: string,
  ): number {
    const id = String(itemId).trim();
    const unit =
      unitId != null && String(unitId).trim() !== ""
        ? String(unitId).trim()
        : undefined;
    return (rental.items || []).filter((i) => {
      const iid =
        typeof i.itemId === "object" && (i.itemId as any)?._id
          ? String((i.itemId as any)._id)
          : String(i.itemId);
      if (iid !== id) return false;
      if (unit !== undefined) return String(i.unitId || "").trim() === unit;
      return !i.unitId;
    }).length;
  }

  /** Atualiza unitId/rentalLineKey nos fechamentos da linha após correção de unidade. */
  private async relinkBillingUnitIdsForRentalLine(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    params: {
      itemId: string;
      oldUnitId: string;
      newUnitId: string;
      oldRentalLineKey: string;
      newRentalLineKey: string;
      lineId?: string;
    },
  ): Promise<void> {
    const billings = await Billing.find({
      companyId,
      rentalId,
      status: { $ne: "cancelled" },
    });
    const lineSuffix =
      params.lineId && params.lineId.trim()
        ? `|${params.lineId.trim()}`
        : "";

    for (const billing of billings) {
      let changed = false;
      for (const bi of billing.items || []) {
        const bid = asIdString(bi.itemId);
        if (bid !== params.itemId) continue;
        const rk = String(bi.rentalLineKey || "").trim();
        const sameKey =
          rk.length > 0 && rk === params.oldRentalLineKey;
        const sameLine = Boolean(lineSuffix && rk.endsWith(lineSuffix));
        const legacySameUnit =
          !lineSuffix &&
          String(bi.unitId || "").trim() === params.oldUnitId;
        if (!sameKey && !sameLine && !legacySameUnit) continue;

        bi.unitId = params.newUnitId;
        if (rk) {
          const parts = rk.split("|");
          if (parts.length >= 2) {
            parts[1] = params.newUnitId;
            bi.rentalLineKey = parts.join("|");
          } else {
            bi.rentalLineKey = params.newRentalLineKey;
          }
        }
        changed = true;
      }
      if (changed) {
        billing.markModified("items");
        await billing.save();
      }
    }
  }

  /**
   * Remove apenas fechamentos em aberto cujos itens batem estritamente com as chaves de linha dadas.
   * Evita apagar todos os sub-fechamentos de um mesmo equipamento quando há devoluções parciais (segmentos diferentes).
   */
  private async removeObsoleteUnpaidBillingsForRentalLineKeys(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    lineKeys: Set<string>,
  ): Promise<void> {
    if (lineKeys.size === 0) return;

    const billings = await Billing.find({
      companyId,
      rentalId,
      status: { $ne: "paid" },
      "items.0": { $exists: true },
    }).select(
      "_id status calculation outstandingAmount paymentHistory chargeId invoiceId items",
    );

    const obsolete = billings.filter((billing) => {
      const rows = billing.items || [];
      if (!rows.length) return false;
      return rows.every((bi: any) => {
        const rk = bi.rentalLineKey ? String(bi.rentalLineKey).trim() : "";
        return rk.length > 0 && lineKeys.has(rk);
      });
    });

    await this.deleteUnpaidBillingDocuments(companyId, obsolete);
  }

  private async deleteUnpaidBillingDocuments(
    companyId: string,
    billings: any[],
  ): Promise<void> {
    const removable = billings.filter((billing) => {
      const hasPayments = (billing.paymentHistory?.length ?? 0) > 0;
      const total = Number(billing.calculation?.total ?? 0);
      const outstanding = Number(billing.outstandingAmount ?? total);
      return !hasPayments && outstanding >= total - 0.01;
    });
    if (!removable.length) return;

    const candidateIds = removable.map((billing) => billing._id);
    const protectedIds = new Set<string>();

    const paidOrPartialCharges = await Charge.find({
      companyId,
      billingIds: { $in: candidateIds },
      $or: [
        { status: { $in: ["paid", "partial"] } },
        { paidAmount: { $gt: 0 } },
        { "payments.0": { $exists: true } },
      ],
    }).select("billingIds");
    for (const charge of paidOrPartialCharges) {
      for (const id of charge.billingIds || []) {
        if (candidateIds.some((candidateId) => String(candidateId) === String(id))) {
          protectedIds.add(String(id));
        }
      }
    }

    const paidInvoices = await Invoice.find({
      companyId,
      billingIds: { $in: candidateIds },
      status: "paid",
    }).select("billingIds");
    for (const invoice of paidInvoices) {
      for (const id of invoice.billingIds || []) {
        if (candidateIds.some((candidateId) => String(candidateId) === String(id))) {
          protectedIds.add(String(id));
        }
      }
    }

    const removableIds = candidateIds.filter((id) => !protectedIds.has(String(id)));
    if (!removableIds.length) return;

    const charges = await Charge.find({
      companyId,
      billingIds: { $in: removableIds },
      status: { $ne: "paid" },
    });
    for (const charge of charges) {
      if ((charge.payments?.length ?? 0) > 0 || Number(charge.paidAmount || 0) > 0) {
        continue;
      }
      const removedTotal = removable
        .filter((billing) =>
          (charge.billingIds || []).some((id: any) => String(id) === String(billing._id)),
        )
        .reduce(
          (acc, billing) =>
            acc + Number(billing.outstandingAmount ?? billing.calculation?.total ?? 0),
          0,
        );
      charge.billingIds = (charge.billingIds || []).filter(
        (id: any) => !removableIds.some((billingId) => String(billingId) === String(id)),
      );
      charge.total = Math.max(0, Number((charge.total - removedTotal).toFixed(2)));
      charge.outstandingAmount = Math.max(
        0,
        Number((charge.outstandingAmount - removedTotal).toFixed(2)),
      );
      if (charge.billingIds.length === 0) {
        await charge.deleteOne();
      } else {
        await charge.save();
      }
    }

    const invoices = await Invoice.find({
      companyId,
      billingIds: { $in: removableIds },
      status: { $ne: "paid" },
    });
    for (const invoice of invoices) {
      invoice.billingIds = (invoice.billingIds || []).filter(
        (id: any) => !removableIds.some((billingId) => String(billingId) === String(id)),
      );
      if (!invoice.billingIds.length) {
        await invoice.deleteOne();
      } else {
        await invoice.save();
      }
    }

    await Billing.deleteMany({
      _id: { $in: removableIds },
      companyId,
    });
  }

  private snapshotReturnedLineForBilling(line: IRentalItem): IRentalItem {
    return {
      itemId: line.itemId,
      unitId: line.unitId,
      lineId: line.lineId,
      quantity: line.quantity,
      rentalType: line.rentalType,
      pickupScheduled: line.pickupScheduled
        ? new Date(line.pickupScheduled)
        : undefined,
      returnScheduled: line.returnScheduled
        ? new Date(line.returnScheduled)
        : undefined,
      returnActual: line.returnActual ? new Date(line.returnActual) : undefined,
      lastBillingDate: line.lastBillingDate
        ? new Date(line.lastBillingDate)
        : undefined,
    } as IRentalItem;
  }

  private collectReturnClosureRentalLineKeys(
    rental: IRental,
    line: IRentalItem,
    closureReturnAt: Date,
  ): string[] {
    const rentalType = (line.rentalType || "daily") as RentalType;
    const keys = new Set<string>(this.rentalLineKeysForCorrectionMatch(line));
    const { periodEndCharge } = this.resolveReturnChargePeriod(
      line,
      rental,
      closureReturnAt,
      rentalType,
    );
    keys.add(
      buildRentalLineKey({
        ...(line as any),
        returnScheduled: periodEndCharge,
        rentalType,
      }),
    );
    return Array.from(keys);
  }

  private billingPeriodBoundMatches(
    stored: Date,
    expected: Date,
    rentalType: RentalType,
  ): boolean {
    if (stored.getTime() === expected.getTime()) {
      return true;
    }
    if (rentalType === "daily") {
      return (
        this.normalizeDate(stored).getTime() === this.normalizeDate(expected).getTime()
      );
    }
    return this.normalizeDate(stored).getTime() === this.normalizeDate(expected).getTime();
  }

  private billingMatchesReturnClosurePeriod(
    billing: any,
    expectedStart: Date,
    expectedEnd: Date,
    rentalType: RentalType,
  ): boolean {
    if (String(billing.rentalType || "daily") !== String(rentalType)) {
      return false;
    }
    return (
      this.billingPeriodBoundMatches(
        new Date(billing.periodStart),
        expectedStart,
        rentalType,
      ) &&
      this.billingPeriodBoundMatches(
        new Date(billing.periodEnd),
        expectedEnd,
        rentalType,
      )
    );
  }

  private billingRowsMatchReturnedItem(
    rows: any[],
    itemId: string,
    unitId?: string,
  ): boolean {
    if (!rows.length) return false;
    return rows.every((bi) => {
      const bid = bi.itemId?.toString?.() || String(bi.itemId);
      if (bid !== itemId) return false;
      if (unitId != null && String(unitId).trim() !== "") {
        return String(bi.unitId || "").trim() === String(unitId).trim();
      }
      return !bi.unitId;
    });
  }

  /**
   * Remove o fechamento gerado na devolução (ou correção anterior) antes de recriar com tipo/data corrigidos.
   * Identifica pelo período exato da devolução (resolveReturnChargePeriod) e pelas chaves rentalLineKey.
   */
  private async deleteReturnClosureBillingsForCorrection(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    rental: IRental,
    lineSnapshot: IRentalItem,
    closureReturnAt: Date,
  ): Promise<void> {
    const oldRentalType = (lineSnapshot.rentalType || "daily") as RentalType;
    const { periodStartRaw, periodEndCharge } = this.resolveReturnChargePeriod(
      lineSnapshot,
      rental,
      closureReturnAt,
      oldRentalType,
    );
    const expectedStart =
      oldRentalType === "daily"
        ? periodStartRaw
        : this.normalizeDate(periodStartRaw);
    const expectedEnd =
      oldRentalType === "daily"
        ? periodEndCharge
        : this.normalizeDate(periodEndCharge);

    const closureKeys = new Set(
      this.collectReturnClosureRentalLineKeys(rental, lineSnapshot, closureReturnAt),
    );
    const itemId = asIdString(lineSnapshot.itemId);
    const unitId =
      lineSnapshot.unitId != null && String(lineSnapshot.unitId).trim() !== ""
        ? String(lineSnapshot.unitId).trim()
        : undefined;
    const lineId =
      typeof lineSnapshot.lineId === "string" && lineSnapshot.lineId.trim().length > 0
        ? lineSnapshot.lineId.trim()
        : "";

    const billings = await Billing.find({
      companyId,
      rentalId,
      status: { $nin: ["paid", "cancelled"] },
      "items.itemId": lineSnapshot.itemId,
      ...(unitId ? { "items.unitId": unitId } : {}),
    }).select(
      "_id status rentalType periodStart periodEnd notes items calculation outstandingAmount paymentHistory chargeId invoiceId",
    );

    const candidates = billings.filter((billing) => {
      const rows = billing.items || [];
      if (!this.billingRowsMatchReturnedItem(rows, itemId, unitId)) {
        return false;
      }

      const rowKey = String(rows[0]?.rentalLineKey || "").trim();
      if (rowKey && closureKeys.has(rowKey)) {
        return true;
      }
      if (lineId && rowKey.endsWith(`|${lineId}`)) {
        return true;
      }

      if (
        this.billingMatchesReturnClosurePeriod(
          billing,
          expectedStart,
          expectedEnd,
          oldRentalType,
        )
      ) {
        return true;
      }

      return rows.some((bi) =>
        this.matchesBillingItemForReturnCorrection(
          bi,
          billing,
          lineSnapshot,
          Array.from(closureKeys),
        ),
      );
    });

    if (candidates.length) {
      await this.deleteUnpaidBillingDocuments(companyId, candidates);
    }
  }

  private rentalLineKeysForCorrectionMatch(line: IRentalItem): string[] {
    const keys = new Set<string>();
    keys.add(buildRentalLineKey(line as any));
    if (line.returnActual) {
      keys.add(
        buildRentalLineKey({
          ...(line as any),
          returnScheduled: line.returnActual,
        }),
      );
    }
    if (line.returnScheduled) {
      keys.add(
        buildRentalLineKey({
          ...(line as any),
          returnScheduled: line.returnScheduled,
        }),
      );
    }
    return Array.from(keys);
  }

  /** Fechamento da devolução anterior (ex.: tipo quinzenal → mensal na correção). */
  private matchesBillingItemForReturnCorrection(
    bi: any,
    billing: any,
    lineBefore: IRentalItem,
    matchKeys: readonly string[],
  ): boolean {
    const rowKey =
      typeof bi?.rentalLineKey === "string" ? bi.rentalLineKey.trim() : "";
    if (rowKey && matchKeys.includes(rowKey)) {
      return true;
    }

    const lineId =
      typeof lineBefore.lineId === "string" && lineBefore.lineId.trim().length > 0
        ? lineBefore.lineId.trim()
        : "";
    if (lineId && rowKey.endsWith(`|${lineId}`)) {
      return true;
    }

    const primaryKey = matchKeys[0] || "";
    const oldParts = primaryKey.split("|");
    const rowParts = rowKey.split("|");
    if (
      rowKey &&
      oldParts.length >= 5 &&
      rowParts.length >= 5 &&
      oldParts[0] === rowParts[0] &&
      oldParts[1] === rowParts[1] &&
      oldParts[3] === rowParts[3] &&
      oldParts[4] === rowParts[4]
    ) {
      return true;
    }

    const oldType = String(lineBefore.rentalType || "daily");
    if (String(billing.rentalType || "daily") !== oldType) {
      return false;
    }

    const oldReturn = lineBefore.returnActual
      ? this.normalizeDate(new Date(lineBefore.returnActual))
      : lineBefore.returnScheduled
        ? this.normalizeDate(new Date(lineBefore.returnScheduled))
        : null;
    if (!oldReturn) {
      return false;
    }

    return (
      this.normalizeDate(new Date(billing.periodEnd)).getTime() === oldReturn.getTime()
    );
  }

  /**
   * Remove fechamentos não pagos que cobrem apenas a mesma linha (item/unit) e sobrepõem a janela,
   * evitando fechamentos com quantidade/períodos obsoletos após devolução parcial.
   * Quando openSegmentRentalLineKey é informado (buildRentalLineKey do item em aberto),
   * apenas fechamentos com o mesmo campo rentalLineKey do item são removidos — preservando
   * fechamentos de segmentos já devolvidos (nova devolução parcial não deve apagar a anterior).
   * Fechamentos com vários equipamentos são ignorados.
   * returnCorrectionLineBefore relaxa a chave ao corrigir tipo/data da devolução.
   */
  private async deleteUnpaidBillingsOverlappingItemWindow(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    itemId: any,
    unitId: string | undefined,
    windowStart: Date,
    windowEnd: Date,
    openSegmentRentalLineKey?: string,
    returnCorrectionLineBefore?: IRentalItem,
  ): Promise<void> {
    const winStart = this.normalizeDate(windowStart);
    const winEnd = this.normalizeDate(windowEnd);
    const idStr = itemId?.toString?.() || String(itemId);

    const billings = await Billing.find({
      companyId,
      rentalId,
      status: { $nin: ["paid", "cancelled"] },
      "items.0": { $exists: true },
    }).select(
      "_id status calculation outstandingAmount paymentHistory chargeId invoiceId periodStart periodEnd items",
    );

    const overlappingSameLineOnly = billings.filter((billing) => {
      const bs = this.normalizeDate(new Date(billing.periodStart));
      const be = this.normalizeDate(new Date(billing.periodEnd));
      if (bs.getTime() > winEnd.getTime() || be.getTime() < winStart.getTime()) {
        return false;
      }

      const itemsArr = billing.items || [];
      if (itemsArr.length === 0) return false;

      return itemsArr.every((bi: any) => {
        const bid = bi.itemId?.toString?.() || String(bi.itemId);
        if (bid !== idStr) return false;
        if (unitId != null && String(unitId).trim() !== "") {
          if (bi.unitId !== unitId) return false;
        } else if (bi.unitId) {
          return false;
        }
        if (returnCorrectionLineBefore) {
          const matchKeys = this.rentalLineKeysForCorrectionMatch(
            returnCorrectionLineBefore,
          );
          return this.matchesBillingItemForReturnCorrection(
            bi,
            billing,
            returnCorrectionLineBefore,
            matchKeys,
          );
        }
        const scopedKey =
          typeof openSegmentRentalLineKey === "string" &&
          openSegmentRentalLineKey.trim().length > 0
            ? openSegmentRentalLineKey.trim()
            : undefined;
        if (scopedKey) {
          const rowKey =
            typeof bi?.rentalLineKey === "string" && bi.rentalLineKey.trim().length > 0
              ? bi.rentalLineKey.trim()
              : "";
          if (!rowKey) {
            return false;
          }
          if (rowKey !== scopedKey) {
            return false;
          }
        }
        return true;
      });
    });

    if (overlappingSameLineOnly.length) {
      await this.deleteUnpaidBillingDocuments(companyId, overlappingSameLineOnly);
    }
  }

  private async removeObsoleteUnpaidBillingsForCurrentRental(
    companyId: string,
    rental: IRental,
  ): Promise<void> {
    const validLineKeys = new Map<string, RentalType>();
    const validFallbackKeys = new Set<string>();
    const returnedLineCutoffs = new Map<string, Date>();
    const returnedFallbackCutoffs = new Map<string, Date>();

    for (const item of rental.items || []) {
      const rentalType = item.rentalType || "daily";
      const lineKey = buildRentalLineKey(item as any);
      validLineKeys.set(lineKey, rentalType);
      const itemId = item.itemId?.toString?.() || String(item.itemId);
      const unitId = item.unitId ? String(item.unitId) : "no-unit";
      const fallbackKey = `${itemId}|${unitId}|${rentalType}`;
      validFallbackKeys.add(fallbackKey);

      if (item.returnActual) {
        const cutoff = this.normalizeDate(item.returnActual);
        returnedLineCutoffs.set(lineKey, cutoff);
        returnedFallbackCutoffs.set(fallbackKey, cutoff);
      }
    }

    const billings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $ne: "paid" },
      "items.0": { $exists: true },
    }).select(
      "_id rentalType periodStart periodEnd status items calculation outstandingAmount paymentHistory chargeId invoiceId",
    );

    const obsolete = billings.filter((billing) => {
      const items = billing.items || [];
      if (!items.length) return false;

      const hasCurrentRentalLine = items.some((billingItem: any) => {
        const lineKey = billingItem.rentalLineKey
          ? String(billingItem.rentalLineKey)
          : "";
        if (lineKey) {
          const currentType = validLineKeys.get(lineKey);
          return currentType === billing.rentalType;
        }

        const itemId =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const unitId = billingItem.unitId ? String(billingItem.unitId) : "no-unit";
        const fallbackKey = `${itemId}|${unitId}|${billing.rentalType || "daily"}`;
        return validFallbackKeys.has(fallbackKey);
      });

      if (!hasCurrentRentalLine) return true;

      const periodStart = this.normalizeDate(billing.periodStart);
      return items.every((billingItem: any) => {
        const lineKey = billingItem.rentalLineKey
          ? String(billingItem.rentalLineKey)
          : "";
        if (lineKey) {
          const cutoff = returnedLineCutoffs.get(lineKey);
          return cutoff ? periodStart.getTime() >= cutoff.getTime() : false;
        }

        const itemId =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const unitId = billingItem.unitId ? String(billingItem.unitId) : "no-unit";
        const fallbackKey = `${itemId}|${unitId}|${billing.rentalType || "daily"}`;
        const cutoff = returnedFallbackCutoffs.get(fallbackKey);
        return cutoff ? periodStart.getTime() >= cutoff.getTime() : false;
      });
    });

    const findRentalItemForBillingRow = (billingItem: any): IRentalItem | undefined => {
      const lineKeyRaw = billingItem.rentalLineKey
        ? String(billingItem.rentalLineKey).trim()
        : "";
      const itemIdBid =
        billingItem.itemId?.toString?.() || String(billingItem.itemId);
      const uidBid =
        billingItem.unitId != null && String(billingItem.unitId).trim() !== ""
          ? String(billingItem.unitId)
          : undefined;
      if (lineKeyRaw) {
        for (const ri of rental.items || []) {
          if (
            lineKeyRaw === String(buildRentalLineKey(ri as any)).trim()
          ) {
            return ri as IRentalItem;
          }
        }
      }
      for (const ri of rental.items || []) {
        const iid =
          typeof ri.itemId === "object" && (ri.itemId as any)?._id
            ? String((ri.itemId as any)._id)
            : String(ri.itemId);
        if (iid !== itemIdBid) continue;
        if (uidBid !== undefined) {
          if (String(ri.unitId || "") === uidBid) return ri as IRentalItem;
        } else if (!ri.unitId) {
          return ri as IRentalItem;
        }
      }
      if (rental.items?.length === 1) return rental.items[0] as IRentalItem;
      return undefined;
    };

    /** Mesma cohorte para comparar períodos compatíveis (tipo + linha de aluguel). */
    const cohortKeyForBillingDoc = (
      billingDoc: (typeof billings)[0],
      firstRow: any,
    ): string => {
      const lk = firstRow?.rentalLineKey
        ? String(firstRow.rentalLineKey).trim()
        : "";
      const rt = String(billingDoc.rentalType || "daily");
      if (lk) return `${rt}|rk:${lk}`;
      const itemId =
        firstRow?.itemId?.toString?.() || String(firstRow?.itemId || "");
      const uid =
        firstRow?.unitId != null && String(firstRow.unitId).trim() !== ""
          ? String(firstRow.unitId)
          : "no-unit";
      return `${rt}|fb:${itemId}|${uid}`;
    };

    /** Início depois da devolução contratual; ou dois rascunhos/fatias sobrepostos (ex.: bom 01/05 e fantasma 12/05). */
    const overlapsInclusiveBilling = (
      aStart: Date,
      aEnd: Date,
      bStart: Date,
      bEnd: Date,
    ): boolean =>
      aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();

    const obsoleteDraftIds = new Set<string>();

    for (const billingDoc of billings) {
      if (billingDoc.status !== "draft") continue;
      const rowsDoc = billingDoc.items || [];
      if (!rowsDoc.length) continue;
      const firstRow = rowsDoc[0];

      let startsAfterScheduledReturn = false;
      for (const row of rowsDoc) {
        const ri = findRentalItemForBillingRow(row);
        if (!ri) continue;
        const cap = this.getContractualReturnForDraft(ri, rental);
        /** Só elimina rascunho “após o contrato” quando a linha já tem devolução real; em atraso o previsto segue útil. */
        if (
          cap &&
          ri.returnActual &&
          this.normalizeDate(billingDoc.periodStart).getTime() > cap.getTime()
        ) {
          startsAfterScheduledReturn = true;
          break;
        }
      }
      if (startsAfterScheduledReturn) {
        obsoleteDraftIds.add(String(billingDoc._id));
        continue;
      }

      const cohort = cohortKeyForBillingDoc(billingDoc, firstRow);
      const dPs = this.normalizeDate(billingDoc.periodStart);
      const dPe = this.normalizeDate(billingDoc.periodEnd);

      let overlapEarlier = false;
      for (const other of billings) {
        if (String(other._id) === String(billingDoc._id)) continue;
        if (other.status === "paid" || other.status === "cancelled") continue;
        const otherRows = other.items || [];
        if (!otherRows.length) continue;
        if (cohortKeyForBillingDoc(other, otherRows[0]) !== cohort) continue;

        const oPs = this.normalizeDate(other.periodStart);
        const oPe = this.normalizeDate(other.periodEnd);

        /** Rascunho “fantasma” começa depois mas ainda atravessa o mesmo período coberto por linha válida já faturável. */
        if (dPs.getTime() <= oPs.getTime()) continue;
        if (!overlapsInclusiveBilling(dPs, dPe, oPs, oPe)) continue;
        overlapEarlier = true;
        break;
      }
      if (overlapEarlier) {
        obsoleteDraftIds.add(String(billingDoc._id));
      }
    }

    const isReturnClosureBilling = (billing: (typeof billings)[0]): boolean => {
      const periodEndNorm = this.normalizeDate(billing.periodEnd);
      const rows = billing.items || [];
      if (!rows.length) return false;

      return rows.some((billingItem: any) => {
        const lineKey = billingItem.rentalLineKey
          ? String(billingItem.rentalLineKey)
          : "";
        if (lineKey) {
          const cutoff = returnedLineCutoffs.get(lineKey);
          if (cutoff && periodEndNorm.getTime() === cutoff.getTime()) {
            return true;
          }
        }

        const itemIdBid =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const uidBid =
          billingItem.unitId != null && String(billingItem.unitId).trim() !== ""
            ? String(billingItem.unitId).trim()
            : undefined;

        for (const ri of rental.items || []) {
          if (!ri.returnActual) continue;
          const iid =
            typeof ri.itemId === "object" && (ri.itemId as any)?._id
              ? String((ri.itemId as any)._id)
              : String(ri.itemId);
          if (iid !== itemIdBid) continue;
          if (uidBid !== undefined) {
            if (String(ri.unitId || "").trim() !== uidBid) continue;
          } else if (ri.unitId) {
            continue;
          }
          const cutoff = this.normalizeDate(ri.returnActual);
          if (periodEndNorm.getTime() === cutoff.getTime()) {
            return true;
          }
        }
        return false;
      });
    };

    const isStaleTypedReturnClosure = (
      billing: (typeof billings)[0],
    ): boolean => {
      if (!isReturnClosureBilling(billing)) return false;
      const rows = billing.items || [];
      for (const billingItem of rows) {
        const itemIdBid =
          billingItem.itemId?.toString?.() || String(billingItem.itemId);
        const uidBid = billingItem.unitId
          ? String(billingItem.unitId)
          : "no-unit";
        for (const ri of rental.items || []) {
          if (!ri.returnActual) continue;
          const riId = asIdString(ri.itemId);
          if (riId !== itemIdBid) continue;
          const riUid = ri.unitId ? String(ri.unitId) : "no-unit";
          if (riUid !== uidBid) continue;
          if (
            String(billing.rentalType || "daily") ===
            String(ri.rentalType || "daily")
          ) {
            continue;
          }
          const returnEnd = this.normalizeDate(ri.returnActual);
          const periodEnd = this.normalizeDate(billing.periodEnd);
          if (periodEnd.getTime() === returnEnd.getTime()) {
            return true;
          }
        }
      }
      return false;
    };

    const obsoleteCombined = billings.filter(
      (billing) =>
        isStaleTypedReturnClosure(billing) ||
        (!isReturnClosureBilling(billing) &&
          (obsolete.some((b) => String(b._id) === String(billing._id)) ||
            obsoleteDraftIds.has(String(billing._id)))),
    );

    await this.deleteUnpaidBillingDocuments(companyId, obsoleteCombined);
  }

  private async getLatestLockedItemBillingEnd(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    itemId: any,
    unitId?: string,
    rentalLineKey?: string | null,
  ): Promise<Date | undefined> {
    const rk =
      typeof rentalLineKey === "string" && rentalLineKey.trim().length > 0
        ? rentalLineKey.trim()
        : undefined;

    const filter: Record<string, unknown> = {
      companyId,
      rentalId,
      $or: [
        { status: "paid" },
        { "paymentHistory.0": { $exists: true } },
      ],
    };

    if (rk) {
      const em: Record<string, unknown> = {
        itemId,
        rentalLineKey: rk,
      };
      if (unitId != null && String(unitId).trim() !== "") {
        em.unitId = unitId;
      }
      filter.items = { $elemMatch: em };
    } else {
      filter["items.itemId"] = itemId;
      if (unitId) {
        filter["items.unitId"] = unitId;
      }
    }

    const billing = await Billing.findOne(filter)
      .sort({ periodEnd: -1 })
      .select("periodEnd")
      .lean();
    return billing?.periodEnd ? this.normalizeDate(billing.periodEnd) : undefined;
  }

  private getPricingEndDate(startDate: Date, rentalType: RentalType): Date {
    const normalizedStart = this.normalizeDate(startDate);
    switch (rentalType) {
      case "daily":
        return this.addDays(normalizedStart, 1);
      case "weekly":
      case "biweekly":
      case "monthly":
        return this.getPeriodEnd(normalizedStart, rentalType);
      default:
        return this.addDays(normalizedStart, 1);
    }
  }

  /**
   * Devolução prevista só da linha do item quando o contrato tem mais de um equipamento
   * (cada um pode ter data diferente). Cabeçalho `rental.dates.returnScheduled` só vale como fallback
   * em contrato de item único — evita usar ex. 19/05 do andaime na linha da bomba (26/04).
   */
  private getScheduledReturnNorm(
    item: IRentalItem,
    rental: IRental,
  ): Date | undefined {
    if (item.returnScheduled) {
      return this.normalizeDate(new Date(item.returnScheduled));
    }
    const multi = (rental.items?.length ?? 0) > 1;
    if (!multi && rental.dates?.returnScheduled) {
      return this.normalizeDate(new Date(rental.dates.returnScheduled));
    }
    return undefined;
  }

  /**
   * Limite temporal para fechamentos automáticos aprovados nesta execução: linha em aberto → até hoje
   * (o teto por equipamento/devolução prevista entra em getScheduledReturnNorm / getContractualReturnForDraft).
   */
  private getBillingHorizonForItem(
    item: IRentalItem,
    _rental: IRental,
    today: Date,
  ): Date {
    const t = this.normalizeDate(today);
    if (item.returnActual) {
      const a = this.normalizeDate(item.returnActual);
      return a.getTime() <= t.getTime() ? a : t;
    }
    return t;
  }

  /** Limite superior para rascunho de próximo período (null = sem data de devolução prevista). */
  private getContractualReturnForDraft(
    item: IRentalItem,
    rental: IRental,
  ): Date | null {
    if (item.returnActual) {
      return this.normalizeDate(item.returnActual);
    }
    const s = this.getScheduledReturnNorm(item, rental);
    if (s) {
      return s;
    }
    if (item.retroactiveOpenBilling) {
      return null;
    }
    return null;
  }

  /**
   * Devolução prevista no passado: ou marca entrega histórica (returnActual) ou cobrança em aberto até hoje.
   */
  private finalizeRetroactiveFlagsForItem(
    item: IRentalItem,
    historicalDelivery: boolean | undefined,
    today: Date,
  ) {
    const t = this.normalizeDate(today);
    const ret = item.returnScheduled
      ? this.normalizeDate(item.returnScheduled)
      : null;

    if (!ret || ret.getTime() >= t.getTime()) {
      item.retroactiveOpenBilling = false;
      return;
    }

    if (item.returnActual) {
      item.retroactiveOpenBilling = false;
      return;
    }

    if (historicalDelivery === true) {
      item.returnActual = ret;
      item.retroactiveOpenBilling = false;
      return;
    }

    if (historicalDelivery === false) {
      item.retroactiveOpenBilling = true;
      return;
    }

    item.retroactiveOpenBilling = true;
  }

  private getPeriodEnd(startDate: Date, rentalType: RentalType): Date {
    return getPeriodEndInclusive(startDate, rentalType);
  }

  /**
   * Após devolução parcial, o saldo mantém a mesma retirada civil mas a cobrança deve
   * continuar do dia após o fim do trecho já devolvido (linhas irmãs com returnActual).
   */
  private findPriorPartialReturnBillingEnd(
    items: IRentalItem[] | undefined,
    targetItem: IRentalItem,
  ): Date | undefined {
    if (!items?.length || targetItem.returnActual) {
      return undefined;
    }
    const targetPickup = targetItem.pickupScheduled;
    if (!targetPickup) {
      return undefined;
    }
    const pickupNorm = this.normalizeDate(new Date(targetPickup));
    const itemId = String(targetItem.itemId);
    const unitId = targetItem.unitId ? String(targetItem.unitId) : null;
    const targetLineId =
      typeof targetItem.lineId === "string" ? targetItem.lineId : "";

    let maxEnd: Date | undefined;
    for (const row of items) {
      if (String(row.itemId) !== itemId) {
        continue;
      }
      const rowUnitId = row.unitId ? String(row.unitId) : null;
      if (unitId !== rowUnitId) {
        continue;
      }
      if (!row.returnActual || !row.lastBillingDate) {
        continue;
      }
      const rowLineId = typeof row.lineId === "string" ? row.lineId : "";
      if (rowLineId && rowLineId === targetLineId) {
        continue;
      }
      const rowPickup = row.pickupScheduled;
      if (!rowPickup) {
        continue;
      }
      if (
        this.normalizeDate(new Date(rowPickup)).getTime() !== pickupNorm.getTime()
      ) {
        continue;
      }
      const end = new Date(row.lastBillingDate);
      if (!maxEnd || end.getTime() > maxEnd.getTime()) {
        maxEnd = end;
      }
    }
    return maxEnd;
  }

  /**
   * Janela de cobrança na devolução: do dia após o último fechamento (ou retirada) até a data de cálculo.
   * Quando o próximo início técnico ficaria após a devolução, reancora na retirada.
   */
  private resolveReturnChargePeriod(
    targetItem: IRentalItem,
    rental: { dates?: { pickupScheduled?: Date }; items?: IRentalItem[] },
    returnAt: Date,
    billingRt: RentalType,
  ): { periodStartRaw: Date; periodEndCharge: Date } {
    const pickupSource =
      targetItem.pickupScheduled ?? rental.dates?.pickupScheduled;
    if (!pickupSource) {
      throw badRequest("Data de retirada não encontrada para calcular o período.");
    }
    const pickupPure = new Date(pickupSource);
    const pickupNorm = this.normalizeDate(pickupPure);
    const periodEndCharge =
      billingRt === "daily" ? new Date(returnAt) : this.normalizeDate(returnAt);

    const priorPartialEnd = this.findPriorPartialReturnBillingEnd(
      rental.items,
      targetItem,
    );

    let periodStartRaw: Date;
    if (targetItem.lastBillingDate) {
      const lastNorm = this.normalizeDate(new Date(targetItem.lastBillingDate));
      periodStartRaw = this.addDays(lastNorm, 1);
      if (priorPartialEnd) {
        const priorNorm = this.normalizeDate(priorPartialEnd);
        if (lastNorm.getTime() < priorNorm.getTime()) {
          periodStartRaw = this.addDays(priorNorm, 1);
        }
      }
    } else if (priorPartialEnd) {
      periodStartRaw = this.addDays(this.normalizeDate(priorPartialEnd), 1);
    } else {
      periodStartRaw = billingRt === "daily" ? pickupPure : pickupNorm;
    }

    if (periodStartRaw.getTime() > periodEndCharge.getTime()) {
      periodStartRaw = billingRt === "daily" ? pickupPure : pickupNorm;
    }
    if (periodStartRaw.getTime() < pickupNorm.getTime()) {
      periodStartRaw = billingRt === "daily" ? pickupPure : pickupNorm;
    }

    return { periodStartRaw, periodEndCharge };
  }

  /** Permite fechar no mesmo dia civil (ex.: último dia após fechamento até 15/06). */
  private assertReturnChargePeriodValid(
    periodStartRaw: Date,
    periodEndCharge: Date,
    billingRt: RentalType,
  ): void {
    const usesClockDaily =
      billingRt === "daily" &&
      (!isLocalMidnight(periodStartRaw) || !isLocalMidnight(periodEndCharge));

    if (usesClockDaily) {
      if (periodEndCharge.getTime() < periodStartRaw.getTime()) {
        throw badRequest(
          "Data de devolução deve ser posterior ao início do período de cobrança",
        );
      }
      return;
    }

    const startDay = this.normalizeDate(periodStartRaw);
    const endDay = this.normalizeDate(periodEndCharge);
    if (endDay.getTime() < startDay.getTime()) {
      throw badRequest(
        "Data de devolução deve ser posterior ao início do período de cobrança",
      );
    }
  }

  private addPeriod(date: Date, rentalType: RentalType): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + this.getPeriodLengthDays(rentalType));
    return next;
  }

  private rentalTypeLabelForError(rentalType: RentalType): string {
    const labels: Record<RentalType, string> = {
      daily: "diário",
      weekly: "semanal",
      biweekly: "quinzenal",
      monthly: "mensal",
    };
    return labels[rentalType];
  }

  private getConfiguredRateForRentalType(
    inventoryItem: any,
    rentalType: RentalType,
  ): number {
    const rates: Record<RentalType, number> = {
      daily: Number(inventoryItem.pricing?.dailyRate ?? 0),
      weekly: Number(inventoryItem.pricing?.weeklyRate ?? 0),
      biweekly: Number(inventoryItem.pricing?.biweeklyRate ?? 0),
      monthly: Number(inventoryItem.pricing?.monthlyRate ?? 0),
    };
    return Math.max(0, rates[rentalType] || 0);
  }

  /**
   * Preços efetivos para linhas do aluguel: mantém valores cadastrados e,
   * quando há diária mas falta valor do período solicitado (ex.: só diária no
   * cadastro e contrato quinzenal), deriva período proporcional aos padrões
   * já usados no domínio (7 / 15 / 30 dias).
   */
  private getEffectivePricingForRentalLines(inventoryItem: any): {
    dailyRate: number;
    weeklyRate: number;
    biweeklyRate: number;
    monthlyRate: number;
  } {
    return effectivePricingPeriods(inventoryItem?.pricing);
  }

  private assertConfiguredRateForRentalType(
    inventoryItem: any,
    rentalType: RentalType,
  ): void {
    const p = inventoryItem.pricing || {};
    if (rentalType === "biweekly") {
      const rawBiweekly = Math.max(0, Number(p.biweeklyRate ?? 0));
      if (rawBiweekly <= 0) {
        throw badRequest(
          `Não há valor quinzenal cadastrado para o equipamento "${inventoryItem.name}". Informe o valor na criação do aluguel ou cadastre no item.`,
        );
      }
      return;
    }

    const eff = this.getEffectivePricingForRentalLines(inventoryItem);
    const rate =
      rentalType === "daily"
        ? eff.dailyRate
        : rentalType === "weekly"
          ? eff.weeklyRate
          : eff.monthlyRate;

    const raw = Math.max(
      0,
      rentalType === "daily"
        ? Number(p.dailyRate ?? 0)
        : rentalType === "weekly"
          ? Number(p.weeklyRate ?? 0)
          : Number(p.monthlyRate ?? 0),
    );

    if (rate <= 0) {
      const label =
        rentalType !== "daily" && raw <= 0 && eff.dailyRate <= 0
          ? `${this.rentalTypeLabelForError(rentalType)} ou a diária`
          : `${this.rentalTypeLabelForError(rentalType)}`;
      throw badRequest(
        `Cadastre o valor ${label} do item "${inventoryItem.name}" ou informe na criação do aluguel.`,
      );
    }
  }

  private async savePeriodRateToInventory(
    companyId: string,
    itemId: string,
    rentalType: RentalType,
    rate: number,
  ): Promise<void> {
    const fieldMap: Record<RentalType, string> = {
      daily: "pricing.dailyRate",
      weekly: "pricing.weeklyRate",
      biweekly: "pricing.biweeklyRate",
      monthly: "pricing.monthlyRate",
    };
    await Item.updateOne(
      { _id: itemId, companyId },
      { $set: { [fieldMap[rentalType]]: Number(rate.toFixed(2)) } },
    );
  }

  private markRentalItemsAndPricingModified(rental: IRental): void {
    if (typeof rental.markModified === "function") {
      rental.markModified("items");
      rental.markModified("pricing");
    }
  }

  private async applyItemPeriodRatePatch(
    companyId: string,
    user: { role: RoleType },
    inventoryItemId: string,
    rentalItem: IRentalItem,
    itemUpdate: {
      periodRateOverride?: number;
      saveRateToItem?: boolean;
    },
    rentalType: RentalType,
  ): Promise<void> {
    if (itemUpdate.periodRateOverride === undefined) {
      return;
    }

    const periodRateOverride = Math.max(
      0,
      Number(itemUpdate.periodRateOverride ?? 0),
    );

    if (itemUpdate.saveRateToItem === true) {
      if (!canApplyDiscount(user.role)) {
        throw forbidden(
          "Somente o administrador pode atualizar o cadastro do equipamento com o novo valor.",
        );
      }
      if (periodRateOverride <= 0) {
        throw badRequest(
          "Informe o valor do período para salvar no cadastro do equipamento.",
        );
      }
      await this.savePeriodRateToInventory(
        companyId,
        inventoryItemId,
        rentalType,
        periodRateOverride,
      );
    }

    if (periodRateOverride > 0) {
      rentalItem.periodRateOverride = periodRateOverride;
    } else {
      rentalItem.periodRateOverride = undefined;
    }

    const inventoryItem = await Item.findOne({
      _id: inventoryItemId,
      companyId,
    }).lean();
    if (!inventoryItem || this.isLoanLine(rentalItem)) {
      return;
    }

    const pickupScheduled = rentalItem.pickupScheduled;
    if (!pickupScheduled) {
      return;
    }

    const pricingEndDate =
      rentalItem.returnScheduled ||
      this.getPricingEndDate(pickupScheduled, rentalType);
    const pricingForLine =
      periodRateOverride > 0
        ? applyPeriodRateOverride(
            inventoryItem.pricing,
            rentalType,
            periodRateOverride,
          )
        : inventoryItem.pricing;
    const price = this.calculateRentalPrice(
      pricingForLine,
      pickupScheduled,
      pricingEndDate,
      rentalType,
      periodRateOverride > 0 ? periodRateOverride : undefined,
    );
    rentalItem.unitPrice = price;
    rentalItem.subtotal = price * Number(rentalItem.quantity || 1);
  }

  private calculateRentalPrice(
    inventoryPricing: {
      dailyRate?: number;
      weeklyRate?: number;
      biweeklyRate?: number;
      monthlyRate?: number;
    } | undefined,
    startDate: Date,
    endDate: Date,
    rentalType: RentalType | undefined,
    periodRateOverride?: number,
  ): number {
    if (!rentalType) {
      throw badRequest("RentalType é obrigatório para cálculo do aluguel");
    }

    const pricing =
      periodRateOverride && periodRateOverride > 0
        ? applyPeriodRateOverride(
            inventoryPricing,
            rentalType,
            periodRateOverride,
          )
        : inventoryPricing;

    const period = calculateBillingPeriod(startDate, endDate, rentalType);
    return calculateRentalLineAmount(pricing, rentalType, period).amount;
  }

  /**
   * Calculate late fee
   */
  private calculateLateFee(
    returnScheduled: Date,
    returnActual: Date,
    dailyRate: number,
    quantity: number,
  ): number {
    if (returnActual <= returnScheduled) {
      return 0;
    }

    const daysLate = Math.ceil(
      (returnActual.getTime() - returnScheduled.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    // Late fee is typically 1.5x the daily rate per day
    return daysLate * dailyRate * 1.5 * quantity;
  }

  /**
   *
   * Create retalNumber
   */
  async generateRentalNumber(companyId: string): Promise<string> {
    const RentalModel = mongoose.model<IRental>("Rental");
    const count = await RentalModel.countDocuments({ companyId });
    const rentalNumber = `ALGUEL-${companyId.toString().slice(-6)}-${String(count + 1).padStart(6, "0")}`; //pega os 6 ulimos dígitos do id da empresa - contador
    return rentalNumber;
  }

  //createRental revisado
  async createRental(
    companyId: string,
    data: any,
    userId: string,
  ): Promise<IRental> {
    const rentalNumber = await this.generateRentalNumber(companyId);
    const user = await User.findById(userId);
    if (!user) throw notFound("Usuário não encontrado");

    if (data.pricing?.discount && !canApplyDiscount(user.role as RoleType)) {
      throw forbidden("Somente o admin pode aplicar desconto");
    }

    const customer = await Customer.findOne({ _id: data.customerId, companyId });
    if (!customer) throw notFound("Cliente não encontrado");

    const adminConfirmedNoCpf =
      data.confirmNoCpf === true &&
      canBypassCustomerCpfAsAdmin(user.role as RoleType);

    const customerCpf = adminConfirmedNoCpf
      ? this.normalizeCpf(data.customerCpf)
      : this.normalizeCpf(data.customerCpf || customer.cpfCnpj);
    const hasValidCustomerCpf =
      !adminConfirmedNoCpf && this.isValidCpf(customerCpf);
    let createdWithoutCustomerCpf = false;

    if (hasValidCustomerCpf) {
      const duplicateCpfCustomer = await Customer.findOne({
        _id: { $ne: customer._id },
        companyId,
        cpfCnpj: customerCpf,
      });
      if (duplicateCpfCustomer) {
        throw conflict("CPF/CNPJ já cadastrado para outro cliente");
      }

      if (this.normalizeCpf(customer.cpfCnpj) !== customerCpf) {
        customer.cpfCnpj = customerCpf;
        customer.validated = {
          ...(customer.validated || {}),
          isValidated: false,
        };
        await customer.save();
      }
    } else {
      const isAdmin = canBypassCustomerCpfAsAdmin(user.role as RoleType);
      if (isAdmin) {
        if (data.confirmNoCpf !== true) {
          throw badRequest(
            "Confirme que deseja criar o aluguel sem CPF/CNPJ do cliente.",
          );
        }
      } else {
        if (!data.cpfBypassTokenId || !data.cpfBypassCode) {
          throw badRequest(
            "Solicite o código de autorização do administrador para alugar sem CPF/CNPJ.",
          );
        }
        await rentalCpfBypassService.consumeBypassToken(
          companyId,
          data.customerId,
          userId,
          data.cpfBypassTokenId,
          data.cpfBypassCode,
        );
      }
      createdWithoutCustomerCpf = true;
    }

    //Função para pegar tipo pelo item
    const getRentalTypeFromItem = (item: any): RentalType => {
      if (item.pricing?.monthlyRate) return "monthly";
      if (item.pricing?.biweeklyRate) return "biweekly";
      if (item.pricing?.weeklyRate) return "weekly";
      return "daily";
    };

    // Validar disponibilidade e preço do tipo escolhido
    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) throw notFound(`Item ${item.itemId} não encontrado`);

      const rentalType: RentalType =
        item.rentalType &&
        ["daily", "weekly", "biweekly", "monthly"].includes(item.rentalType)
          ? item.rentalType
          : getRentalTypeFromItem(inventoryItem);
      const isLoan = item.isLoan === true;
      const periodRateOverride = Math.max(
        0,
        Number(item.periodRateOverride ?? 0),
      );
      if (!isLoan && periodRateOverride <= 0) {
        this.assertConfiguredRateForRentalType(inventoryItem, rentalType);
      }
      if (item.saveRateToItem === true) {
        if (!canApplyDiscount(user.role as RoleType)) {
          throw forbidden(
            "Somente o administrador pode atualizar o cadastro do equipamento com o novo valor.",
          );
        }
        if (periodRateOverride <= 0) {
          throw badRequest(
            "Informe o valor do período para salvar no cadastro do equipamento.",
          );
        }
      }

      if (inventoryItem.trackingType === "unit") {
        if (item.partnerSupply?.quantity) {
          throw badRequest(
            `Item unitário "${inventoryItem.name}" não pode usar equipamento de parceiro nesta versão.`,
          );
        }
        if (!item.unitId)
          throw badRequest(`Item ${inventoryItem.name} precisa de unitId`);

        const unit = inventoryItem.units?.find((u) => u.unitId === item.unitId);
        if (!unit || unit.status !== "available") {
          const availableUnits =
            inventoryItem.units
              ?.filter((u) => u.status === "available")
              .map((u) => u.unitId)
              .join(", ") || "nenhuma";
          const currentStatus = unit?.status || "não encontrada";
          throw badRequest(
            `Unidade ${item.unitId} do item "${inventoryItem.name}" indisponível (status: ${currentStatus}). Unidades disponíveis: ${availableUnits}.`,
          );
        }
      } else {
        const partnerQty = Math.max(0, Number(item.partnerSupply?.quantity ?? 0));
        if (partnerQty > 0) {
          if (!item.partnerSupply?.partnerId) {
            throw badRequest(
              `Informe o parceiro para o equipamento de terceiros em "${inventoryItem.name}".`,
            );
          }
          if (partnerQty > item.quantity) {
            throw badRequest(
              `Quantidade de terceiros maior que a quantidade da linha em "${inventoryItem.name}".`,
            );
          }
          const partner = await Partner.findOne({
            _id: item.partnerSupply.partnerId,
            companyId,
            isActive: true,
          });
          if (!partner) {
            throw badRequest(
              `Parceiro inválido ou inativo para "${inventoryItem.name}".`,
            );
          }
        }
        const ownQty = ownStockQuantity({
          quantity: item.quantity,
          partnerSupply: item.partnerSupply,
        });
        const available = inventoryItem.quantity.available || 0;
        if (ownQty > 0 && available < ownQty) {
          throw badRequest(
            `Estoque insuficiente para "${inventoryItem.name}". Disponível próprio: ${available}. Necessário do seu estoque: ${ownQty}` +
              (partnerQty > 0 ? ` (${partnerQty} de parceiro).` : "."),
          );
        }
      }
    }

    // 💰 Cálculo de preços
    const itemsWithPricing: IRentalItem[] = [];
    let equipmentSubtotal = 0;

    const pickupDates: Date[] = [];
    const returnDates: Date[] = [];

    const today = this.normalizeDate(new Date());

    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) continue;

      const rentalType: RentalType =
        item.rentalType && ["daily", "weekly", "biweekly", "monthly"].includes(item.rentalType)
          ? item.rentalType
          : getRentalTypeFromItem(inventoryItem);
      const pickupScheduled = new Date(item.pickupScheduled);
      const returnScheduled = item.returnScheduled
        ? new Date(item.returnScheduled)
        : this.getPricingEndDate(pickupScheduled, rentalType);

      const retNorm = this.normalizeDate(returnScheduled);
      let returnActual: Date | undefined;
      let retroactiveOpenBilling = false;

      if (retNorm.getTime() < today.getTime()) {
        if (item.historicalDelivery === true) {
          returnActual = retNorm;
        } else {
          retroactiveOpenBilling = true;
        }
      }

      pickupDates.push(pickupScheduled);
      returnDates.push(returnScheduled);

      const isLoan = item.isLoan === true;
      const periodRateOverride = Math.max(
        0,
        Number(item.periodRateOverride ?? 0),
      );

      if (item.saveRateToItem === true && periodRateOverride > 0) {
        await this.savePeriodRateToInventory(
          companyId,
          item.itemId,
          rentalType,
          periodRateOverride,
        );
        inventoryItem.set(
          "pricing",
          applyPeriodRateOverride(
            inventoryItem.pricing,
            rentalType,
            periodRateOverride,
          ),
        );
      }

      const pricingForLine =
        periodRateOverride > 0 && !item.saveRateToItem
          ? applyPeriodRateOverride(
              inventoryItem.pricing,
              rentalType,
              periodRateOverride,
            )
          : inventoryItem.pricing;

      const unitPrice = isLoan
        ? 0
        : this.calculateRentalPrice(
            pricingForLine,
            pickupScheduled,
            returnScheduled,
            rentalType,
            periodRateOverride > 0 ? periodRateOverride : undefined,
          );

      const subtotal = isLoan ? 0 : unitPrice * item.quantity;

      const rentalLine: IRentalItem = {
        itemId: item.itemId,
        lineId: randomUUID(),
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice,
        rentalType,
        pickupScheduled,
        returnScheduled,
        returnActual,
        retroactiveOpenBilling,
        subtotal,
        isLoan,
      };
      if (periodRateOverride > 0) {
        rentalLine.periodRateOverride = periodRateOverride;
      }
      const partnerQty = Math.max(0, Number(item.partnerSupply?.quantity ?? 0));
      if (partnerQty > 0 && item.partnerSupply?.partnerId) {
        rentalLine.partnerSupply = {
          partnerId: new mongoose.Types.ObjectId(item.partnerSupply.partnerId),
          quantity: partnerQty,
          agreedCost:
            item.partnerSupply.agreedCost != null
              ? Number(item.partnerSupply.agreedCost)
              : undefined,
          notes: item.partnerSupply.notes,
        };
      }
      itemsWithPricing.push(rentalLine);

      equipmentSubtotal += subtotal;
    }

    // Serviços
    let servicesSubtotal = 0;
    const services: IRentalService[] = (data.services || []).map(
      (service: any) => {
        const quantity = service.quantity || 1;
        const subtotal = service.price * quantity;
        servicesSubtotal += subtotal;
        return {
          description: service.description,
          price: service.price,
          quantity,
          subtotal,
          category: service.category || "other",
          notes: service.notes,
        };
      },
    );

    const totalSubtotal = equipmentSubtotal + servicesSubtotal;
    const discount = data.pricing?.discount || 0;

    const minPickupDate = new Date(
      Math.min(...pickupDates.map((d) => d.getTime())),
    );
    const maxReturnDate = new Date(
      Math.max(...returnDates.map((d) => d.getTime())),
    );

    const diffTime = maxReturnDate.getTime() - minPickupDate.getTime();
    const contractedDays = Math.max(
      1,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
    );

    const pricing: IRentalPricing = {
      equipmentSubtotal,
      originalEquipmentSubtotal: equipmentSubtotal,
      contractedDays,
      usedDays: 0,
      servicesSubtotal,
      subtotal: totalSubtotal,
      discount,
      discountReason: data.pricing?.discountReason,
      discountApprovedBy: data.pricing?.discountApprovedBy
        ? new mongoose.Types.ObjectId(data.pricing.discountApprovedBy)
        : undefined,
      lateFee: 0,
      total: totalSubtotal - discount,
    };

    //Criar rental
    const rental = await Rental.create({
      companyId,
      customerId: data.customerId,
      rentalNumber,
      items: itemsWithPricing,
      services: services.length > 0 ? services : undefined,
      workAddress: data.workAddress
        ? {
            street: data.workAddress.street,
            number: data.workAddress.number,
            complement: data.workAddress.complement,
            neighborhood: data.workAddress.neighborhood,
            city: data.workAddress.city,
            state: data.workAddress.state,
            zipCode: data.workAddress.zipCode,
            workName: data.workAddress.workName,
            workId:
              data.workAddress.workId &&
              mongoose.Types.ObjectId.isValid(data.workAddress.workId)
                ? new mongoose.Types.ObjectId(data.workAddress.workId)
                : undefined,
          }
        : undefined,
      financialResponsibleContact: this.mapResponsibleContact(
        data.financialResponsibleContact,
      ),
      workResponsibleContact: this.mapResponsibleContact(
        data.workResponsibleContact,
      ),
      fulfillmentMethod: data.fulfillmentMethod,
      pickedUpBy: data.pickedUpBy?.trim() || undefined,
      dates: {
        reservedAt: new Date(),
        pickupScheduled: minPickupDate,
        returnScheduled: maxReturnDate,
      },
      pricing,
      status: "active",
      notes: data.notes,
      createdBy: userId,
      createdWithoutCustomerCpf,
    });

    // Estoque: reserva e em seguida ativa (aluguel já ativo na criação) — só quantidade própria
    for (const item of itemsWithPricing) {
      const ownQty = ownStockQuantity(item);
      if (ownQty <= 0 && !item.unitId) continue;
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.unitId ? item.quantity : ownQty,
        "reserve",
        userId,
        rental._id,
        item.unitId,
        data.customerId,
      );
    }
    for (const item of itemsWithPricing) {
      const ownQty = ownStockQuantity(item);
      if (ownQty <= 0 && !item.unitId) continue;
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.unitId ? item.quantity : ownQty,
        "activate",
        userId,
        rental._id,
        item.unitId,
        data.customerId,
      );
    }

    await partnerService.syncLoansForRental(
      companyId,
      String(rental._id),
      itemsWithPricing,
    );

    await this.syncBillingsAfterRentalChange(
      companyId,
      String(rental._id),
      userId,
    );

    const withBillings = await Rental.findOne({ _id: rental._id, companyId });
    return withBillings || rental;
  }
  async closeRental(companyId: string, rentalId: string, userId: string) {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    if (rental.status === "completed") {
      throw badRequest("Aluguel já finalizado");
    }

    //Datas reais
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;
    const returnDate = new Date();

    rental.dates.returnActual = returnDate;

    //Dias utilizados (por linha: tipo de cobrança pode variar)
    let equipmentSubtotal = 0;
    let maxUsedDaysBilling = 0;

    //Calcular por item
    for (const item of rental.items) {
      const inventoryItem = await Item.findById(item.itemId);

      if (!inventoryItem) continue;

      const rentalType = item.rentalType || "daily";

      const period = calculateBillingPeriod(pickupDate, returnDate, rentalType);
      maxUsedDaysBilling = Math.max(maxUsedDaysBilling, period.daysPassed);

      const periodOverride = Number(item.periodRateOverride ?? 0);
      const pricingForLine =
        periodOverride > 0
          ? applyPeriodRateOverride(
              inventoryItem.pricing,
              rentalType,
              periodOverride,
            )
          : inventoryItem.pricing;
      const unitPrice = calculateRentalLineAmount(
        pricingForLine,
        rentalType,
        period,
      ).amount;

      const subtotal = unitPrice * item.quantity;

      //Atualiza item
      item.unitPrice = unitPrice;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
    }

    //Serviços
    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const discount = rental.pricing.discount || 0;
    const lateFee = 0;

    //Total final
    const total = equipmentSubtotal + servicesSubtotal - discount + lateFee;

    //Atualiza pricing
    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.originalEquipmentSubtotal = equipmentSubtotal;
    rental.pricing.servicesSubtotal = servicesSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.total = total;
    rental.pricing.usedDays = Math.max(1, maxUsedDaysBilling);
    rental.pricing.lateFee = lateFee;

    //Status
    await this.applyStatusChangeDirect(
      rental,
      rental.status,
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  private rentalTypeLabelPt(rentalType: RentalType): string {
    switch (rentalType) {
      case "daily":
        return "diário";
      case "weekly":
        return "semanal";
      case "biweekly":
        return "quinzenal";
      case "monthly":
        return "mensal";
      default:
        return rentalType;
    }
  }

  private pricingForCloseSuggestion(
    inventoryPricing: {
      dailyRate?: number;
      weeklyRate?: number;
      biweeklyRate?: number;
      monthlyRate?: number;
    } | undefined,
    rentalType: RentalType,
    contractRentalType: RentalType,
    periodOverride: number,
  ) {
    if (periodOverride > 0 && rentalType === contractRentalType) {
      return applyPeriodRateOverride(
        inventoryPricing,
        rentalType,
        periodOverride,
      );
    }
    return inventoryPricing;
  }

  private tryCloseAmountForSuggestion(
    inventoryPricing: {
      dailyRate?: number;
      weeklyRate?: number;
      biweeklyRate?: number;
      monthlyRate?: number;
    } | undefined,
    rentalType: RentalType,
    periodStart: Date,
    periodEnd: Date,
    returnedQuantity: number,
    contractRentalType: RentalType,
    periodOverride: number,
  ): {
    baseAmount: number;
    usedDays: number;
    periodsCharged: number;
    periodStart: Date;
    periodEnd: Date;
  } | null {
    try {
      if (periodEnd.getTime() < periodStart.getTime()) {
        return null;
      }
      const pricing = this.pricingForCloseSuggestion(
        inventoryPricing,
        rentalType,
        contractRentalType,
        periodOverride,
      );
      const rateCheck = periodRateFromInventory(pricing, rentalType);
      if (rateCheck.rate <= 0) {
        return null;
      }
      const pc = calculateBillingPeriod(periodStart, periodEnd, rentalType);
      const { amount } = calculateRentalLineAmount(pricing, rentalType, pc);
      const periodsCharged =
        rentalType === "daily"
          ? Math.max(1, pc.periodsCompleted)
          : pc.periodsCompleted + (pc.extraDays > 0 ? 1 : 0);
      return {
        baseAmount: Number((amount * returnedQuantity).toFixed(2)),
        usedDays: Math.max(0, pc.daysPassed),
        periodsCharged,
        periodStart,
        periodEnd,
      };
    } catch {
      return null;
    }
  }

  private formatLocalDateInput(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private formatLocalTimeInput(d: Date): string {
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${min}`;
  }

  /**
   * Menor custo entre tipos de cobrança disponíveis e ajuste de data de cálculo
   * somente quando a devolução ultrapassa o ciclo por no máximo 1 dia.
   */
  private buildCheapestCloseSuggestion(params: {
    targetItem: IRentalItem;
    rental: { dates?: { pickupScheduled?: Date }; items?: IRentalItem[] };
    inventoryPricing:
      | {
          dailyRate?: number;
          weeklyRate?: number;
          biweeklyRate?: number;
          monthlyRate?: number;
        }
      | undefined;
    periodOverride: number;
    contractRentalType: RentalType;
    currentBillingType: RentalType;
    returnAt: Date;
    periodStartRaw: Date;
    periodEndCharge: Date;
    returnedQuantity: number;
    currentBaseAmount: number;
    additionalAmount: number;
  }): {
    expectedBillingAmount: number;
    baseBillingAmount: number;
    savings: number;
    billingRentalType: RentalType;
    usedDays: number;
    periodsCharged: number;
    periodStart: string;
    periodEnd: string;
    title: string;
    explanation: string;
    actions: {
      billingRentalType: RentalType | "";
      returnDate: string;
      returnTime: string;
    };
  } | null {
    type Candidate = {
      baseAmount: number;
      billingType: RentalType;
      usedDays: number;
      periodsCharged: number;
      periodStart: Date;
      periodEnd: Date;
      returnAtForCalc: Date;
      kind: "type" | "date" | "type_and_date";
    };

    const candidates: Candidate[] = [];
    const types: RentalType[] = ["daily", "weekly", "biweekly", "monthly"];

    for (const rt of types) {
      const isCurrentType = rt === params.currentBillingType;
      const hasRegisteredRate =
        registeredPeriodRateFromInventory(params.inventoryPricing, rt) > 0;
      const overrideCoversType =
        params.periodOverride > 0 && rt === params.contractRentalType;
      // Não sugere tipo sem preço cadastrado (derivar da diária não conta).
      if (!isCurrentType && !hasRegisteredRate && !overrideCoversType) {
        continue;
      }

      let periodStart: Date;
      let periodEnd: Date;
      try {
        const resolved = this.resolveReturnChargePeriod(
          params.targetItem,
          params.rental,
          params.returnAt,
          rt,
        );
        periodStart = resolved.periodStartRaw;
        periodEnd = resolved.periodEndCharge;
      } catch {
        continue;
      }

      const calc = this.tryCloseAmountForSuggestion(
        params.inventoryPricing,
        rt,
        periodStart,
        periodEnd,
        params.returnedQuantity,
        params.contractRentalType,
        params.periodOverride,
      );
      if (!calc) continue;

      candidates.push({
        baseAmount: calc.baseAmount,
        billingType: rt,
        usedDays: calc.usedDays,
        periodsCharged: calc.periodsCharged,
        periodStart: calc.periodStart,
        periodEnd: calc.periodEnd,
        returnAtForCalc: params.returnAt,
        kind: "type",
      });

      // Ajuste de data só no tipo atual e na mesma devolução real.
      // Trocar de tipo (ex.: quinzena → diária) compara na data informada;
      // não recua a data para “ganhar” 1 diária a menos.
      if (rt !== params.currentBillingType) {
        continue;
      }

      if (rt !== "daily") {
        const pc = calculateBillingPeriod(periodStart, periodEnd, rt);
        if (pc.extraDays === 1 && pc.periodsCompleted >= 1) {
          const periodLen = this.getPeriodLengthDays(rt);
          const completeDays = pc.periodsCompleted * periodLen;
          const adjustedEnd = this.addDays(
            this.normalizeDate(periodStart),
            completeDays - 1,
          );
          const dayDiff = Math.round(
            (this.normalizeDate(periodEnd).getTime() -
              this.normalizeDate(adjustedEnd).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (
            dayDiff === 1 &&
            adjustedEnd.getTime() < this.normalizeDate(periodEnd).getTime()
          ) {
            const adj = this.tryCloseAmountForSuggestion(
              params.inventoryPricing,
              rt,
              periodStart,
              adjustedEnd,
              params.returnedQuantity,
              params.contractRentalType,
              params.periodOverride,
            );
            if (adj && adj.baseAmount < calc.baseAmount - 0.009) {
              candidates.push({
                baseAmount: adj.baseAmount,
                billingType: rt,
                usedDays: adj.usedDays,
                periodsCharged: adj.periodsCharged,
                periodStart: adj.periodStart,
                periodEnd: adj.periodEnd,
                returnAtForCalc: adjustedEnd,
                kind: "date",
              });
            }
          }
        }
      } else {
        const pc = calculateBillingPeriod(periodStart, periodEnd, "daily");
        const units = Math.max(1, pc.periodsCompleted);
        if (units >= 2) {
          const HOUR_MS = 1000 * 60 * 60;
          const prevUnits = units - 1;
          const maxMsForPrev =
            prevUnits <= 1
              ? 24 * HOUR_MS
              : (24 + (prevUnits - 1) * 26) * HOUR_MS;
          const calendarOnly =
            isLocalMidnight(periodStart) && isLocalMidnight(periodEnd);
          let adjustedEnd: Date;
          if (calendarOnly) {
            adjustedEnd = this.addDays(
              this.normalizeDate(periodStart),
              prevUnits - 1,
            );
          } else {
            adjustedEnd = new Date(periodStart.getTime() + maxMsForPrev);
          }
          const spillMs = periodEnd.getTime() - adjustedEnd.getTime();
          // Só se o estouro for a tolerância da diária (~2h), não um dia cheio.
          if (spillMs > 0 && spillMs <= 2 * HOUR_MS + 60_000) {
            const adj = this.tryCloseAmountForSuggestion(
              params.inventoryPricing,
              "daily",
              periodStart,
              adjustedEnd,
              params.returnedQuantity,
              params.contractRentalType,
              params.periodOverride,
            );
            if (adj && adj.baseAmount < calc.baseAmount - 0.009) {
              candidates.push({
                baseAmount: adj.baseAmount,
                billingType: "daily",
                usedDays: adj.usedDays,
                periodsCharged: adj.periodsCharged,
                periodStart: adj.periodStart,
                periodEnd: adj.periodEnd,
                returnAtForCalc: adjustedEnd,
                kind: "date",
              });
            }
          }
        }
      }
    }

    const cheaper = candidates
      .filter((c) => c.baseAmount < params.currentBaseAmount - 0.009)
      .sort((a, b) => {
        if (a.baseAmount !== b.baseAmount) {
          return a.baseAmount - b.baseAmount;
        }
        // Empate: prioriza só ajuste de data no tipo atual (menos invasivo)
        const score = (c: Candidate) => {
          let s = 0;
          if (c.billingType === params.currentBillingType) s += 2;
          if (c.kind === "date") s += 1;
          return s;
        };
        return score(b) - score(a);
      });

    const best = cheaper[0];
    if (!best) {
      return null;
    }

    const savings = Number(
      (params.currentBaseAmount - best.baseAmount).toFixed(2),
    );
    const totalWithExtra = Number(
      (best.baseAmount + params.additionalAmount).toFixed(2),
    );
    const typeChanged = best.billingType !== params.currentBillingType;
    const dateChanged =
      Math.abs(
        best.returnAtForCalc.getTime() - params.returnAt.getTime(),
      ) > 60_000 ||
      this.normalizeDate(best.periodEnd).getTime() !==
        this.normalizeDate(params.periodEndCharge).getTime();

    const currentLabel = this.rentalTypeLabelPt(params.currentBillingType);
    const bestLabel = this.rentalTypeLabelPt(best.billingType);
    let title = "Opção mais econômica";
    let explanation = "";

    if (typeChanged && !dateChanged) {
      title = `Trocar para cobrança ${bestLabel}`;
      explanation = `Com ${best.usedDays} dia(s) usado(s), fechar como ${bestLabel} (${best.periodsCharged} período(s)) fica em ${formatCurrencyBr(best.baseAmount)} em vez de ${formatCurrencyBr(params.currentBaseAmount)} no ${currentLabel} — economia de ${formatCurrencyBr(savings)}.`;
    } else if (!typeChanged && dateChanged) {
      title = "Ajustar data de cálculo";
      const when = best.returnAtForCalc;
      const whenLabel = isLocalMidnight(when)
        ? when.toLocaleDateString("pt-BR")
        : when.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
      explanation = `A data atual passa 1 dia além do ciclo ${currentLabel} e gera um período a mais. Usando o cálculo em ${whenLabel} (1 dia antes), o valor cai de ${formatCurrencyBr(params.currentBaseAmount)} para ${formatCurrencyBr(best.baseAmount)} — economia de ${formatCurrencyBr(savings)}. A data real informativa pode permanecer como está.`;
    } else {
      title = `Cobrança ${bestLabel} com data ajustada`;
      explanation = `Combinando tipo ${bestLabel} e data de cálculo no fim do período completo, o fechamento fica em ${formatCurrencyBr(best.baseAmount)} (economia de ${formatCurrencyBr(savings)} em relação ao atual).`;
    }

    const returnDate = this.formatLocalDateInput(best.returnAtForCalc);
    const returnTime = isLocalMidnight(best.returnAtForCalc)
      ? "00:00"
      : this.formatLocalTimeInput(best.returnAtForCalc);

    return {
      expectedBillingAmount: totalWithExtra,
      baseBillingAmount: best.baseAmount,
      savings,
      billingRentalType: best.billingType,
      usedDays: best.usedDays,
      periodsCharged: best.periodsCharged,
      periodStart: best.periodStart.toISOString(),
      periodEnd: best.periodEnd.toISOString(),
      title,
      explanation,
      actions: {
        billingRentalType:
          best.billingType === params.contractRentalType
            ? ""
            : best.billingType,
        returnDate,
        returnTime,
      },
    };
  }

  async getClosePreview(rentalId: string, companyId: string) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    const startDate = rental.dates.pickupActual ?? rental.dates.pickupScheduled;
    const endDate = rental.dates.returnActual ?? new Date();
    const DAY_MS = 1000 * 60 * 60 * 24;

    // Dias contratados e tipo de contrato
    let contractedDays = rental.pricing.contractedDays;
    if (!contractedDays) {
      // fallback: calcula diferença entre datas agendadas (calendário inclusivo)
      const scheduledStart = rental.dates.pickupScheduled;
      const scheduledEnd = rental.dates.returnScheduled;
      const ds = new Date(scheduledStart);
      ds.setHours(0, 0, 0, 0);
      const de = new Date(scheduledEnd);
      de.setHours(0, 0, 0, 0);
      const contractedDiffMs = de.getTime() - ds.getTime();
      contractedDays =
        contractedDiffMs >= 0
          ? Math.max(1, Math.floor(contractedDiffMs / DAY_MS) + 1)
          : 1;
    }
    // Tipo de contrato: pega do primeiro item ou do ciclo de faturamento
    const rentalType =
      rental.dates.billingCycle || rental.items[0]?.rentalType || "daily";

    const originalTotal = rental.pricing.total;

    // Calcular valor proporcional de cada item (respeita valor personalizado do contrato)
    let recalculatedEquipment = 0;
    let maxUsedDaysBilling = 0;
    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId }).lean();
      if (!inventoryItem) continue;
      const itemRentalType = item.rentalType || "daily";
      const period = calculateBillingPeriod(startDate, endDate, itemRentalType);
      maxUsedDaysBilling = Math.max(maxUsedDaysBilling, period.daysPassed);
      const periodOverride = Number((item as { periodRateOverride?: number }).periodRateOverride ?? 0);
      const pricingForLine =
        periodOverride > 0
          ? applyPeriodRateOverride(
              inventoryItem.pricing,
              itemRentalType as RentalType,
              periodOverride,
            )
          : inventoryItem.pricing;
      const { amount } = calculateRentalLineAmount(
        pricingForLine,
        itemRentalType,
        period,
      );
      recalculatedEquipment += amount * item.quantity;
    }
    const usedDays = Math.max(1, maxUsedDaysBilling);

    const recalculatedTotal =
      recalculatedEquipment +
      (rental.pricing.servicesSubtotal || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      originalTotal,
      recalculatedTotal,
      usedDays,
      contractedDays,
      rentalType,
    };
  }

  async getClosePreviewItem(
    rentalId: string,
    itemId: string,
    companyId: string,
    opts?: {
      unitId?: string;
      lineId?: string;
      returnDate?: Date;
      billingRentalType?: RentalType;
      returnedQuantity?: number;
      additionalAmount?: number;
    },
  ) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    const targetItem = this.findOpenRentalItem(
      rental.items,
      itemId,
      opts?.unitId,
      opts?.lineId,
    );

    if (!targetItem) {
      throw badRequest(`Item não encontrado no aluguel`);
    }

    const pickupNorm = this.normalizeDate(
      new Date(targetItem.pickupScheduled || rental.dates.pickupScheduled),
    );
    let contractedDays = 1;
    if (targetItem.returnScheduled) {
      const diffMs =
        this.normalizeDate(new Date(targetItem.returnScheduled)).getTime() -
        pickupNorm.getTime();
      if (diffMs >= 0) {
        const whole = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        contractedDays = Math.max(1, whole + 1);
      }
    }

    const originalTotal = targetItem.subtotal || 0;
    const isUnit = Boolean(targetItem.unitId);
    const maxQty = Number(targetItem.quantity || 1);
    const returnedQuantity = isUnit
      ? 1
      : Math.max(1, Math.min(opts?.returnedQuantity ?? maxQty, maxQty));

    const useReturnsFlow =
      isUnit ||
      maxQty > 1 ||
      Boolean(opts?.billingRentalType) ||
      returnedQuantity < maxQty;

    const billingRt = (opts?.billingRentalType ||
      targetItem.rentalType ||
      "daily") as RentalType;

    const returnAt =
      opts?.returnDate != null && !Number.isNaN(opts.returnDate.getTime())
        ? new Date(opts.returnDate)
        : new Date();

    if (this.isLoanLine(targetItem)) {
      let rentalTotalAfterClose = 0;
      const targetLineKey = buildRentalLineKey(targetItem as any);
      for (const item of rental.items) {
        const lineKey = buildRentalLineKey(item as any);
        if (lineKey === targetLineKey && !item.returnActual) {
          rentalTotalAfterClose += 0;
        } else {
          rentalTotalAfterClose += item.subtotal || 0;
        }
      }
      const servicesSubtotal =
        rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;
      rentalTotalAfterClose +=
        servicesSubtotal -
        (rental.pricing.discount || 0) +
        (rental.pricing.lateFee || 0);
      rentalTotalAfterClose = Math.max(0, rentalTotalAfterClose);

      return {
        originalTotal,
        recalculatedTotal: 0,
        expectedBillingAmount: 0,
        usedDays: 0,
        periodsCharged: 0,
        contractedDays,
        rentalType: targetItem.rentalType || "daily",
        billingRentalTypeUsed: billingRt,
        rentalTotalAfterClose,
        periodStart: null,
        periodEnd: null,
        isLoan: true,
        cheapestSuggestion: null,
      };
    }

    const inventoryItem = await Item.findOne({
      _id: targetItem.itemId,
      companyId,
    }).lean();
    if (!inventoryItem) {
      throw notFound("Item do inventário não encontrado");
    }

    const periodOverride = Number(
      (targetItem as { periodRateOverride?: number }).periodRateOverride ?? 0,
    );
    const contractRt = (targetItem.rentalType || "daily") as RentalType;
    const usesContractOverride =
      periodOverride > 0 && billingRt === contractRt;
    if (opts?.billingRentalType && !usesContractOverride) {
      this.assertConfiguredRateForRentalType(inventoryItem, billingRt);
    }

    let periodStartRaw: Date;
    let periodEndCharge: Date;
    let effectiveRt: RentalType;

    if (useReturnsFlow) {
      effectiveRt = billingRt;
      const resolved = this.resolveReturnChargePeriod(
        targetItem,
        rental,
        returnAt,
        billingRt,
      );
      periodStartRaw = resolved.periodStartRaw;
      periodEndCharge = resolved.periodEndCharge;
    } else {
      effectiveRt = (targetItem.rentalType || "daily") as RentalType;
      const pickupRaw = new Date(
        targetItem.pickupScheduled || rental.dates.pickupScheduled,
      );
      const pickupBase =
        effectiveRt === "daily" ? pickupRaw : this.normalizeDate(pickupRaw);
      periodStartRaw = pickupBase;
      periodEndCharge =
        effectiveRt === "daily" ? returnAt : this.normalizeDate(returnAt);
    }

    this.assertReturnChargePeriodValid(
      periodStartRaw,
      periodEndCharge,
      effectiveRt,
    );

    const pc = calculateBillingPeriod(
      periodStartRaw,
      periodEndCharge,
      effectiveRt,
    );
    const pricingForLine =
      periodOverride > 0 && effectiveRt === contractRt
        ? applyPeriodRateOverride(
            inventoryItem.pricing,
            effectiveRt,
            periodOverride,
          )
        : inventoryItem.pricing;
    const { amount } = calculateRentalLineAmount(
      pricingForLine,
      effectiveRt,
      pc,
    );
    const periodsCharged =
      effectiveRt === "daily"
        ? Math.max(1, pc.periodsCompleted)
        : pc.periodsCompleted + (pc.extraDays > 0 ? 1 : 0);
    const additionalAmount = Math.max(0, Number(opts?.additionalAmount || 0));
    const baseTotal = Number((amount * returnedQuantity).toFixed(2));
    const recalculatedTotal = Number((baseTotal + additionalAmount).toFixed(2));

    const cheapestSuggestion = this.buildCheapestCloseSuggestion({
      targetItem,
      rental,
      inventoryPricing: inventoryItem.pricing,
      periodOverride,
      contractRentalType: (targetItem.rentalType || "daily") as RentalType,
      currentBillingType: effectiveRt,
      returnAt,
      periodStartRaw,
      periodEndCharge,
      returnedQuantity,
      currentBaseAmount: baseTotal,
      additionalAmount,
    });

    let rentalTotalAfterClose = 0;
    const targetLineKey = buildRentalLineKey(targetItem as any);
    for (const item of rental.items) {
      const lineKey = buildRentalLineKey(item as any);
      if (lineKey === targetLineKey && !item.returnActual) {
        rentalTotalAfterClose += recalculatedTotal;
      } else {
        rentalTotalAfterClose += item.subtotal || 0;
      }
    }

    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;
    rentalTotalAfterClose +=
      servicesSubtotal -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);
    rentalTotalAfterClose = Math.max(0, rentalTotalAfterClose);

    return {
      originalTotal,
      recalculatedTotal,
      expectedBillingAmount: recalculatedTotal,
      baseBillingAmount: baseTotal,
      additionalAmount,
      usedDays: Math.max(0, pc.daysPassed),
      periodsCharged,
      contractedDays,
      rentalType: targetItem.rentalType || "daily",
      billingRentalTypeUsed: effectiveRt,
      rentalTotalAfterClose,
      periodStart: periodStartRaw.toISOString(),
      periodEnd: periodEndCharge.toISOString(),
      isLoan: false,
      cheapestSuggestion,
    };
  }

  async closeRentalItem(
    companyId: string,
    rentalId: string,
    itemId: string,
    userId: string,
    returnDate?: Date,
    unitId?: string,
    lineId?: string,
    informativeReturnDate?: Date,
    billingExtras?: {
      additionalAmount?: number;
      additionalAmountReason?: string;
    },
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    const targetItem = this.findOpenRentalItem(
      rental.items,
      itemId,
      unitId,
      lineId,
    );

    if (!targetItem) {
      throw badRequest(`Item não encontrado no aluguel`);
    }

    if (targetItem.returnActual) {
      throw badRequest("Item já finalizado");
    }

    // =========================
    // 1. VALIDAR E BUSCAR ITEM DO INVENTÁRIO
    // =========================
    const inventoryItem = await Item.findOne({
      _id: targetItem.itemId,
      companyId,
    });

    if (!inventoryItem) {
      throw notFound(
        `Sistema de aluguel: Item com ID ${targetItem.itemId} não foi encontrado no inventário. O item pode ter sido removido do sistema. Por favor, contate o administrador para verificar a consistência dos dados.`,
      );
    }

    // =========================
    // 2. FINALIZA ITEM
    // =========================
    const rtClose = (targetItem.rentalType || "daily") as RentalType;
    const returnAt = new Date(returnDate || new Date());
    const returnNorm =
      rtClose === "daily" ? returnAt : this.normalizeDate(returnAt);
    targetItem.returnActual = returnNorm;
    targetItem.returnScheduled = returnNorm;
    if (
      informativeReturnDate != null &&
      !Number.isNaN(informativeReturnDate.getTime())
    ) {
      targetItem.informativeReturnDate = this.normalizeDate(
        informativeReturnDate,
      );
    }
    targetItem.retroactiveOpenBilling = false;
    targetItem.nextBillingDate = undefined;
    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    // Validar estoque antes de qualquer efeito colateral (fechamento / inventário)
    let inventoryReturnQty = 0;
    const ownQtyOnLine = ownStockQuantity(targetItem);
    const partnerQtyOnLine = partnerStockQuantity(targetItem);
    if (inventoryItem.trackingType !== "unit") {
      const resolved = await this.resolveInventoryReturnForRentalLine(
        companyId,
        inventoryItem,
        ownQtyOnLine,
        rental._id,
      );
      inventoryReturnQty = resolved.applyQuantity;
    }

    await partnerService.applyCustomerReturn(
      companyId,
      String(rental._id),
      targetItem.lineId,
      targetItem.quantity,
      partnerQtyOnLine,
      ownQtyOnLine,
    );

    // =========================
    // 2. BILLING FINAL DO ITEM
    // =========================
    const rentalLineKey = buildRentalLineKey(targetItem as any);

    const { periodStartRaw, periodEndCharge } = this.resolveReturnChargePeriod(
      targetItem,
      rental,
      returnAt,
      rtClose,
    );
    this.assertReturnChargePeriodValid(
      periodStartRaw,
      periodEndCharge,
      rtClose,
    );

    await this.deleteUnpaidBillingsOverlappingItemWindow(
      companyId,
      rental._id,
      targetItem.itemId,
      targetItem.unitId,
      periodStartRaw,
      periodEndCharge,
      rentalLineKey,
    );

    const periodStart = periodStartRaw;
    const periodEnd = periodEndCharge;
    let finalBillingSubtotal: number | undefined;
    const isLoan = this.isLoanLine(targetItem);

    if (!isLoan && periodEnd.getTime() >= periodStart.getTime()) {
      const periodStartQuery =
        rtClose === "daily"
          ? this.billingInstantOrDayMatch(periodStart)
          : periodStart;
      const periodEndQuery =
        rtClose === "daily"
          ? this.billingInstantOrDayMatch(periodEnd)
          : periodEnd;

      let finalBilling: any = await Billing.findOne({
        companyId,
        rentalId: rental._id,
        status: { $nin: ["paid", "cancelled"] },
        "items.itemId": targetItem.itemId,
        ...(targetItem.unitId ? { "items.unitId": targetItem.unitId } : {}),
        "items.rentalLineKey": rentalLineKey,
        periodStart: periodStartQuery,
        periodEnd: periodEndQuery,
      });

      if (!finalBilling) {
        finalBilling = await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          targetItem,
          periodStart,
          periodEnd,
          userId,
          {
            includeServices: false,
            notes: "Fechamento final do item",
            status: "approved",
            additionalAmount: billingExtras?.additionalAmount,
            additionalAmountReason: billingExtras?.additionalAmountReason,
          },
        );
      } else if (
        billingExtras?.additionalAmount &&
        billingExtras.additionalAmount > 0
      ) {
        const add = Math.max(0, Number(billingExtras.additionalAmount));
        finalBilling.calculation.additionalAmount = add;
        finalBilling.calculation.additionalAmountReason =
          billingExtras.additionalAmountReason;
        finalBilling.calculation.total = resolveBillingTotal(
          finalBilling.calculation,
        );
        finalBilling.outstandingAmount = finalBilling.calculation.total;
        await finalBilling.save();
      }

      const wantKey = rentalLineKey;
      const billingItem = finalBilling.items?.find((row: any) => {
        if (wantKey && String(row.rentalLineKey || "") === String(wantKey)) {
          return true;
        }
        const sameItem = String(row.itemId) === String(targetItem.itemId);
        const sameUnit = targetItem.unitId
          ? row.unitId === targetItem.unitId
          : !row.unitId;
        return sameItem && sameUnit;
      });
      finalBillingSubtotal = Number(
        finalBilling.calculation?.total ??
          billingItem?.subtotal ??
          finalBilling.calculation?.baseAmount ??
          0,
      );
      targetItem.lastBillingDate = periodEnd;
      targetItem.nextBillingDate = undefined;
    } else if (isLoan) {
      targetItem.lastBillingDate = periodEnd;
      targetItem.nextBillingDate = undefined;
      targetItem.unitPrice = 0;
    }

    if (inventoryReturnQty > 0) {
      await this.updateItemQuantityForRental(
        companyId,
        targetItem.itemId as any,
        inventoryReturnQty,
        "return",
        userId,
        rental._id,
        targetItem.unitId,
        rental.customerId.toString(),
      );
    }

    // =========================
    // 3. RECALCULAR ITEM (período retirada → devolução, dias inclusivos)
    // =========================
    const usedDaysBilling = calculateBillingPeriod(
      periodStart,
      periodEnd,
      rtClose,
    ).daysPassed;

    targetItem.subtotal = isLoan
      ? 0
      : finalBillingSubtotal ??
        this.computeItemPartialSubtotal(
          targetItem,
          periodStart,
          periodEnd,
          targetItem.quantity,
        );
    targetItem.usedDays = Math.max(1, usedDaysBilling);

    // =========================
    // 4. RECALCULAR TOTAL DO ALUGUEL
    // =========================
    let equipmentSubtotal = 0;

    for (const item of rental.items) {
      equipmentSubtotal += item.subtotal || 0;
    }

    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const total =
      equipmentSubtotal +
      servicesSubtotal +
      -(rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.total = Math.max(0, total);

    // =========================
    // 5. VERIFICA SE TODOS FORAM DEVOLVIDOS
    // =========================
    const allReturned = rental.items.every((item) => item.returnActual);

    if (allReturned) {
      // pega a maior data de devolução
      const maxReturn = rental.items.reduce<Date | null>((acc, item) => {
        if (!item.returnActual) return acc;
        if (!acc) return item.returnActual;
        return item.returnActual > acc ? item.returnActual : acc;
      }, null);

      if (maxReturn) {
        rental.dates.returnActual = maxReturn;
      }

      // Status muda para ready_to_close quando todos os itens foram devolvidos
      // Aguardando confirmação do usuário para finalizar completamente
      if (rental.status !== "ready_to_close") {
        rental.status = "ready_to_close";
      }
    }

    // =========================
    // 6. SALVA E SINCRONIZA FECHAMENTOS
    // =========================
    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);

    const updated = await Rental.findOne({ _id: rentalId, companyId });
    return updated || rental;
  }

  private computeItemPartialSubtotal(
    item: IRentalItem,
    periodStart: Date,
    periodEnd: Date,
    quantity: number,
  ): number {
    const rentalType = item.rentalType || "daily";
    const pc = calculateBillingPeriod(
      periodStart,
      periodEnd,
      rentalType as RentalType,
    );
    if (rentalType === "daily") {
      return Number((Number(item.unitPrice || 0) * pc.daysPassed * quantity).toFixed(2));
    }
    const periodLen = getPeriodLengthDaysFromUtil(rentalType as RentalType);
    const implied =
      periodLen > 0 ? Number(item.unitPrice || 0) / periodLen : Number(item.unitPrice || 0);
    return Number((implied * pc.daysPassed * quantity).toFixed(2));
  }

  async returnRentalItems(
    companyId: string,
    rentalId: string,
    userId: string,
    payload: {
      returnDate?: Date;
      informativeReturnDate?: Date;
      notes?: string;
      items: Array<{
        itemId: string;
        unitId?: string;
        lineId?: string;
        returnedQuantity?: number;
        billingRentalType?: RentalType;
        remainderRentalType?: RentalType;
        additionalAmount?: number;
        additionalAmountReason?: string;
      }>;
    },
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }
    if (rental.status === "completed" || rental.status === "cancelled") {
      throw badRequest("Não é possível devolver itens de aluguel finalizado/cancelado");
    }

    const returnAt =
      payload.returnDate != null ? new Date(payload.returnDate) : new Date();
    const finalReturnDateNorm = this.normalizeDate(returnAt);

    const informativeNorm =
      payload.informativeReturnDate != null &&
      !Number.isNaN(new Date(payload.informativeReturnDate).getTime())
        ? this.normalizeDate(new Date(payload.informativeReturnDate))
        : undefined;

    for (const reqItem of payload.items) {
      const idx = this.findOpenRentalItemIndex(
        rental.items,
        reqItem.itemId,
        reqItem.unitId,
        reqItem.lineId,
      );
      if (idx === -1) {
        throw badRequest(
          `Item ${reqItem.itemId} não encontrado no aluguel em aberto (ou já foi devolvido)`,
        );
      }
      const targetItem = rental.items[idx];

      const billingRt = (reqItem.billingRentalType ||
        targetItem.rentalType ||
        "daily") as RentalType;

      const isUnit = Boolean(targetItem.unitId);
      const returnedQuantity = isUnit
        ? 1
        : Math.max(1, Math.min(reqItem.returnedQuantity || targetItem.quantity, targetItem.quantity));

      const pickupPure = new Date(
        targetItem.pickupScheduled || rental.dates.pickupScheduled,
      );
      const pickupNorm = this.normalizeDate(pickupPure);

      const { periodStartRaw, periodEndCharge } = this.resolveReturnChargePeriod(
        targetItem,
        rental,
        returnAt,
        billingRt,
      );

      this.assertReturnChargePeriodValid(
        periodStartRaw,
        periodEndCharge,
        billingRt,
      );

      const isLoan = this.isLoanLine(targetItem);

      if (!isLoan) {
        await this.deleteUnpaidBillingsOverlappingItemWindow(
          companyId,
          rental._id,
          targetItem.itemId,
          targetItem.unitId,
          periodStartRaw,
          periodEndCharge,
          buildRentalLineKey(targetItem as any),
        );
      }

      const invForLine = await Item.findOne({
        _id: targetItem.itemId,
        companyId,
      });
      if (!invForLine) {
        throw notFound("Item do inventário não encontrado");
      }
      if (
        !isLoan &&
        reqItem.billingRentalType &&
        !(
          Number(targetItem.periodRateOverride ?? 0) > 0 &&
          reqItem.billingRentalType ===
            ((targetItem.rentalType || "daily") as RentalType)
        )
      ) {
        this.assertConfiguredRateForRentalType(
          invForLine,
          reqItem.billingRentalType,
        );
      }

      let inventoryReturnQty = 0;
      const ownQtyOnLine = ownStockQuantity(targetItem);
      const partnerQtyOnLine = partnerStockQuantity(targetItem);
      if (invForLine.trackingType !== "unit") {
        const ownReturnCap = Math.min(returnedQuantity, ownQtyOnLine);
        const resolved = await this.resolveInventoryReturnForRentalLine(
          companyId,
          invForLine,
          ownReturnCap,
          rental._id,
        );
        inventoryReturnQty = resolved.applyQuantity;
      }

      await partnerService.applyCustomerReturn(
        companyId,
        String(rental._id),
        targetItem.lineId,
        returnedQuantity,
        partnerQtyOnLine,
        ownQtyOnLine,
      );

      const storeReturnActual =
        billingRt === "daily" ? returnAt : finalReturnDateNorm;

      const plainItem: any = JSON.parse(JSON.stringify(targetItem));
      const qtyToBill =
        returnedQuantity >= targetItem.quantity ? targetItem.quantity : returnedQuantity;

      const partialSplit = returnedQuantity < targetItem.quantity;
      const splitReturnedLineId = partialSplit ? randomUUID() : undefined;
      const splitRemainderLineId = partialSplit ? randomUUID() : undefined;

      if (isLoan) {
        if (returnedQuantity >= targetItem.quantity) {
          targetItem.returnActual = storeReturnActual;
          targetItem.retroactiveOpenBilling = false;
          targetItem.lastBillingDate = storeReturnActual;
          targetItem.nextBillingDate = undefined;
          targetItem.unitPrice = 0;
          targetItem.subtotal = 0;
          if (informativeNorm) {
            targetItem.informativeReturnDate = informativeNorm;
          }
        } else {
          const returnedLine: any = {
            ...plainItem,
            _id: undefined,
            lineId: splitReturnedLineId,
            pickupScheduled: plainItem.pickupScheduled,
            returnScheduled: periodEndCharge,
            quantity: returnedQuantity,
            rentalType: plainItem.rentalType || "daily",
            unitPrice: 0,
            subtotal: 0,
            isLoan: true,
            returnActual: storeReturnActual,
            retroactiveOpenBilling: false,
            lastBillingDate: storeReturnActual,
            nextBillingDate: undefined,
          };
          if (informativeNorm) {
            returnedLine.informativeReturnDate = informativeNorm;
          }
          rental.items.push(returnedLine);

          const prevQty = plainItem.quantity;
          const pickupContinued = this.normalizeDate(
            new Date(plainItem.pickupScheduled),
          );
          targetItem.lineId = splitRemainderLineId;
          targetItem.pickupScheduled = pickupContinued;
          targetItem.quantity = prevQty - returnedQuantity;
          targetItem.unitPrice = 0;
          targetItem.subtotal = 0;
          targetItem.isLoan = true;
          targetItem.retroactiveOpenBilling = false;
          targetItem.lastBillingDate =
            billingRt === "daily"
              ? storeReturnActual
              : this.normalizeDate(periodEndCharge);
          targetItem.nextBillingDate = this.getPeriodEnd(
            this.addDays(this.normalizeDate(periodEndCharge), 1),
            (targetItem.rentalType || "daily") as RentalType,
          );
        }
      } else {
        const includeServices =
          (await Billing.countDocuments({ companyId, rentalId: rental._id })) === 0;

        const lineForBilling: any = {
          ...plainItem,
          quantity: qtyToBill,
          /** Alinha rentalLineKey do fechamento com a linha após devolução (data/tipo). */
          returnScheduled: periodEndCharge,
        };
        if (partialSplit) {
          lineForBilling.lineId = splitReturnedLineId;
        }
        if (reqItem.billingRentalType) {
          lineForBilling.contractRentalType =
            plainItem.rentalType || "daily";
          lineForBilling.rentalType = reqItem.billingRentalType;
        }

        const createdBilling = await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          lineForBilling,
          periodStartRaw,
          periodEndCharge,
          userId,
          {
            includeServices,
            notes: payload.notes || (
              returnedQuantity >= targetItem.quantity
                ? "Fechamento por devolução"
                : "Fechamento por devolução parcial"
            ),
            status: "approved",
            additionalAmount: reqItem.additionalAmount,
            additionalAmountReason: reqItem.additionalAmountReason,
          },
        );

        const expectedKey = partialSplit ? buildRentalLineKey(lineForBilling) : "";
        const billedKey =
          partialSplit && expectedKey
            ? expectedKey
            : buildRentalLineKey(lineForBilling);
        const billingRow =
          (createdBilling.items || []).find((row: any) => {
            const rk = String(row.rentalLineKey || "");
            return rk !== "" && rk === billedKey;
          }) ||
          (createdBilling.items || []).find((row: any) => {
            const sameItem =
              String(row.itemId) === String(targetItem.itemId);
            const sameUnit = targetItem.unitId
              ? row.unitId === targetItem.unitId
              : !row.unitId;
            return sameItem && sameUnit;
          });

        if (returnedQuantity >= targetItem.quantity) {
          targetItem.returnActual = storeReturnActual;
          targetItem.returnScheduled = storeReturnActual;
          targetItem.retroactiveOpenBilling = false;
          targetItem.lastBillingDate = storeReturnActual;
          targetItem.nextBillingDate = undefined;
          if (reqItem.billingRentalType) {
            targetItem.rentalType = reqItem.billingRentalType;
          }
          if (billingRow) {
            targetItem.unitPrice = Number(billingRow.unitPrice);
            targetItem.subtotal = Number(
              createdBilling.calculation?.total ?? billingRow.subtotal,
            );
          } else if (createdBilling.calculation?.total) {
            targetItem.subtotal = Number(createdBilling.calculation.total);
          }
          if (informativeNorm) {
            targetItem.informativeReturnDate = informativeNorm;
          }
        } else {
          const returnedLine: any = {
            ...plainItem,
            _id: undefined,
            lineId: splitReturnedLineId,
            pickupScheduled: plainItem.pickupScheduled,
            returnScheduled: periodEndCharge,
            quantity: returnedQuantity,
            rentalType:
              reqItem.billingRentalType || plainItem.rentalType || "daily",
            unitPrice: billingRow ? Number(billingRow.unitPrice) : plainItem.unitPrice,
            subtotal: billingRow
              ? Number(createdBilling.calculation?.total ?? billingRow.subtotal)
              : this.computeItemPartialSubtotal(
                  {
                    ...(targetItem as any),
                    rentalType:
                      (reqItem.billingRentalType ||
                        targetItem.rentalType ||
                        "daily") as RentalType,
                  },
                  periodStartRaw,
                  periodEndCharge,
                  returnedQuantity,
                ),
            returnActual: storeReturnActual,
            retroactiveOpenBilling: false,
            lastBillingDate: storeReturnActual,
            nextBillingDate: undefined,
          };
          if (informativeNorm) {
            returnedLine.informativeReturnDate = informativeNorm;
          }
          rental.items.push(returnedLine);

          const remainderType =
            (reqItem.remainderRentalType ||
              targetItem.rentalType ||
              plainItem.rentalType ||
              "daily") as RentalType;
          const remainderOverride = Number(plainItem.periodRateOverride ?? 0);
          if (reqItem.remainderRentalType && remainderOverride <= 0) {
            this.assertConfiguredRateForRentalType(
              invForLine,
              reqItem.remainderRentalType,
            );
          }
          const remainderPricing =
            remainderOverride > 0
              ? applyPeriodRateOverride(
                  invForLine.pricing,
                  remainderType,
                  remainderOverride,
                )
              : invForLine.pricing;
          const { rate: remainderRate, message: remainderMsg } =
            periodRateFromInventory(remainderPricing, remainderType);
          if (remainderRate <= 0) {
            throw badRequest(
              remainderMsg ||
                "Cadastre no equipamento o valor da cobrança do saldo (tipo do contrato restante).",
            );
          }

          const prevQty = plainItem.quantity;
          const pickupContinued = this.normalizeDate(
            new Date(plainItem.pickupScheduled),
          );
          const oldLineId =
            typeof targetItem.lineId === "string" ? targetItem.lineId : "";
          const partnerReleased = Math.max(
            0,
            returnedQuantity - ownQtyOnLine,
          );
          const remainingPartner = Math.max(
            0,
            partnerQtyOnLine - partnerReleased,
          );
          targetItem.lineId = splitRemainderLineId;
          /** Mesma retirada civil; cobrança do saldo começa após o fim do trecho devolvido parcialmente. */
          targetItem.pickupScheduled = pickupContinued;
          targetItem.quantity = prevQty - returnedQuantity;
          if (remainingPartner > 0 && plainItem.partnerSupply?.partnerId) {
            targetItem.partnerSupply = {
              partnerId: plainItem.partnerSupply.partnerId,
              quantity: remainingPartner,
              agreedCost: plainItem.partnerSupply.agreedCost,
              notes: plainItem.partnerSupply.notes,
            };
          } else {
            targetItem.partnerSupply = undefined;
          }
          if (oldLineId && splitRemainderLineId) {
            await partnerService.reassignLoanLineId(
              companyId,
              String(rental._id),
              oldLineId,
              splitRemainderLineId,
            );
          }
          targetItem.rentalType = remainderType;
          targetItem.unitPrice = remainderRate;
          if (remainderOverride > 0) {
            targetItem.periodRateOverride = remainderOverride;
          }
          targetItem.retroactiveOpenBilling = false;
          targetItem.lastBillingDate =
            billingRt === "daily"
              ? storeReturnActual
              : this.normalizeDate(periodEndCharge);
          targetItem.nextBillingDate = this.getPeriodEnd(
            this.addDays(this.normalizeDate(periodEndCharge), 1),
            remainderType,
          );
          targetItem.subtotal = Number(
            ((Number(plainItem.subtotal || 0) * targetItem.quantity) / prevQty).toFixed(2),
          );
        }
      }

      if (inventoryReturnQty > 0) {
        await this.updateItemQuantityForRental(
          companyId,
          targetItem.itemId as any,
          inventoryReturnQty,
          "return",
          userId,
          rental._id,
          targetItem.unitId,
          rental.customerId.toString(),
        );
      }
    }

    if (payload.notes) {
      rental.notes = [rental.notes, `[Devolução] ${payload.notes}`]
        .filter(Boolean)
        .join("\n");
    }

    const allReturned = rental.items.every((item) => item.returnActual);
    if (allReturned) {
      rental.status = "ready_to_close";
      const latestReturn = rental.items.reduce<Date | null>((acc, item) => {
        if (!item.returnActual) return acc;
        const t = new Date(item.returnActual);
        if (!acc || t.getTime() > acc.getTime()) return t;
        return acc;
      }, null);
      rental.dates.returnActual = latestReturn ?? returnAt;
    }

    await this.recalcPricingForRental(rental, companyId);
    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);

    const updated = await Rental.findOne({ _id: rentalId, companyId });
    return updated || rental;
  }

  private findReturnedRentalLineForCorrection(
    rental: IRental,
    patch: { itemId: string; unitId?: string; lineId?: string },
  ): IRentalItem {
    const id = String(patch.itemId).trim();
    const unit =
      patch.unitId != null && String(patch.unitId).trim() !== ""
        ? String(patch.unitId).trim()
        : undefined;

    const candidates = (rental.items || []).filter((i) => {
      if (!i.returnActual) return false;
      const iid = asIdString(i.itemId);
      if (iid !== id) return false;
      if (unit !== undefined) return String(i.unitId || "").trim() === unit;
      return !i.unitId;
    });

    const want =
      typeof patch.lineId === "string" && patch.lineId.trim().length > 0
        ? patch.lineId.trim()
        : undefined;
    if (want) {
      const hit = candidates.find(
        (i) =>
          typeof i.lineId === "string" && String(i.lineId).trim() === want,
      );
      if (!hit) {
        throw badRequest("Segmento devolvido não encontrado para correção.");
      }
      return hit;
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) {
      throw badRequest("Nenhuma devolução registrada encontrada para este item.");
    }
    throw badRequest(
      "Há mais de um segmento devolvido deste equipamento. Informe lineId.",
    );
  }

  private findOpenRemainderSibling(
    rental: IRental,
    returnedLine: IRentalItem,
  ): IRentalItem | undefined {
    const itemId = asIdString(returnedLine.itemId);
    const pickupNorm = this.normalizeDate(
      new Date(returnedLine.pickupScheduled || rental.dates.pickupScheduled),
    );
    const unit =
      returnedLine.unitId != null && String(returnedLine.unitId).trim() !== ""
        ? String(returnedLine.unitId).trim()
        : undefined;

    return (rental.items || []).find((i) => {
      if (i.returnActual) return false;
      if (asIdString(i.itemId) !== itemId) return false;
      if (unit !== undefined) {
        if (String(i.unitId || "").trim() !== unit) return false;
      } else if (i.unitId) {
        return false;
      }
      const p = this.normalizeDate(
        new Date(i.pickupScheduled || rental.dates.pickupScheduled),
      );
      return p.getTime() === pickupNorm.getTime();
    });
  }

  private async assertReturnCorrectionNotLocked(
    companyId: string,
    rentalId: mongoose.Types.ObjectId,
    line: IRentalItem,
  ): Promise<void> {
    const snapKey = buildRentalLineKey(line as any);
    const lockedEnd = await this.getLatestLockedItemBillingEnd(
      companyId,
      rentalId,
      line.itemId,
      line.unitId,
      snapKey,
    );
    if (lockedEnd) {
      throw badRequest(
        "Não é possível corrigir: existe fechamento quitado ou com baixa vinculada a esta devolução.",
      );
    }
  }

  private refreshRentalStatusAfterReturnCorrection(rental: IRental): void {
    const allReturned = (rental.items || []).every((i) => i.returnActual);
    if (!allReturned) {
      if (rental.status === "ready_to_close") {
        rental.status = "active";
      }
      rental.dates.returnActual = undefined;
      return;
    }

    const maxReturn = rental.items.reduce<Date | null>((acc, item) => {
      if (!item.returnActual) return acc;
      const t = new Date(item.returnActual);
      if (!acc || t.getTime() > acc.getTime()) return t;
      return acc;
    }, null);
    if (maxReturn) {
      rental.dates.returnActual = maxReturn;
    }
    if (rental.status === "active" || rental.status === "overdue") {
      rental.status = "ready_to_close";
    }
  }

  private recalcRentalPricingTotalsFromItems(rental: IRental): void {
    let equipmentSubtotal = 0;
    for (const item of rental.items || []) {
      equipmentSubtotal += Number(item.subtotal || 0);
    }
    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + Number(s.subtotal || 0), 0) ||
      0;
    rental.pricing.equipmentSubtotal = Number(equipmentSubtotal.toFixed(2));
    rental.pricing.subtotal = Number(
      (equipmentSubtotal + servicesSubtotal).toFixed(2),
    );
    rental.pricing.total = Number(
      Math.max(
        0,
        rental.pricing.subtotal -
          (rental.pricing.discount || 0) +
          (rental.pricing.lateFee || 0),
      ).toFixed(2),
    );
  }

  /**
   * Admin: corrige data de cobrança, quantidade ou tipo de uma devolução já registrada.
   */
  async correctRentalItemReturn(
    companyId: string,
    rentalId: string,
    userId: string,
    payload: {
      itemId: string;
      unitId?: string;
      lineId?: string;
      returnDate?: Date;
      informativeReturnDate?: Date;
      correctedQuantity?: number;
      billingRentalType?: RentalType;
      additionalAmount?: number;
      additionalAmountReason?: string;
      notes?: string;
    },
  ): Promise<IRental> {
    const user = await User.findById(userId);
    if (!user) throw notFound("Usuário não encontrado");
    if (!canUpdateRentalStatus(user.role as RoleType)) {
      throw forbidden("Somente administradores podem corrigir devoluções.");
    }

    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) throw notFound("Aluguel não encontrado");
    if (rental.status === "completed" || rental.status === "cancelled") {
      throw badRequest(
        "Não é possível corrigir devoluções de aluguel finalizado ou cancelado.",
      );
    }

    const returnedLine = this.findReturnedRentalLineForCorrection(rental, {
      itemId: payload.itemId,
      unitId: payload.unitId,
      lineId: payload.lineId,
    });

    await this.assertReturnCorrectionNotLocked(
      companyId,
      rental._id,
      returnedLine,
    );

    const lineSnapshot = this.snapshotReturnedLineForBilling(returnedLine);
    const oldReturnAt = new Date(returnedLine.returnActual!);

    const inventoryItem = await Item.findOne({
      _id: returnedLine.itemId,
      companyId,
    });
    if (!inventoryItem) throw notFound("Item do inventário não encontrado");

    const isUnit = inventoryItem.trackingType === "unit";
    const oldQty = Number(returnedLine.quantity || 1);
    const newQty =
      payload.correctedQuantity !== undefined
        ? Math.max(1, Math.floor(payload.correctedQuantity))
        : oldQty;

    if (isUnit && newQty !== 1) {
      throw badRequest("Itens por unidade só podem ter quantidade 1.");
    }

    const billingRt = (payload.billingRentalType ||
      returnedLine.rentalType ||
      "daily") as RentalType;

    if (
      payload.billingRentalType &&
      !this.isLoanLine(returnedLine) &&
      !(
        Number(returnedLine.periodRateOverride ?? 0) > 0 &&
        payload.billingRentalType ===
          ((returnedLine.rentalType || "daily") as RentalType)
      )
    ) {
      this.assertConfiguredRateForRentalType(inventoryItem, billingRt);
    }

    const oldReturnAtForBilling = oldReturnAt;
    const newReturnAt = payload.returnDate
      ? new Date(payload.returnDate)
      : oldReturnAtForBilling;
    const newReturnNorm =
      billingRt === "daily" ? newReturnAt : this.normalizeDate(newReturnAt);

    const pickupRaw = new Date(
      returnedLine.pickupScheduled || rental.dates.pickupScheduled,
    );
    const pickupBase =
      billingRt === "daily" ? pickupRaw : this.normalizeDate(pickupRaw);

    if (newReturnNorm.getTime() < pickupBase.getTime()) {
      throw badRequest(
        "A data de devolução deve ser posterior à data de retirada.",
      );
    }

    const remainder = this.findOpenRemainderSibling(rental, returnedLine);
    const customerIdStr = rental.customerId.toString();

    if (newQty !== oldQty) {
      if (isUnit) {
        throw badRequest("Não é possível alterar a quantidade de item unitário.");
      }

      const delta = newQty - oldQty;

      if (remainder) {
        const segmentTotal = oldQty + Number(remainder.quantity || 0);
        if (newQty > segmentTotal) {
          throw badRequest(
            `Quantidade corrigida não pode exceder ${segmentTotal} (total deste segmento).`,
          );
        }
        const newRemainderQty = segmentTotal - newQty;

        if (delta > 0) {
          await this.updateItemQuantityForRental(
            companyId,
            returnedLine.itemId as mongoose.Types.ObjectId,
            delta,
            "return",
            userId,
            rental._id,
            returnedLine.unitId,
            customerIdStr,
          );
        } else if (delta < 0) {
          const absDelta = -delta;
          await this.updateItemQuantityForRental(
            companyId,
            returnedLine.itemId as mongoose.Types.ObjectId,
            absDelta,
            "reserve",
            userId,
            rental._id,
            undefined,
            customerIdStr,
          );
          await this.updateItemQuantityForRental(
            companyId,
            returnedLine.itemId as mongoose.Types.ObjectId,
            absDelta,
            "activate",
            userId,
            rental._id,
            undefined,
            customerIdStr,
          );
        }

        if (newRemainderQty >= 1) {
          remainder.quantity = newRemainderQty;
          const prevSeg = segmentTotal;
          if (!this.isLoanLine(remainder) && prevSeg > 0) {
            remainder.subtotal = Number(
              (
                (Number(remainder.subtotal || 0) * newRemainderQty) /
                prevSeg
              ).toFixed(2),
            );
          }
        } else {
          rental.items = (rental.items || []).filter((i) => i !== remainder);
        }
        returnedLine.quantity = newQty;
      } else {
        if (delta > 0) {
          throw badRequest(
            "Para aumentar a quantidade devolvida é necessário existir saldo em aberto no mesmo segmento.",
          );
        }
        if (delta < 0) {
          const reopenQty = -delta;
          const rentalType = (returnedLine.rentalType || "daily") as RentalType;
          const pricingEnd =
            returnedLine.returnScheduled ||
            this.getPricingEndDate(pickupRaw, rentalType);
          let unitPrice = Number(returnedLine.unitPrice || 0);
          if (!this.isLoanLine(returnedLine)) {
            unitPrice = this.calculateRentalPrice(
              inventoryItem.pricing,
              pickupRaw,
              new Date(pricingEnd),
              rentalType,
            );
          }
          rental.items.push({
            itemId: returnedLine.itemId,
            lineId: randomUUID(),
            unitId: returnedLine.unitId,
            quantity: reopenQty,
            unitPrice: this.isLoanLine(returnedLine) ? 0 : unitPrice,
            rentalType,
            pickupScheduled: returnedLine.pickupScheduled,
            returnScheduled: pricingEnd,
            subtotal: this.isLoanLine(returnedLine)
              ? 0
              : unitPrice * reopenQty,
            isLoan: returnedLine.isLoan,
          } as IRentalItem);
          await this.reserveThenActivateNewRentalLine(
            companyId,
            rental,
            returnedLine.itemId as mongoose.Types.ObjectId,
            reopenQty,
            returnedLine.unitId,
            userId,
          );
          returnedLine.quantity = newQty;
        }
      }
    }

    if (payload.billingRentalType) {
      (returnedLine as any).contractRentalType =
        returnedLine.rentalType || "daily";
      returnedLine.rentalType = billingRt;
    }
    returnedLine.returnActual = newReturnNorm;
    returnedLine.returnScheduled = newReturnNorm;
    if (payload.informativeReturnDate != null) {
      returnedLine.informativeReturnDate = this.normalizeDate(
        payload.informativeReturnDate,
      );
    } else if (payload.informativeReturnDate === undefined) {
      /* mantém valor atual */
    }

    await this.deleteReturnClosureBillingsForCorrection(
      companyId,
      rental._id,
      rental,
      lineSnapshot,
      oldReturnAtForBilling,
    );

    const isLoan = this.isLoanLine(returnedLine);
    if (!isLoan) {
      const chargeReturnAt = billingRt === "daily" ? newReturnAt : newReturnNorm;
      const { periodStartRaw, periodEndCharge } = this.resolveReturnChargePeriod(
        returnedLine,
        rental,
        chargeReturnAt,
        billingRt,
      );
      const newLineKey = buildRentalLineKey(returnedLine as any);

      if (periodEndCharge.getTime() >= periodStartRaw.getTime()) {
        const createdBilling =
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            returnedLine,
            periodStartRaw,
            periodEndCharge,
            userId,
            {
              includeServices: false,
              notes: payload.notes || "Correção de devolução",
              status: "approved",
              additionalAmount: payload.additionalAmount,
              additionalAmountReason: payload.additionalAmountReason,
            },
          );

        const billingRow =
          (createdBilling.items || []).find((row: any) => {
            const rk = String(row.rentalLineKey || "");
            return rk !== "" && rk === newLineKey;
          }) ||
          (createdBilling.items || []).find((row: any) => {
            const sameItem =
              String(row.itemId) === String(returnedLine.itemId);
            const sameUnit = returnedLine.unitId
              ? row.unitId === returnedLine.unitId
              : !row.unitId;
            return sameItem && sameUnit;
          });

        returnedLine.unitPrice = Number(
          billingRow?.unitPrice ?? returnedLine.unitPrice ?? 0,
        );
        returnedLine.subtotal = Number(
          createdBilling.calculation?.total ??
            billingRow?.subtotal ??
            createdBilling.calculation?.baseAmount ??
            0,
        );
        returnedLine.lastBillingDate =
          billingRt === "daily"
            ? periodEndCharge
            : this.normalizeDate(periodEndCharge);
        returnedLine.nextBillingDate = undefined;
      }

      const usedDays = calculateBillingPeriod(
        periodStartRaw,
        chargeReturnAt,
        billingRt,
      ).daysPassed;
      returnedLine.usedDays = Math.max(1, usedDays);
    } else {
      returnedLine.unitPrice = 0;
      returnedLine.subtotal = 0;
      returnedLine.lastBillingDate = newReturnNorm;
      returnedLine.nextBillingDate = undefined;
    }

    this.refreshRentalStatusAfterReturnCorrection(rental);
    this.recalcRentalPricingTotalsFromItems(rental);

    await this.addChangeHistory(
      rental,
      "return_correction",
      JSON.stringify({
        itemId: payload.itemId,
        lineId: returnedLine.lineId,
        oldQuantity: oldQty,
        oldReturn: oldReturnAt,
      }),
      JSON.stringify({
        quantity: returnedLine.quantity,
        returnActual: returnedLine.returnActual,
        rentalType: returnedLine.rentalType,
      }),
      userId,
      payload.notes,
    );

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);

    const updated = await Rental.findOne({ _id: rentalId, companyId });
    return updated || rental;
  }

  /**
   * Confirma o fechamento final do aluguel (transição de ready_to_close → completed)
   * Deve ser chamado quando o usuário confirmar o fechamento após todos os itens serem devolvidos
   */
  async confirmRentalClosure(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    if (rental.status !== "ready_to_close") {
      throw badRequest(
        `Apenas aluguéis em status "Pronto para fechar" podem ser finalizados. Status atual: ${rental.status}`,
      );
    }

    // Verifica se todos os itens foram realmente devolvidos
    const notReturned = rental.items.filter((item) => !item.returnActual);
    if (notReturned.length > 0) {
      throw badRequest(
        `Não é possível finalizar: ${notReturned.length} item(ns) ainda não foi/foram devolvido(s)`,
      );
    }

    // Aplica a transição de status usando o método padrão
    await this.applyStatusChangeDirect(
      rental,
      "ready_to_close",
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  /**
   * Garante fechamento inicial + rascunho do próximo período para aluguéis reservados (todos os itens).
   */
  private async ensureReservedRentalBillings(
    companyId: string,
    rental: IRental,
    userId: string,
  ): Promise<{ created: number }> {
    let created = 0;
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }
      if (item.returnActual) {
        continue;
      }
      if (this.isLoanLine(item)) {
        continue;
      }
      const rt = item.rentalType || "daily";
      const itemFilter: Record<string, unknown> = {
        companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        rentalType: rt,
        "items.rentalLineKey": buildRentalLineKey(item as any),
      };
      if (item.unitId) {
        itemFilter["items.unitId"] = item.unitId;
      }

      const periodStart = this.normalizeDate(item.pickupScheduled);
      let periodEnd = this.getPeriodEnd(periodStart, rt);
      const itemReturn = item.returnScheduled
        ? this.normalizeDate(item.returnScheduled)
        : undefined;
      if (itemReturn && itemReturn < periodEnd) {
        periodEnd = itemReturn;
      }

      const ps = this.normalizeDate(periodStart);
      const pe = this.normalizeDate(periodEnd);

      const existingFirst = await Billing.findOne({
        ...itemFilter,
        periodStart: ps,
        periodEnd: pe,
      }).lean();

      if (!existingFirst) {
        await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          item,
          ps,
          pe,
          userId,
          {
            includeServices: includeServicesAvailable,
            notes: "Fechamento inicial",
            status: "approved",
          },
        );
        includeServicesAvailable = false;
        created += 1;
      }

      item.lastBillingDate = pe;
      const nextStart = this.addDays(pe, 1);
      if (!itemReturn || itemReturn >= nextStart) {
        const nextEnd = this.getPeriodEnd(nextStart, rt);
        item.nextBillingDate = nextEnd;

        const ns = this.normalizeDate(nextStart);
        const ne = this.normalizeDate(nextEnd);

        const existingDraft = await Billing.findOne({
          ...itemFilter,
          periodStart: ns,
          periodEnd: ne,
        }).lean();

        if (!existingDraft) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            ns,
            ne,
            userId,
            {
              includeServices: false,
              notes: "Fechamento previsto",
              status: "draft",
            },
          );
          created += 1;
        }
      }
    }

    await rental.save();
    return { created };
  }

  private async saveRentalAfterBillingSideEffects(
    rental: IRental,
  ): Promise<void> {
    if (!rental.isModified()) {
      return;
    }
    try {
      await rental.save();
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      if (name !== "VersionError") {
        throw err;
      }
      const fresh = await Rental.findById(rental._id);
      if (!fresh) {
        return;
      }
      for (const path of rental.modifiedPaths()) {
        fresh.set(path, rental.get(path));
      }
      if (fresh.isModified()) {
        await fresh.save();
      }
    }
  }

  /**
   * Cria fechamentos em falta e atualiza valores dos fechamentos em aberto conforme o aluguel atual.
   */
  async syncBillingsAfterRentalChange(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<{
    created: number;
    draftsCreated: number;
    refreshed: number;
  }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }
    if (rental.status === "completed" || rental.status === "cancelled") {
      return { created: 0, draftsCreated: 0, refreshed: 0 };
    }

    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    let created = 0;
    let draftsCreated = 0;

    if (rental.status === "reserved") {
      const r = await this.ensureReservedRentalBillings(
        companyId,
        rental,
        userId,
      );
      created += r.created;
    } else if (rental.status === "active" || rental.status === "overdue") {
      const r = await this.processDueBillings(companyId, rentalId, userId);
      created += r.created;
      draftsCreated += r.draftsCreated;
      const latest =
        (await Rental.findOne({ _id: rentalId, companyId })) || rental;
      await this.createFinalBillingIfNeeded(latest, userId);
      await this.saveRentalAfterBillingSideEffects(latest);
    } else if (rental.status === "ready_to_close") {
      await this.createFinalBillingIfNeeded(rental, userId);
      await this.saveRentalAfterBillingSideEffects(rental);
    }

    let refreshed = 0;
    const openBillings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $nin: ["paid", "cancelled"] },
    }).select("_id");

    for (const b of openBillings) {
      try {
        await billingService.refreshBillingFromRental(
          companyId,
          String(b._id),
        );
        refreshed += 1;
      } catch (err) {
        console.warn(
          `[syncBillings] Não foi possível atualizar fechamento ${String(b._id)}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const serviceBilling = await billingService.ensureServiceBillingForRental(
      companyId,
      rentalId,
      userId,
    );
    if (serviceBilling) {
      created += 1;
    }

    return { created, draftsCreated, refreshed };
  }

  /**
   * Para aluguéis sem nenhum fechamento: gera fechamentos e alinha totais.
   */
  async syncMissingBillingsForCompany(
    companyId: string,
    userId: string,
  ): Promise<{
    rentalsProcessed: number;
    created: number;
    draftsCreated: number;
    refreshed: number;
  }> {
    const statuses: RentalStatus[] = [
      "reserved",
      "active",
      "overdue",
      "ready_to_close",
    ];
    const rentals = await Rental.find({
      companyId,
      status: { $in: statuses },
    })
      .select("_id")
      .lean();

    let rentalsProcessed = 0;
    let created = 0;
    let draftsCreated = 0;
    let refreshed = 0;

    for (const r of rentals) {
      const hasBilling = await Billing.exists({
        companyId,
        rentalId: r._id,
      });
      if (hasBilling) {
        continue;
      }

      const sync = await this.syncBillingsAfterRentalChange(
        companyId,
        String(r._id),
        userId,
      );
      created += sync.created;
      draftsCreated += sync.draftsCreated;
      refreshed += sync.refreshed;
      rentalsProcessed += 1;
    }

    return { rentalsProcessed, created, draftsCreated, refreshed };
  }

  /**
   * Processa fechamentos periódicos para um aluguel ativo
   */
  async processDueBillings(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<{
    created: number;
    draftsCreated: number;
    skipReason?: "rental_not_active";
  }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Aluguel não encontrado");
    }

    if (rental.status !== "active" && rental.status !== "overdue") {
      return { created: 0, draftsCreated: 0, skipReason: "rental_not_active" };
    }

    await this.removeObsoleteUnpaidBillingsForCurrentRental(companyId, rental);

    const now = this.normalizeDate(new Date());
    let createdCount = 0;
    let draftsCreated = 0;
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }
      if (this.isLoanLine(item)) {
        continue;
      }
      const cycle: RentalType = item.rentalType || "daily";
      const pickupBase = this.normalizeDate(item.pickupScheduled);
      const horizon = this.getBillingHorizonForItem(item, rental, now);
      const draftCap = this.getContractualReturnForDraft(item, rental);

      const itemFilter: any = {
        companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        rentalType: cycle,
        "items.rentalLineKey": buildRentalLineKey(item as any),
      };
      if (item.unitId) {
        itemFilter["items.unitId"] = item.unitId;
      }

      if (cycle === "daily") {
        const pickupPure = new Date(item.pickupScheduled);
        const pickupBase = this.normalizeDate(item.pickupScheduled);
        const pickupHasTime = !isLocalMidnight(pickupPure);
        const todayNorm = this.normalizeDate(new Date());

        const dailyHorizonRaw = item.returnActual
          ? new Date(item.returnActual)
          : pickupHasTime
            ? new Date()
            : todayNorm;

        const existingOpen = await Billing.findOne({
          ...itemFilter,
          $or: [
            { periodStart: pickupPure },
            ...(pickupHasTime ? [{ periodStart: pickupBase }] : []),
          ],
          status: { $nin: ["paid", "cancelled"] },
        });

        if (dailyHorizonRaw.getTime() > pickupPure.getTime()) {
          if (existingOpen) {
            if (
              existingOpen.periodEnd.getTime() !==
              dailyHorizonRaw.getTime()
            ) {
              existingOpen.periodEnd = dailyHorizonRaw;
              await existingOpen.save();
            }
            await billingService.refreshBillingFromRental(
              companyId,
              String(existingOpen._id),
            );
          } else {
            await billingService.createPeriodicBillingForItem(
              companyId,
              rental,
              item,
              pickupPure,
              dailyHorizonRaw,
              userId,
              {
                includeServices: includeServicesAvailable,
                notes: "Fechamento diário",
              },
            );
            includeServicesAvailable = false;
            createdCount += 1;
          }

          item.lastBillingDate = item.returnActual ? dailyHorizonRaw : undefined;
          item.nextBillingDate = undefined;
        }
        continue;
      }

      let lastBillingDate = item.lastBillingDate
        ? this.normalizeDate(item.lastBillingDate)
        : this.addDays(pickupBase, -1);
      let periodStart = this.addDays(lastBillingDate, 1);
      let expectedNextBillingDate = this.getPeriodEnd(periodStart, cycle);
      let nextBillingDate = item.nextBillingDate
        ? this.normalizeDate(item.nextBillingDate)
        : expectedNextBillingDate;
      if (
        nextBillingDate < periodStart ||
        nextBillingDate > expectedNextBillingDate
      ) {
        nextBillingDate = expectedNextBillingDate;
        item.nextBillingDate = expectedNextBillingDate;
      }

      while (nextBillingDate <= now && nextBillingDate <= horizon) {
        const existing = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existing) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: includeServicesAvailable,
              notes: "Fechamento periódico automático",
            },
          );
          includeServicesAvailable = false;
          createdCount += 1;
        } else {
          await billingService.refreshBillingFromRental(
            companyId,
            String(existing._id),
          );
        }

        item.lastBillingDate = this.normalizeDate(nextBillingDate);
        periodStart = this.addDays(nextBillingDate, 1);
        expectedNextBillingDate = this.getPeriodEnd(periodStart, cycle);
        item.nextBillingDate = expectedNextBillingDate;
        nextBillingDate = item.nextBillingDate;
      }

      /**
       * Quando a devolução (ou “hoje”) é anterior ao fim do próximo ciclo teórico, o loop acima não
       * chega a gerar período integral — exemplo: quinzena de 01/04 a devolução 07/04 com fim téorico em 15/04.
       * Gera fechamento aprovado do trecho até o cap somente quando faz sentido fechar caixa (devolução real,
       * devolução prevista já atingida, ou cobrança retroativa em atraso). Com contrato ainda vigente
       * (devolução futura), não antecipa faturamento parcial — evita duplicar o mesmo mês/quinzena com o rascunho do ciclo cheio.
       */
      const capNormalized = this.normalizeDate(horizon);
      const retroOverdueBillingToToday =
        !!item.retroactiveOpenBilling &&
        draftCap !== null &&
        draftCap.getTime() < now.getTime();
      const skipTailApprovedOpenContract =
        !item.returnActual &&
        draftCap !== null &&
        capNormalized.getTime() < draftCap.getTime() &&
        !retroOverdueBillingToToday;

      const tailStartNorm = this.normalizeDate(periodStart);
      const nextFullNormForTail = this.normalizeDate(nextBillingDate);
      /**
       * Evita “fatiar” o ciclo atual até hoje (ex.: 11/05→14/05) quando o fechamento do ciclo cheio
       * (ex.: 11/05→17/05 semanal) ainda não terminou; mantém um único fechamento com o período inteiro.
       * Também aplica com retroactiveOpenBilling — o corte em “hoje” não substitui a semana/quinzena cheia.
       */
      const skipTailTruncatesNextDraft =
        !item.returnActual &&
        capNormalized.getTime() === now.getTime() &&
        nextFullNormForTail.getTime() > now.getTime() &&
        tailStartNorm.getTime() < nextFullNormForTail.getTime();

      if (
        !skipTailApprovedOpenContract &&
        !skipTailTruncatesNextDraft &&
        tailStartNorm.getTime() <= capNormalized.getTime() &&
        tailStartNorm.getTime() < capNormalized.getTime()
      ) {
        const nextFullNorm = this.normalizeDate(nextBillingDate);
        if (capNormalized.getTime() <= nextFullNorm.getTime()) {
          const tailExisting = await Billing.findOne({
            ...itemFilter,
            periodStart: tailStartNorm,
            periodEnd: capNormalized,
            status: { $nin: ["paid", "cancelled"] },
          }).lean();

          if (!tailExisting) {
            await billingService.createPeriodicBillingForItem(
              companyId,
              rental,
              item,
              tailStartNorm,
              capNormalized,
              userId,
              {
                includeServices: includeServicesAvailable,
                notes: item.returnActual
                  ? "Fechamento período até devolução"
                  : "Fechamento até a data atual",
              },
            );
            includeServicesAvailable = false;
            createdCount += 1;
          } else {
            await billingService.refreshBillingFromRental(
              companyId,
              String(tailExisting._id),
            );
          }

          item.lastBillingDate = capNormalized;
          if (!item.returnActual) {
            const dayAfterCap = this.addDays(capNormalized, 1);
            periodStart = dayAfterCap;
            expectedNextBillingDate = this.getPeriodEnd(periodStart, cycle);
            nextBillingDate = expectedNextBillingDate;
            item.nextBillingDate = expectedNextBillingDate;
          } else {
            item.nextBillingDate = undefined;
          }
        }
      }

      /** Próximo ciclo em rascunho: equipamento ainda em campo — previsto mesmo se o início do período for após a data prevista no contrato (atraso / ciclo maior). */
      if (!item.returnActual && nextBillingDate > now) {
        const existingFuture = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existingFuture) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: false,
              notes: "Fechamento previsto",
              status: "draft",
            },
          );
          draftsCreated += 1;
        } else {
          await billingService.refreshBillingFromRental(
            companyId,
            String(existingFuture._id),
          );
        }
      }
    }

    await this.saveRentalAfterBillingSideEffects(rental);

    const refreshableBillings = await Billing.find({
      companyId,
      rentalId: rental._id,
      status: { $nin: ["paid", "cancelled"] },
    }).select("_id");

    for (const billing of refreshableBillings) {
      try {
        await billingService.refreshBillingFromRental(
          companyId,
          String(billing._id),
        );
      } catch {
        /* Mantém o processamento dos demais fechamentos mesmo se um deles não puder ser recalculado. */
      }
    }

    return { created: createdCount, draftsCreated };
  }

  /**
   * Get all rentals with filters
   */
  async getRentals(
    companyId: string,
    filters: {
      status?: RentalStatus;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    rentals: IRental[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query: any = { companyId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.startDate || filters.endDate) {
      query.$or = [
        {
          "dates.pickupScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
        {
          "dates.returnScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
      ];
    }

    if (filters.search) {
      const search = accentInsensitiveRegexFilter(filters.search);
      query.$or = [
        { rentalNumber: search },
        { notes: search },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [rentals, total] = await Promise.all([
      Rental.find(query)
        .populate("customerId", "name cpfCnpj email phone")
        .populate("items.itemId", "name sku pricing")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Rental.countDocuments(query),
    ]);

    return { rentals, total, page, limit };
  }

  /**
   * Get rental by ID
   */
  async getRentalById(
    companyId: string,
    rentalId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId", "name cpfCnpj email phone addresses")
      .populate(
        "items.itemId",
        "name sku pricing photos trackingType units",
      )
      .populate("items.partnerSupply.partnerId", "name")
      .populate("createdBy", "name email")
      .populate("checklistPickup.completedBy", "name email")
      .populate("checklistReturn.completedBy", "name email");
    if (rental) {
      await this.recalcPricingForRental(rental as IRental, companyId);
    }
    return rental;
  }

  /**
   * Tabela IV do PDF do contrato: tarifa do período × quantidade × períodos
   * cobráveis nas datas da linha. Respeita periodRateOverride do contrato.
   */
  private resolveCommercialRowForPdf(
    ritem: any,
    rental: any,
  ): { periodLabel: string; tariffShown: number; lineTotal: number } {
    if (this.isLoanLine(ritem)) {
      const fmtDate = (d: Date | string | undefined) =>
        d ? new Date(d).toLocaleDateString("pt-BR") : "—";
      const pickup = ritem.pickupScheduled ? fmtDate(ritem.pickupScheduled) : "";
      const ret = ritem.returnScheduled ? fmtDate(ritem.returnScheduled) : "";
      const periodLabel =
        pickup && ret
          ? `${pickup} a ${ret}`
          : this.rentalTypeLabelForPdf(ritem.rentalType || "daily");
      return { periodLabel, tariffShown: 0, lineTotal: 0 };
    }

    const inv = ritem.itemId;

    const fmtDate = (d: Date | string | undefined) =>
      d ? new Date(d).toLocaleDateString("pt-BR") : "—";

    const pickup = ritem.pickupScheduled ? fmtDate(ritem.pickupScheduled) : "";
    const ret = ritem.returnScheduled ? fmtDate(ritem.returnScheduled) : "";
    const periodLabel =
      pickup && ret
        ? `${pickup} a ${ret}`
        : this.rentalTypeLabelForPdf(ritem.rentalType || "daily");

    const inventoryPricing =
      inv && typeof inv === "object" && inv.pricing ? inv.pricing : null;
    const rt = (ritem.rentalType || "daily") as RentalType;
    const qty = Number(ritem.quantity || 1);
    const override = Number(ritem.periodRateOverride ?? 0);

    if (!inventoryPricing && override <= 0) {
      return {
        periodLabel,
        tariffShown: Number(ritem.unitPrice ?? 0),
        lineTotal: Number(
          ritem.subtotal ?? qty * Number(ritem.unitPrice ?? 0),
        ),
      };
    }

    const pickupDt = new Date(
      ritem.pickupScheduled || rental.dates?.pickupScheduled,
    );
    const endSrc =
      ritem.returnActual ??
      ritem.returnScheduled ??
      rental.dates?.returnScheduled ??
      pickupDt;
    const endDt = new Date(endSrc);

    try {
      const pricingForLine =
        override > 0
          ? applyPeriodRateOverride(inventoryPricing || {}, rt, override)
          : inventoryPricing || {};
      const pc = calculateBillingPeriod(pickupDt, endDt, rt);
      const lineUnit = calculateRentalLineAmount(pricingForLine, rt, pc).amount;
      const tariff =
        override > 0
          ? override
          : periodRateFromInventory(pricingForLine, rt).rate;
      return {
        periodLabel,
        tariffShown: Number(tariff.toFixed(2)),
        lineTotal: Number((lineUnit * qty).toFixed(2)),
      };
    } catch {
      const fallbackTariff =
        override > 0 ? override : Number(ritem.unitPrice ?? 0);
      return {
        periodLabel,
        tariffShown: fallbackTariff,
        lineTotal: Number(
          ritem.subtotal ?? qty * fallbackTariff,
        ),
      };
    }
  }

  private rentalTypeLabelForPdf(rt: RentalType | string): string {
    const m: Record<string, string> = {
      daily: "Diária",
      weekly: "Semanal",
      biweekly: "Quinzenal",
      monthly: "Mensal",
    };
    return m[String(rt)] || String(rt);
  }

  async generateRentalPDF(
    companyId: string,
    rentalId: string,
  ): Promise<Buffer> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId")
      .populate("items.itemId")
      .populate("companyId")
      .populate("createdBy", "name");

    if (!rental) {
      throw notFound("Rental not found");
    }

    const company = rental.companyId as any;
    const customer = rental.customerId as any;
    const createdBy = rental.createdBy as { name?: string } | null;

    const logoCandidates = [
      path.join(__dirname, "../../shared/imagens/alugue.png"),
      path.join(process.cwd(), "src/shared/imagens/alugue.png"),
      path.join(process.cwd(), "backend/src/shared/imagens/alugue.png"),
    ];
    const logoPath = logoCandidates.find((p) => fs.existsSync(p));
    const hasLogo = Boolean(logoPath);

    const customerAddresses = customer?.addresses || [];
    const preferredAddress =
      customerAddresses.find((addr: any) => addr.type === "billing") ||
      customerAddresses.find((addr: any) => addr.type === "main") ||
      customerAddresses[0];

    const work = rental.workAddress as IRentalWorkAddress | undefined;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 32, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 595.28;
      const left = 32;
      const right = pageW - 32;
      const contentW = right - left;

      const fmtMoney = formatCurrencyBr;
      const fmtDate = (d: Date | string | undefined) =>
        d ? new Date(d).toLocaleDateString("pt-BR") : "—";

      /** Cabeçalho do contrato físico ALUGUE (fixo no PDF) */
      const CONTRACT_HEADER_CNPJ_FALLBACK = "28.408.479/0001-19";
      const CONTRACT_HEADER_PHONES =
        "(35) 98843-5154 | (35) 99814-0522 | (35) 99761-2424";
      const CONTRACT_HEADER_ADDRESS =
        "Av. Gov. Valadares, 2586 - Jd São Carlos - CEP 37137-254 - Alfenas MG";

      const emission = new Date();

      const drawWatermark = () => {
        doc.save();
        doc.opacity(0.07);
        doc.fillColor("#aaaaaa");
        doc.fontSize(72).font("Helvetica-Bold");
        doc.text("ALUGUE", 130, 380, { lineBreak: false });
        doc.restore();
        doc.opacity(1);
        doc.fillColor("#000000");
      };

      drawWatermark();

      let y = 32;

      if (hasLogo && logoPath) {
        try {
          doc.image(logoPath, left, y, { width: 92 });
        } catch {
          /* ignora logo inválido */
        }
      }

      const headX = hasLogo ? left + 102 : left;
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a");
      doc.text(
        (company?.name || "ALUGUE EQUIPAMENTOS PARA CONSTRUÇÃO CIVIL").toUpperCase(),
        headX,
        y,
        { width: contentW - (hasLogo ? 102 : 0), align: "left" },
      );
      doc.fillColor("#000000");
      doc.font("Helvetica").fontSize(8.5);
      let hy = y + 16;
      const cnpjHeader =
        company?.cnpj?.trim() || CONTRACT_HEADER_CNPJ_FALLBACK;
      doc.text(`PIX    CNPJ: ${cnpjHeader}`, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;
      doc.text(CONTRACT_HEADER_PHONES, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;
      if (company?.email) {
        doc.text(`E-mail: ${company.email}`, headX, hy, {
          width: contentW - (hasLogo ? 102 : 0),
        });
        hy += 11;
      }
      doc.text(CONTRACT_HEADER_ADDRESS, headX, hy, {
        width: contentW - (hasLogo ? 102 : 0),
      });
      hy += 11;

      y = Math.max(y + 78, hy + 8);

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
      doc.text(
        "CONTRATO DE LOCAÇÃO DE BENS MÓVEIS SEM OPERADOR",
        left,
        y,
        { width: contentW, align: "center" },
      );
      y += 22;

      const numStr = rental.rentalNumber || String(rental._id);
      doc.font("Helvetica").fontSize(9);
      doc.fillColor("#c00");
      doc.text(`№  ${numStr}`, right - 120, y - 18, { width: 120, align: "right" });
      doc.fillColor("#000000");

      const metaColW = Math.floor(contentW / 3);
      const metaCol3W = contentW - metaColW * 2;
      doc.text(
        `Data: ${fmtDate(emission)}`,
        left,
        y,
        { width: metaColW },
      );
      doc.text(
        `Retirado/Entregue por: ${rental.pickedUpBy?.trim() || "—"}`,
        left + metaColW,
        y,
        { width: metaColW },
      );
      doc.text(
        `Elaborado por: ${createdBy?.name || "—"}`,
        left + metaColW * 2,
        y,
        { width: metaCol3W, align: "right" },
      );
      y += 18;

      const lineField = (
        label: string,
        value: string,
        yy: number,
      ): number => {
        doc.font("Helvetica-Bold").fontSize(9).text(`${label}`, left, yy);
        doc.font("Helvetica").text(
          value || "________________________________________________________________",
          left + 110,
          yy,
          { width: contentW - 110 },
        );
        return yy + 14;
      };
      const locatarioLabelW = 72;
      const lineFieldLocatario = (
        label: string,
        value: string,
        yy: number,
      ): number => {
        doc.font("Helvetica-Bold").fontSize(9).text(`${label}`, left, yy, {
          width: locatarioLabelW,
          align: "left",
        });
        doc.font("Helvetica").text(
          value || "________________________________________________________________",
          left + locatarioLabelW,
          yy,
          { width: contentW - locatarioLabelW },
        );
        return yy + 14;
      };

      doc.font("Helvetica-Bold").fontSize(10).text("II — LOCATÁRIO", left, y);
      y += 14;
      {
        const rowY = y;
        const leftLabelW = 72;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Nome:", left, rowY, { width: leftLabelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            customer?.name || "______________________________",
            left + leftLabelW,
            rowY,
            {
              width: colW - leftLabelW,
              align: "left",
            },
          );

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Fone:", rightX, rowY, { width: rightLabelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            customer?.phone || "______________________________",
            rightX + rightLabelW,
            rowY,
            {
              width: colW - rightLabelW,
              align: "left",
            },
          );
        y = rowY + 14;
      }
      y = lineFieldLocatario("CNPJ / CPF:", customer?.cpfCnpj || "", y);

      const endCliente = preferredAddress
        ? [
            preferredAddress.street,
            preferredAddress.number ? `, ${preferredAddress.number}` : "",
            preferredAddress.complement ? ` - ${preferredAddress.complement}` : "",
          ].join("")
        : "";
      {
        const rowY = y;
        const leftLabelW = locatarioLabelW;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;
        const cidadeCliente = [
          preferredAddress?.city,
          preferredAddress?.state,
        ]
          .filter(Boolean)
          .join("/");

        doc.font("Helvetica-Bold").fontSize(9).text("End:", left, rowY, {
          width: leftLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          endCliente || "______________________________",
          left + leftLabelW,
          rowY,
          { width: colW - leftLabelW, align: "left" },
        );

        const rightX = left + colW + colGap;
        doc.font("Helvetica-Bold").fontSize(9).text("Cidade:", rightX, rowY, {
          width: rightLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          cidadeCliente || "______________________________",
          rightX + rightLabelW,
          rowY,
          { width: colW - rightLabelW, align: "left" },
        );
        y = rowY + 14;
      }
      y = lineFieldLocatario(
        "Bairro:",
        preferredAddress?.neighborhood || "",
        y,
      );
      {
        const rowY = y;
        const leftLabelW = 72;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Representante:", left, rowY, {
            width: leftLabelW,
            align: "left",
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("______________________________", left + leftLabelW, rowY, {
            width: colW - leftLabelW,
            align: "left",
          });

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Preposto:", rightX, rowY, {
            width: rightLabelW,
            align: "left",
          });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("______________________________", rightX + rightLabelW, rowY, {
            width: colW - rightLabelW,
            align: "left",
          });
        y = rowY + 14;
      }
      y += 4;

      doc.font("Helvetica-Bold").fontSize(10).text("III — OBRA", left, y);
      y += 14;
      {
        const rowY = y;
        const labelW = 28;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;

        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Nome:", left, rowY, { width: labelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            work?.workName || "______________________________",
            left + labelW,
            rowY,
            {
              width: colW - labelW,
              align: "left",
            },
          );

        const rightX = left + colW + colGap;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("Fone:", rightX, rowY, { width: labelW, align: "left" });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text("__________________________________________", rightX + labelW, rowY, {
            width: colW - labelW,
            align: "left",
          });
        y = rowY + 14;
      }
      const endObra = work
        ? [
            work.street,
            work.number ? `, ${work.number}` : "",
            work.complement ? ` - ${work.complement}` : "",
            work.neighborhood ? ` - ${work.neighborhood}` : "",
            work.zipCode ? ` - CEP ${work.zipCode}` : "",
          ]
            .filter(Boolean)
            .join("")
        : "";
      {
        const rowY = y;
        const labelW = 28;
        const rightLabelW = 46;
        const colGap = 12;
        const colW = (contentW - colGap) / 2;
        const cidadeObra = [work?.city, work?.state]
          .filter(Boolean)
          .join("/");

        doc.font("Helvetica-Bold").fontSize(9).text("End:", left, rowY, {
          width: labelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          endObra || "__________________________________________",
          left + labelW,
          rowY,
          { width: colW - labelW, align: "left" },
        );

        const rightX = left + colW + colGap;
        doc.font("Helvetica-Bold").fontSize(9).text("Cidade:", rightX, rowY, {
          width: rightLabelW,
          align: "left",
        });
        doc.font("Helvetica").fontSize(9).text(
          cidadeObra || "______________________________",
          rightX + rightLabelW,
          rowY,
          { width: colW - rightLabelW, align: "left" },
        );
        y = rowY + 14;
      }
      y += 6;

      if (y > 680) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      doc.save();
      doc.rect(left, y, contentW, 22).fill("#000000");
      doc.fillColor("#ffffff");
      doc.font("Helvetica-Bold").fontSize(7.5);
      doc.text(
        "OBS. SÓ RETIRAMOS O(S) EQUIPAMENTO(S) COM A SOLICITAÇÃO DO CLIENTE, PESSOALMENTE OU POR TELEFONE.",
        left + 4,
        y + 6,
        { width: contentW - 8, align: "center" },
      );
      doc.restore();
      doc.fillColor("#000000");
      y += 30;

      doc.font("Helvetica-Bold").fontSize(10).text(
        "IV — CONDIÇÕES COMERCIAIS",
        left,
        y,
      );
      y += 12;

      const col = {
        q: left,
        cod: left + 28,
        desc: left + 78,
        unit: left + 300,
        per: left + 370,
        tot: left + 470,
      };
      const rowH = 14;

      const drawTableHeader = (yy: number) => {
        doc.font("Helvetica-Bold").fontSize(7);
        doc.text("Quant.", col.q, yy, { width: 24, align: "center" });
        doc.text("Cód.", col.cod, yy, { width: 44 });
        doc.text("DESCRIÇÃO DOS PRODUTOS", col.desc, yy, { width: 214 });
        doc.text("Valor Unit. Equip.", col.unit, yy, { width: 64, align: "right" });
        doc.text("Período", col.per, yy, { width: 96, align: "center" });
        doc.text("TOTAL R$", col.tot, yy, { width: right - col.tot, align: "right" });
        doc
          .moveTo(left, yy + 10)
          .lineTo(right, yy + 10)
          .strokeColor("#000000")
          .lineWidth(0.5)
          .stroke();
        return yy + 12;
      };

      y = drawTableHeader(y);
      doc.font("Helvetica").fontSize(7);

      let sumItems = 0;
      rental.items.forEach((ritem: any) => {
        const inv = ritem.itemId as any;
        const baseName =
          inv && typeof inv === "object" && inv.name ? inv.name : "Item";
        const name = this.isLoanLine(ritem)
          ? `${baseName} (Empréstimo)`
          : baseName;
        const sku =
          inv?.sku || inv?.customId || inv?.barcode || "—";
        const { periodLabel, tariffShown, lineTotal } =
          this.resolveCommercialRowForPdf(ritem, rental);

        sumItems += lineTotal;

        if (y > 720) {
          doc.addPage();
          y = 32;
          drawWatermark();
          y = drawTableHeader(y);
          doc.font("Helvetica").fontSize(7);
        }

        doc.text(String(ritem.quantity), col.q, y, { width: 24, align: "center" });
        doc.text(String(sku).slice(0, 12), col.cod, y, { width: 44 });
        doc.text(name, col.desc, y, { width: 214 });
        doc.text(fmtMoney(tariffShown), col.unit, y, {
          width: 64,
          align: "right",
        });
        doc.text(periodLabel, col.per, y, { width: 96, align: "center" });
        doc.text(fmtMoney(lineTotal), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
      });

      if (rental.services && rental.services.length > 0) {
        rental.services.forEach((s: any) => {
          const qty = Number(s.quantity || 1);
          const lineTotal = Number(
            s.subtotal ?? s.price * qty,
          );
          if (y > 720) {
            doc.addPage();
            y = 32;
            drawWatermark();
            y = drawTableHeader(y);
            doc.font("Helvetica").fontSize(7);
          }
          doc.text(String(qty), col.q, y, { width: 24, align: "center" });
          doc.text("SERV", col.cod, y, { width: 44 });
          doc.text(s.description || "Serviço", col.desc, y, { width: 214 });
          doc.text(fmtMoney(s.price), col.unit, y, {
            width: 64,
            align: "right",
          });
          doc.text("Único", col.per, y, { width: 96, align: "center" });
          doc.text(fmtMoney(lineTotal), col.tot, y, {
            width: right - col.tot,
            align: "right",
          });
          y += rowH;
        });
      }

      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .strokeColor("#000000")
        .lineWidth(0.5)
        .stroke();
      y += 8;

      const sumServices =
        rental.services?.reduce(
          (acc: number, s: any) =>
            acc +
            Number(s.subtotal ?? s.price * (s.quantity || 1)),
          0,
        ) ?? 0;
      const subtotalTable = sumItems + sumServices;
      const discount = Number(rental.pricing?.discount ?? 0);
      const contractTotal = Math.max(0, subtotalTable - discount);

      if (discount > 0) {
        doc.font("Helvetica").fontSize(8);
        doc.text("Subtotal:", col.tot - 120, y, { width: 100, align: "right" });
        doc.text(fmtMoney(subtotalTable), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
        doc.text("Desconto:", col.tot - 120, y, { width: 100, align: "right" });
        doc.text(fmtMoney(discount), col.tot, y, {
          width: right - col.tot,
          align: "right",
        });
        y += rowH;
      }

      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("TOTAL LOCAÇÃO:", col.tot - 120, y, { width: 100, align: "right" });
      doc.text(fmtMoney(contractTotal), col.tot, y, {
        width: right - col.tot,
        align: "right",
      });
      y += rowH + 6;
      if (y > 520) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      doc.font("Helvetica-Bold").fontSize(10).text("V — DECLARAÇÃO", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(7.5).text(
        [
          "O LOCATÁRIO recebe neste ato, ou na entrega, por si ou por seu preposto, o(s) bem(ns) móvel(is) referido(s) no presente instrumento, e declara: ",
          "A) Tê-lo(s) testado(s) e aprovado(s), afirmando que conhece sua correta utilização e funcionamento, pelo que se obriga a devolvê-lo(s) em idênticas condições de funcionamento, limpeza e segurança, ao final desta locação ou na hipótese de rescisão do presente contrato.",
          "B) Que somente permitirá o uso do(s) equipamento(s) por profissional(is) qualificado(s) para operá-lo(s).",
          "C) Que fará uso de todos os equipamentos de segurança (EPIs) necessários à utilização do(s) bem(ns) móvel(is) alugado(s), bem como das normas de segurança pertinentes.",
          "D) Ter ciência de que a prorrogação do CONTRATO é automática e por igual período, sucessivamente.",
          "E) Ter ciência de que o equipamento deverá ser devolvido na loja ou que deverá protocolar a solicitação de retirada por meio do telefone: (35) 98843-5154, sendo o protocolo a prova da solicitação.",
          "F) Constituem parte integrante deste CONTRATO as 'CONDIÇÕES GERAIS DO CONTRATO DE LOCAÇÃO DE BENS MÓVEIS – SEM OPERADOR', podendo ser solicitadas pelo locatário a qualquer momento por e-mail ou WhatsApp.",
          "G) No caso de locação de CONTAINER, na ocorrência de dano parcial ou total, queda, uso inadequado, furto, roubo, motivo de força maior, extravio ou qualquer outro motivo de perda ou desaparecimento do(s) bem(ns) não especificado(s) neste instrumento que o LOCATÁRIO armazenar ou guardar no CONTAINER, será de exclusiva responsabilidade do LOCATÁRIO, excluindo-se a ALUGUE de quaisquer responsabilidades, inclusive de natureza indenizatória, a qualquer título.",
        ].join(" "),
        left,
        y,
        {
          width: contentW,
          align: "justify",
          lineGap: 1,
        },
      );
      y = doc.y + 10;

      doc.font("Helvetica-Bold").fontSize(10).text("VI — OBSERVAÇÕES", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(9);
      const obsText = rental.notes?.trim() || "";
      doc.text(obsText || " ", left, y, { width: contentW, height: 44 });
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(right, doc.y + 2)
        .strokeColor("#999999")
        .lineWidth(0.3)
        .stroke();
      y = doc.y + 14;

      if (y > 640) {
        doc.addPage();
        y = 32;
        drawWatermark();
      }

      y = Math.max(y, 600);
      doc.font("Helvetica").fontSize(8);
      doc.text("LOCATÁRIO: ___________________________________________", left, y);
      doc.text(
        "LOCADORA: ___________________________________________",
        left + 260,
        y,
      );
      y += 22;
      doc.text("RECEBIDO POR: _______________________________________", left, y);
      doc.text("RG: __________________________________________________", left + 260, y);
      y += 18;
      doc.font("Helvetica").fontSize(7).fillColor("#555555");
      
      doc.end();
    });
  }

  private calculateFinalPricing(rental: any, returnDateOverride?: Date) {
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;

    const returnDate = returnDateOverride || new Date();

    const s = new Date(pickupDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(returnDate);
    e.setHours(0, 0, 0, 0);
    const DAY_MS = 1000 * 60 * 60 * 24;
    const diffMs = e.getTime() - s.getTime();
    const usedDays =
      diffMs >= 0
        ? Math.max(1, Math.floor(diffMs / DAY_MS) + 1)
        : 1;

    // Recalcular o subtotal dos equipamentos baseado nos dias utilizados
    let recalculatedEquipmentSubtotal = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let lineTotal = 0;

      if (rentalType === "weekly") {
        lineTotal = unitPrice * Math.max(1, Math.ceil(usedDays / 7));
      } else if (rentalType === "biweekly") {
        lineTotal = unitPrice * Math.max(1, Math.ceil(usedDays / 15));
      } else if (rentalType === "monthly") {
        lineTotal = unitPrice * Math.max(1, Math.ceil(usedDays / 30));
      } else {
        lineTotal = unitPrice * usedDays;
      }

      recalculatedEquipmentSubtotal += lineTotal * quantity;
    }

    const recalculatedTotal =
      recalculatedEquipmentSubtotal +
      (rental.pricing.servicesSubtotal || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      usedDays,
      recalculatedEquipmentSubtotal,
      recalculatedTotal,
      returnDate,
    };
  }

  private mapRentalServicesFromPayload(
    servicesPayload: any[],
  ): { services: IRentalService[]; servicesSubtotal: number } {
    let servicesSubtotal = 0;
    const services: IRentalService[] = (servicesPayload || []).map(
      (service: any) => {
        const quantity = Math.max(1, Number(service.quantity) || 1);
        const price = Math.max(0, Number(service.price) || 0);
        const subtotal = Number((price * quantity).toFixed(2));
        servicesSubtotal += subtotal;
        return {
          description: String(service.description || "").trim(),
          price,
          quantity,
          subtotal,
          category: service.category
            ? String(service.category).trim() || "other"
            : "other",
          notes: service.notes ? String(service.notes).trim() : undefined,
        };
      },
    );
    return {
      services,
      servicesSubtotal: Number(servicesSubtotal.toFixed(2)),
    };
  }

  private mapResponsibleContact(
    contact: any,
  ): IRentalResponsibleContact | undefined {
    if (!contact) {
      return undefined;
    }
    const name = String(contact.name || "").trim();
    if (!name) {
      return undefined;
    }
    return {
      customerResponsibleId:
        contact.customerResponsibleId &&
        mongoose.Types.ObjectId.isValid(contact.customerResponsibleId)
          ? new mongoose.Types.ObjectId(contact.customerResponsibleId)
          : undefined,
      name,
      phone: contact.phone ? String(contact.phone).trim() : undefined,
      role: contact.role || undefined,
      workName: contact.workName ? String(contact.workName).trim() : undefined,
    };
  }

  private async recalcPricingForRental(
    rental: IRental,
    companyId: string,
  ): Promise<void> {
    let equipmentSubtotal = 0;

    for (const item of rental.items) {
      if (this.isLoanLine(item)) {
        item.unitPrice = 0;
        item.subtotal = 0;
        continue;
      }

      /** Linha já encerrada (devolução registrada): manter valores do fechamento, não reelaborar período pela data prevista */
      if (item.returnActual) {
        equipmentSubtotal += Number(item.subtotal ?? 0);
        continue;
      }

      const inventoryItem = await Item.findOne({
        _id: asIdString(item.itemId),
        companyId,
      });
      if (!inventoryItem) {
        throw notFound(`Item ${item.itemId} not found`);
      }

      const pickupScheduled =
        item.pickupScheduled || rental.dates.pickupScheduled;
      const returnScheduled = item.returnScheduled;
      const pricingEndDate =
        returnScheduled ||
        this.getPricingEndDate(pickupScheduled, item.rentalType);

      const periodOverride = Number(item.periodRateOverride ?? 0);
      const pricingForLine =
        periodOverride > 0
          ? applyPeriodRateOverride(
              inventoryItem.pricing,
              item.rentalType,
              periodOverride,
            )
          : inventoryItem.pricing;

      const price = this.calculateRentalPrice(
        pricingForLine,
        pickupScheduled,
        pricingEndDate,
        item.rentalType,
        periodOverride > 0 ? periodOverride : undefined,
      );
      const subtotal = price * item.quantity;

      item.unitPrice = price;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
    }

    rental.pricing.equipmentSubtotal = Number(equipmentSubtotal.toFixed(2));
    rental.pricing.originalEquipmentSubtotal = Number(
      equipmentSubtotal.toFixed(2),
    );
    rental.pricing.subtotal = Number(
      (equipmentSubtotal + rental.pricing.servicesSubtotal).toFixed(2),
    );
    rental.pricing.total = Number(
      Math.max(
        0,
        rental.pricing.subtotal +
          -rental.pricing.discount +
          rental.pricing.lateFee,
      ).toFixed(2),
    );
  }

  private async applyStatusChangeDirect(
    rental: IRental,
    oldStatus: RentalStatus,
    newStatus: RentalStatus,
    companyId: string,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
    },
  ): Promise<void> {
    console.log("[INFO] FLUXO DE STATUS:", oldStatus, "→", newStatus);

    // 🔒 Proteção contra execução duplicada ou inválida
    if (oldStatus === newStatus) {
      console.warn("[AVISO] Tentativa de mudança de status redundante");
      return;
    }

    rental.status = newStatus;

    /**
     * RESERVED → ACTIVE
     */
    if (oldStatus === "reserved" && newStatus === "active") {
      rental.dates.pickupActual = new Date();

      if (!rental.dates.lastBillingDate) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.lastBillingDate = this.addDays(basePickup, -1);
      }

      if (
        !rental.dates.nextBillingDate &&
        rental.dates.billingCycle &&
        rental.dates.billingCycle !== "daily"
      ) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.nextBillingDate = this.getPeriodEnd(
          basePickup,
          rental.dates.billingCycle,
        );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante ativação do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Ativando unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          if (unit?.status === "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} já está alugada`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante ativação: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "reserved") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "reservada" (status=${unit.status}), pulando ativação`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Ativando item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * ACTIVE / OVERDUE → COMPLETED
     */
    if (
      (oldStatus === "active" || oldStatus === "overdue") &&
      newStatus === "completed"
    ) {
      const { usedDays, recalculatedEquipmentSubtotal, returnDate } =
        this.calculateFinalPricing(rental, adjustments?.returnDate);

      rental.dates.returnActual = returnDate;

      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = returnDate;
        }
      }

      rental.pricing.originalEquipmentSubtotal =
        rental.pricing.equipmentSubtotal;

      rental.pricing.equipmentSubtotal = Number(
        recalculatedEquipmentSubtotal.toFixed(2),
      );

      rental.pricing.subtotal = Number(
        (
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
        ).toFixed(2),
      );

      rental.pricing.total = Number(
        Math.max(
          0,
          rental.pricing.subtotal +
            -rental.pricing.discount +
            rental.pricing.lateFee,
        ).toFixed(2),
      );

      rental.pricing.usedDays = usedDays;

      if (adjustments?.pricingOverride) {
        const override = adjustments.pricingOverride;

        if (override.equipmentSubtotal !== undefined) {
          rental.pricing.equipmentSubtotal = override.equipmentSubtotal;
        }

        if (override.servicesSubtotal !== undefined) {
          rental.pricing.servicesSubtotal = override.servicesSubtotal;
        }

        if (override.discount !== undefined) {
          rental.pricing.discount = override.discount;
        }

        if (override.lateFee !== undefined) {
          rental.pricing.lateFee = override.lateFee;
        }

        rental.pricing.subtotal = Number(
          (
            rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
          ).toFixed(2),
        );

        rental.pricing.total =
          override.total !== undefined
            ? override.total
            : Number(
                (
                  rental.pricing.subtotal +
                  -rental.pricing.discount +
                  rental.pricing.lateFee
                ).toFixed(2),
              );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante devolução do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Devolvendo unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          // 🔒 Proteção contra retorno indevido
          if (unit?.status === "reserved") {
            console.warn(
              `[AVISO] Tentativa de devolução com unidade ainda reservada: ${item.unitId}`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante devolução: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "alugada" (status=${unit.status}), pulando devolução`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Devolvendo item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * RESERVED → CANCELLED
     */
    if (oldStatus === "reserved" && newStatus === "cancelled") {
      console.log(
        "[INFO] Cancelando aluguel e liberando itens reservados:",
        { rentalId: rental._id }
      );

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.warn(
            "[AVISO] Item não encontrado durante cancelamento do aluguel:",
            { itemId: item.itemId }
          );
          continue;
        }

        const ownQty = ownStockQuantity(item);
        if (ownQty <= 0 && !item.unitId) continue;

        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.unitId ? item.quantity : ownQty,
          "cancel",
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString(),
        );
      }

      await partnerService.cancelLoansForRental(companyId, String(rental._id));
    }

    /**
     * READY_TO_CLOSE → COMPLETED
     * Transição final do aluguel após todos os itens serem devolvidos
     * 
     * IMPORTANTE: Os valores de preço já foram calculados no closeRentalItem
     * para cada item individual. NÃO devemos recalcular aqui.
     */
    if (oldStatus === "ready_to_close" && newStatus === "completed") {
      // Marca data de conclusão
      rental.dates.returnActual = rental.dates.returnActual || new Date();

      // Garante que todos os itens tenham returnActual
      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = rental.dates.returnActual;
        }
      }

      // Os valores de pricing já foram recalculados em closeRentalItem
      // Apenas garantimos que o total não seja negativo (proteção contra erros)
      rental.pricing.total = Math.max(0, rental.pricing.total || 0);

      // Nota: As unidades já foram retornadas por closeRentalItem
      // apenas confirmamos que o aluguel está finalizado
      console.log("[SUCESSO] Aluguel finalizado com êxito:", rental._id);
    }
  }

  private async createFinalBillingIfNeeded(
    rental: IRental,
    userId: string,
  ): Promise<void> {
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId: rental.companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (this.isLoanLine(item)) {
        continue;
      }
      const itemReturn = item.returnActual;
      if (!itemReturn) {
        continue;
      }
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }

      const rentalLineKey = buildRentalLineKey(item as any);
      const returnAt = new Date(itemReturn);
      const rt = (item.rentalType || "daily") as RentalType;
      const { periodStartRaw, periodEndCharge } = this.resolveReturnChargePeriod(
        item,
        rental,
        returnAt,
        rt,
      );

      try {
        this.assertReturnChargePeriodValid(
          periodStartRaw,
          periodEndCharge,
          rt,
        );
      } catch {
        continue;
      }

      const periodEndNorm =
        rt === "daily" ? periodEndCharge : this.normalizeDate(periodEndCharge);

      const existing = await Billing.findOne({
        companyId: rental.companyId,
        rentalId: rental._id,
        status: { $nin: ["paid", "cancelled"] },
        rentalType: rt,
        "items.itemId": item.itemId,
        ...(item.unitId ? { "items.unitId": item.unitId } : {}),
        "items.rentalLineKey": rentalLineKey,
      }).lean();

      if (existing) {
        continue;
      }

      await billingService.createPeriodicBillingForItem(
        rental.companyId.toString(),
        rental,
        item,
        periodStartRaw,
        periodEndNorm,
        userId,
        {
          includeServices: includeServicesAvailable,
          notes: "Fechamento por devolução",
          status: "approved",
        },
      );
      includeServicesAvailable = false;

      item.lastBillingDate = periodEndNorm;
      item.nextBillingDate = undefined;
    }
  }

  /**
   * Update rental status
   */
  async updateRentalStatus(
    companyId: string,
    rentalId: string,
    status: RentalStatus,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      rentalType?: RentalType;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
      notes?: string;
    },
  ): Promise<UpdateRentalStatusResponse> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw notFound("Usuário não encontrado");
    }

    const isAdmin = canUpdateRentalStatus(user.role as RoleType);

    if (adjustments && status !== "completed") {
      throw badRequest("Ajustes só podem ser enviados no fechamento do aluguel");
    }

    // funcionário → cria solicitação
    if (!isAdmin) {
      if (status === "completed" && adjustments) {
        await this.requestApproval(
          companyId,
          rentalId,
          "close_adjustment",
          {
            previousStatus: rental.status,
            newStatus: status,
            previousValue: rental.status,
            newValue: status,
            adjustments,
          },
          userId,
          adjustments.notes || `Solicitação de fechamento com ajustes`,
        );

        await notificationService.notifyStatusChangeRequest({
          title: "Solicitação de alteração de status",
          message: `O funcionário ${user.name} solicitou fechar o aluguel com ajustes`,
          companyId,
          createdByUserId: userId,
          referenceId: rentalId,
          requestedStatus: status,
        });

        return {
          success: true,
          message: "Solicitação enviada para aprovação",
          data: rental,
          requiresApproval: true,
        };
      }

      await this.requestApproval(
        companyId,
        rentalId,
        "status_change",
        {
          previousStatus: rental.status,
          newStatus: status,
          previousValue: rental.status,
          newValue: status,
        },
        userId,
        `Solicitação de alteração de status para ${status}`,
      );

      await notificationService.notifyStatusChangeRequest({
        title: "Solicitação de alteração de status",
        message: `O funcionário ${user.name} solicitou alterar o status do aluguel para ${status}`,
        companyId,
        createdByUserId: userId,
        referenceId: rentalId,
        requestedStatus: status,
      });

      return {
        success: true,
        message: "Solicitação enviada para aprovação",
        data: rental,
        requiresApproval: true,
      };
    }
    const oldStatus = rental.status;

    // trava mudança inválida
    if (oldStatus === status) {
      return {
        success: true,
        message: "Status já estava definido",
        data: rental,
      };
    }

    await this.applyStatusChangeDirect(
      rental,
      oldStatus,
      status,
      companyId,
      userId,
      adjustments,
    );

    if (status === "completed") {
      await this.processDueBillings(companyId, rentalId, userId);
    }

    if (status === "completed" && adjustments?.rentalType) {
      for (const item of rental.items) {
        item.rentalType = adjustments.rentalType;
      }
      rental.dates.billingCycle = adjustments.rentalType;
      await this.recalcPricingForRental(rental, companyId);
    }

    if (status === "completed") {
      await this.createFinalBillingIfNeeded(rental, userId);
    }

    await this.addChangeHistory(
      rental,
      "status_change",
      oldStatus,
      status,
      userId,
      adjustments?.notes,
    );

    await rental.save();

    return {
      success: true,
      message: "Status alterado com sucesso",
      data: rental,
    };
  }

  /**
   * Extend rental period
   */
  async extendRental(
    companyId: string,
    rentalId: string,
    newReturnDate: Date,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    if (rental.status !== "active" && rental.status !== "reserved") {
      throw badRequest("Can only extend active or reserved rentals");
    }

    const oldReturnDate = rental.dates.returnScheduled;
    rental.dates.returnScheduled = new Date(newReturnDate);

    // Recalculate pricing
    let totalSubtotal = 0;
    for (const item of rental.items) {
      if (item.returnActual) {
        totalSubtotal += Number(item.subtotal ?? 0);
        continue;
      }
      const inventoryItem = await Item.findOne({
        _id: asIdString(item.itemId),
        companyId,
      });
      if (inventoryItem) {
        const pickupScheduled =
          item.pickupScheduled || rental.dates.pickupScheduled;
        const returnEnd =
          item.returnScheduled || rental.dates.returnScheduled;
        const price = this.calculateRentalPrice(
          inventoryItem.pricing,
          pickupScheduled,
          returnEnd,
          item.rentalType,
        );
        const subtotal = price * item.quantity;
        totalSubtotal += subtotal;
      }
    }

    rental.pricing.subtotal = totalSubtotal;
    rental.pricing.total = Math.max(
      0,
      totalSubtotal - rental.pricing.discount + (rental.pricing.lateFee || 0),
    );

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
    return Rental.findOne({ _id: rentalId, companyId });
  }

  /**
   * Update pickup checklist
   */
  async updatePickupChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    rental.checklistPickup = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update return checklist
   */
  async updateReturnChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    rental.checklistReturn = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update rental (general update)
   */
  async updateRental(
    companyId: string,
    rentalId: string,
    data: any,
    userId: string,
  ): Promise<{ rental: IRental; requiresApproval: boolean }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw notFound("Usuário não encontrado");
    }

    const changes: Record<string, any> = {};
    const dateChanges: Record<string, any> = {};
    const itemChanges: Record<string, any>[] = [];
    const workAddressChanged = data.workAddress !== undefined;
    const financialResponsibleChanged =
      data.financialResponsibleContact !== undefined;
    const workResponsibleChanged = data.workResponsibleContact !== undefined;
    const itemUpdates = Array.isArray(data.items) ? data.items : [];
    const hasServiceUpdates = data.services !== undefined;
    const keptFromPayload = new Set<IRentalItem>();
    if (itemUpdates.length > 0) {
      for (const itemUpdate of itemUpdates) {
        const existingItem = this.findRentalLineItemForPatch(rental, {
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          lineId:
            typeof itemUpdate.lineId === "string"
              ? itemUpdate.lineId
              : undefined,
        });
        if (existingItem) keptFromPayload.add(existingItem);
        itemChanges.push({
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          previousUnitId: existingItem?.unitId,
          lineId: itemUpdate.lineId,
          isNew: !existingItem,
          previousRentalType: existingItem?.rentalType,
          newRentalType: itemUpdate.rentalType,
          previousPickupScheduled: existingItem?.pickupScheduled,
          newPickupScheduled: itemUpdate.pickupScheduled,
          previousReturnScheduled: existingItem?.returnScheduled,
          newReturnScheduled: itemUpdate.returnScheduled,
          previousQuantity: existingItem?.quantity,
          newQuantity: itemUpdate.quantity,
        });
      }
      for (const item of rental.items || []) {
        if (!keptFromPayload.has(item)) {
          itemChanges.push({
            itemId: asIdString(item.itemId),
            unitId: item.unitId,
            lineId: item.lineId,
            removed: true,
            previousQuantity: item.quantity,
          });
        }
      }
    }

    if (data.dates?.pickupScheduled) {
      const newPickup = new Date(data.dates.pickupScheduled);
      if (rental.dates.pickupScheduled.getTime() !== newPickup.getTime()) {
        dateChanges.pickupScheduled = {
          previous: rental.dates.pickupScheduled,
          next: newPickup,
        };
      }
    }

    if (data.dates?.returnScheduled) {
      const newReturn = new Date(data.dates.returnScheduled);
      if (rental.dates.returnScheduled.getTime() !== newReturn.getTime()) {
        dateChanges.returnScheduled = {
          previous: rental.dates.returnScheduled,
          next: newReturn,
        };
      }
    }

    // Only allow updates to certain fields
    if (data.notes !== undefined) {
      changes.notes = {
        previous: rental.notes || "",
        next: data.notes || "",
      };
    }

    if (data.pickedUpBy !== undefined) {
      const next = data.pickedUpBy?.trim() || "";
      const previous = rental.pickedUpBy?.trim() || "";
      if (next !== previous) {
        changes.pickedUpBy = { previous, next };
      }
    }

    if (workAddressChanged) {
      rental.workAddress = data.workAddress
        ? {
            street: data.workAddress.street,
            number: data.workAddress.number,
            complement: data.workAddress.complement,
            neighborhood: data.workAddress.neighborhood,
            city: data.workAddress.city,
            state: data.workAddress.state,
            zipCode: data.workAddress.zipCode,
            workName: data.workAddress.workName,
            workId:
              data.workAddress.workId &&
              mongoose.Types.ObjectId.isValid(data.workAddress.workId)
                ? new mongoose.Types.ObjectId(data.workAddress.workId)
                : undefined,
          }
        : undefined;
    }
    if (financialResponsibleChanged) {
      rental.financialResponsibleContact = this.mapResponsibleContact(
        data.financialResponsibleContact,
      );
    }
    if (workResponsibleChanged) {
      rental.workResponsibleContact = this.mapResponsibleContact(
        data.workResponsibleContact,
      );
    }

    const hasChanges = Object.keys(changes).length > 0;
    const hasDateChanges = Object.keys(dateChanges).length > 0;
    const hasItemChanges = itemUpdates.length > 0;
    const hasServiceChanges = hasServiceUpdates;

    if (
      !hasChanges &&
      !hasDateChanges &&
      !workAddressChanged &&
      !financialResponsibleChanged &&
      !workResponsibleChanged &&
      !hasItemChanges &&
      !hasServiceChanges
    ) {
      return { rental, requiresApproval: false };
    }

    if (
      !canUpdateRentalStatus(user.role as RoleType) &&
      (
        hasChanges ||
        hasDateChanges ||
        hasItemChanges ||
        hasServiceChanges ||
        workAddressChanged ||
        financialResponsibleChanged ||
        workResponsibleChanged
      )
    ) {
      await this.requestApproval(
        companyId,
        rentalId,
        "rental_update",
        {
          previousNotes: changes.notes?.previous,
          newNotes: changes.notes?.next,
          previousPickupScheduled: dateChanges.pickupScheduled?.previous,
          newPickupScheduled: dateChanges.pickupScheduled?.next,
          previousReturnScheduled: dateChanges.returnScheduled?.previous,
          newReturnScheduled: dateChanges.returnScheduled?.next,
          items: itemChanges,
          services: hasServiceUpdates ? data.services : undefined,
          previousServices: rental.services,
          previousValue: "rental_update",
          newValue: "rental_update",
        },
        userId,
        "Solicitação de edição do aluguel",
      );

      await rental.save();
      return { rental, requiresApproval: true };
    }

    if (changes.notes) {
      rental.notes = changes.notes.next;
    }

    if (changes.pickedUpBy) {
      rental.pickedUpBy = changes.pickedUpBy.next || undefined;
    }

    if (dateChanges.pickupScheduled) {
      rental.dates.pickupScheduled = dateChanges.pickupScheduled.next;
    }

    if (dateChanges.returnScheduled) {
      rental.dates.returnScheduled = dateChanges.returnScheduled.next;
    }

    if (hasServiceUpdates) {
      const { services, servicesSubtotal } = this.mapRentalServicesFromPayload(
        data.services,
      );
      rental.services = services.length > 0 ? services : undefined;
      rental.pricing.servicesSubtotal = servicesSubtotal;
    }

    if (hasItemChanges) {
      const keysToInvalidate = new Set<string>();
      const touchedSnapshots: Array<{ item: IRentalItem; snapKey: string }> =
        [];

      const originalItems = [...(rental.items || [])];
      const keptExisting = new Set<IRentalItem>();
      for (const itemUpdate of itemUpdates) {
        const keptLine = this.findRentalLineItemForPatch(rental, {
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          lineId:
            typeof itemUpdate.lineId === "string"
              ? itemUpdate.lineId
              : undefined,
        });
        if (keptLine) keptExisting.add(keptLine);
      }

      const itemsToRemove = originalItems.filter(
        (item) => !keptExisting.has(item),
      );
      if (itemsToRemove.length > 0) {
        if (originalItems.length - itemsToRemove.length < 1) {
          throw badRequest("O aluguel deve manter ao menos um item.");
        }
        if (["completed", "cancelled"].includes(rental.status)) {
          throw badRequest(
            "Não é possível remover itens deste aluguel no status atual.",
          );
        }

        for (const removed of itemsToRemove) {
          if (removed.returnActual) {
            throw badRequest(
              "Não é possível remover itens já devolvidos. Use a devolução parcial se ainda houver quantidade em aberto.",
            );
          }
          const snapKey = buildRentalLineKey(removed as any);
          const lockedEnd = await this.getLatestLockedItemBillingEnd(
            companyId,
            rental._id,
            removed.itemId,
            removed.unitId,
            snapKey,
          );
          if (lockedEnd) {
            throw badRequest(
              "Não é possível remover este item: existe fechamento quitado ou com baixa vinculada.",
            );
          }
          keysToInvalidate.add(snapKey);
          await this.releaseRentalLineInventory(
            companyId,
            rental,
            removed,
            userId,
          );
        }

        rental.items = (rental.items || []).filter((item) =>
          keptExisting.has(item),
        );
      }

      for (const itemUpdate of itemUpdates) {
        const inventoryItem = await Item.findOne({
          _id: itemUpdate.itemId,
          companyId,
        });
        if (!inventoryItem) {
          throw notFound(`Item ${itemUpdate.itemId} not found`);
        }

        const isUnit = inventoryItem.trackingType === "unit";
        if (isUnit && !itemUpdate.unitId) {
          throw badRequest(
            `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
          );
        }

        const patchLineId =
          typeof itemUpdate.lineId === "string" ? itemUpdate.lineId : undefined;
        const existingItem = this.findRentalLineItemForPatch(rental, {
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          lineId: patchLineId,
        });

        if (
          !existingItem &&
          this.rentalLineCountSameEquipment(
            rental,
            itemUpdate.itemId,
            itemUpdate.unitId,
          ) > 0
        ) {
          throw badRequest(
            "Este contrato tem mais de uma linha do mesmo equipamento. Informe lineId ao editar cada segmento.",
          );
        }

        if (existingItem) {
          const nextUnitId =
            itemUpdate.unitId != null && String(itemUpdate.unitId).trim() !== ""
              ? String(itemUpdate.unitId).trim()
              : "";
          const prevUnitId = String(existingItem.unitId || "").trim();
          const unitChanged =
            isUnit &&
            nextUnitId.length > 0 &&
            prevUnitId.length > 0 &&
            nextUnitId !== prevUnitId;

          const oldSnapKey = buildRentalLineKey(existingItem as any);
          if (unitChanged) {
            await this.applyRentalLineUnitSwap(
              companyId,
              rental,
              existingItem,
              nextUnitId,
              userId,
            );
          }

          const snapKey = buildRentalLineKey(existingItem as any);
          const rateOnlyPatch =
            !unitChanged &&
            itemUpdate.periodRateOverride !== undefined &&
            !this.hasItemScheduleOrQtyChanges(existingItem, itemUpdate);
          if (!rateOnlyPatch) {
            keysToInvalidate.add(oldSnapKey);
          }
          touchedSnapshots.push({ item: existingItem, snapKey });

          if (itemUpdate.isLoan !== undefined) {
            existingItem.isLoan = itemUpdate.isLoan === true;
            if (existingItem.isLoan) {
              existingItem.unitPrice = 0;
              existingItem.subtotal = 0;
            }
          }

          const oldOwnQty = ownStockQuantity(existingItem);

          if (itemUpdate.partnerSupply !== undefined) {
            if (isUnit && itemUpdate.partnerSupply) {
              throw badRequest(
                `Item unitário "${inventoryItem.name}" não pode usar equipamento de parceiro nesta versão.`,
              );
            }
            const ps = itemUpdate.partnerSupply;
            if (!ps || !ps.partnerId || !(Number(ps.quantity) > 0)) {
              existingItem.partnerSupply = undefined;
            } else {
              const nextQty = Math.max(
                1,
                Math.floor(
                  Number(
                    itemUpdate.quantity !== undefined
                      ? itemUpdate.quantity
                      : existingItem.quantity,
                  ),
                ),
              );
              const partnerQty = Math.max(1, Math.floor(Number(ps.quantity)));
              if (partnerQty > nextQty) {
                throw badRequest(
                  `Quantidade de terceiros maior que a quantidade da linha em "${inventoryItem.name}".`,
                );
              }
              const partner = await Partner.findOne({
                _id: ps.partnerId,
                companyId,
                isActive: true,
              });
              if (!partner) {
                throw badRequest(
                  `Parceiro inválido ou inativo para "${inventoryItem.name}".`,
                );
              }
              existingItem.partnerSupply = {
                partnerId: new mongoose.Types.ObjectId(ps.partnerId),
                quantity: partnerQty,
                agreedCost:
                  ps.agreedCost != null ? Number(ps.agreedCost) : undefined,
                notes: ps.notes,
              };
            }
          }
          if (itemUpdate.rentalType) {
            if (!this.isLoanLine(existingItem)) {
              const override = Math.max(
                0,
                Number(
                  itemUpdate.periodRateOverride ??
                    existingItem.periodRateOverride ??
                    0,
                ),
              );
              if (override <= 0) {
                this.assertConfiguredRateForRentalType(
                  inventoryItem,
                  itemUpdate.rentalType,
                );
              }
            }
            existingItem.rentalType = itemUpdate.rentalType;
          }
          await this.applyItemPeriodRatePatch(
            companyId,
            user,
            asIdString(inventoryItem._id),
            existingItem,
            itemUpdate,
            (itemUpdate.rentalType ||
              existingItem.rentalType ||
              "daily") as RentalType,
          );
          if (itemUpdate.pickupScheduled) {
            existingItem.pickupScheduled = new Date(itemUpdate.pickupScheduled);
          }
          if (
            itemUpdate.recalculateScheduledReturn &&
            existingItem.pickupScheduled
          ) {
            existingItem.returnScheduled = this.getPricingEndDate(
              new Date(existingItem.pickupScheduled),
              existingItem.rentalType,
            );
          } else if (itemUpdate.returnScheduled !== undefined) {
            existingItem.returnScheduled = itemUpdate.returnScheduled
              ? new Date(itemUpdate.returnScheduled)
              : undefined;
          }
          const syncRetro =
            itemUpdate.historicalDelivery !== undefined ||
            itemUpdate.returnScheduled !== undefined ||
            itemUpdate.recalculateScheduledReturn === true;
          if (syncRetro) {
            this.finalizeRetroactiveFlagsForItem(
              existingItem,
              itemUpdate.historicalDelivery,
              new Date(),
            );
          }

          if (
            (itemUpdate.quantity !== undefined ||
              itemUpdate.partnerSupply !== undefined) &&
            !isUnit
          ) {
            if (existingItem.returnActual) {
              throw badRequest(
                `Não é possível alterar a quantidade de "${inventoryItem.name}" após a devolução.`,
              );
            }
            if (itemUpdate.quantity !== undefined) {
              existingItem.quantity = Math.max(
                1,
                Math.floor(Number(itemUpdate.quantity)),
              );
            }
            if (
              existingItem.partnerSupply &&
              Number(existingItem.partnerSupply.quantity) >
                Number(existingItem.quantity)
            ) {
              throw badRequest(
                `Quantidade de terceiros maior que a quantidade da linha em "${inventoryItem.name}".`,
              );
            }
            const newOwnQty = ownStockQuantity(existingItem);
            const delta = newOwnQty - oldOwnQty;
            const customerIdStr = rental.customerId.toString();
            const onField =
              rental.status === "active" ||
              rental.status === "overdue" ||
              rental.status === "ready_to_close";

            if (delta > 0) {
              const available = inventoryItem.quantity.available || 0;
              if (available < delta) {
                throw badRequest(
                  `Estoque insuficiente para "${inventoryItem.name}". Disponível próprio: ${available}, adicional solicitado: ${delta}.`,
                );
              }
              if (onField) {
                await this.updateItemQuantityForRental(
                  companyId,
                  itemUpdate.itemId,
                  delta,
                  "reserve",
                  userId,
                  rental._id,
                  undefined,
                  customerIdStr,
                );
                await this.updateItemQuantityForRental(
                  companyId,
                  itemUpdate.itemId,
                  delta,
                  "activate",
                  userId,
                  rental._id,
                  undefined,
                  customerIdStr,
                );
              } else {
                await this.updateItemQuantityForRental(
                  companyId,
                  itemUpdate.itemId,
                  delta,
                  "reserve",
                  userId,
                  rental._id,
                  undefined,
                  customerIdStr,
                );
              }
            } else if (delta < 0) {
              const absDelta = -delta;
              if (onField) {
                await this.updateItemQuantityForRental(
                  companyId,
                  itemUpdate.itemId,
                  absDelta,
                  "return",
                  userId,
                  rental._id,
                  undefined,
                  customerIdStr,
                );
              } else {
                await this.updateItemQuantityForRental(
                  companyId,
                  itemUpdate.itemId,
                  absDelta,
                  "cancel",
                  userId,
                  rental._id,
                  undefined,
                  customerIdStr,
                );
              }
            }
          }
        } else {
          const quantity = itemUpdate.quantity || 1;
          const partnerQty = Math.max(
            0,
            Number(itemUpdate.partnerSupply?.quantity ?? 0),
          );
          if (isUnit && partnerQty > 0) {
            throw badRequest(
              `Item unitário "${inventoryItem.name}" não pode usar equipamento de parceiro nesta versão.`,
            );
          }
          if (partnerQty > quantity) {
            throw badRequest(
              `Quantidade de terceiros maior que a quantidade da linha em "${inventoryItem.name}".`,
            );
          }
          const ownQty = quantity - partnerQty;
          if (!isUnit) {
            const available = inventoryItem.quantity.available || 0;
            if (ownQty > 0 && available < ownQty) {
              throw badRequest(
                `Estoque insuficiente para "${inventoryItem.name}". Disponível próprio: ${available}. Necessário: ${ownQty}.`,
              );
            }
          } else {
            const unit = inventoryItem.units?.find(
              (u) => u.unitId === itemUpdate.unitId,
            );
            if (!unit || unit.status !== "available") {
              throw badRequest(
                `Unit ${itemUpdate.unitId} is not available for rental`,
              );
            }
          }

          if (partnerQty > 0) {
            const partner = await Partner.findOne({
              _id: itemUpdate.partnerSupply!.partnerId,
              companyId,
              isActive: true,
            });
            if (!partner) {
              throw badRequest(
                `Parceiro inválido ou inativo para "${inventoryItem.name}".`,
              );
            }
          }

          const rentalType: RentalType = itemUpdate.rentalType || "daily";
          const isLoan = itemUpdate.isLoan === true;
          const periodRateOverride = Math.max(
            0,
            Number(itemUpdate.periodRateOverride ?? 0),
          );
          if (!isLoan && periodRateOverride <= 0) {
            this.assertConfiguredRateForRentalType(inventoryItem, rentalType);
          }
          if (itemUpdate.saveRateToItem === true) {
            if (!canApplyDiscount(user.role as RoleType)) {
              throw forbidden(
                "Somente o administrador pode atualizar o cadastro do equipamento com o novo valor.",
              );
            }
            if (periodRateOverride <= 0) {
              throw badRequest(
                "Informe o valor do período para salvar no cadastro do equipamento.",
              );
            }
          }
          const pickupScheduled = itemUpdate.pickupScheduled
            ? new Date(itemUpdate.pickupScheduled)
            : rental.dates.pickupScheduled;
          let returnScheduled: Date | undefined = itemUpdate.returnScheduled
            ? new Date(itemUpdate.returnScheduled)
            : undefined;
          if (itemUpdate.recalculateScheduledReturn && pickupScheduled) {
            returnScheduled = this.getPricingEndDate(pickupScheduled, rentalType);
          }
          const pricingEndDate =
            returnScheduled ||
            this.getPricingEndDate(pickupScheduled, rentalType);

          const todayNew = this.normalizeDate(new Date());
          const retNorm = this.normalizeDate(pricingEndDate);
          let returnActual: Date | undefined;
          let retroactiveOpenBilling = false;
          if (retNorm.getTime() < todayNew.getTime()) {
            if (itemUpdate.historicalDelivery === true) {
              returnActual = retNorm;
            } else {
              retroactiveOpenBilling = true;
            }
          }

          const pricingForLine =
            periodRateOverride > 0 && !itemUpdate.saveRateToItem
              ? applyPeriodRateOverride(
                  inventoryItem.pricing,
                  rentalType,
                  periodRateOverride,
                )
              : inventoryItem.pricing;

          if (itemUpdate.saveRateToItem === true && periodRateOverride > 0) {
            await this.savePeriodRateToInventory(
              companyId,
              itemUpdate.itemId,
              rentalType,
              periodRateOverride,
            );
          }

          const price = isLoan
            ? 0
            : this.calculateRentalPrice(
                pricingForLine,
                pickupScheduled,
                pricingEndDate,
                rentalType,
                periodRateOverride > 0 ? periodRateOverride : undefined,
              );

          const newLine: IRentalItem = {
            itemId: itemUpdate.itemId,
            lineId: randomUUID(),
            unitId: itemUpdate.unitId,
            quantity,
            unitPrice: price,
            rentalType,
            pickupScheduled,
            returnScheduled,
            returnActual,
            retroactiveOpenBilling,
            subtotal: isLoan ? 0 : price * quantity,
            isLoan,
          };
          if (periodRateOverride > 0) {
            newLine.periodRateOverride = periodRateOverride;
          }
          if (partnerQty > 0 && itemUpdate.partnerSupply?.partnerId) {
            newLine.partnerSupply = {
              partnerId: new mongoose.Types.ObjectId(
                itemUpdate.partnerSupply.partnerId,
              ),
              quantity: partnerQty,
              agreedCost:
                itemUpdate.partnerSupply.agreedCost != null
                  ? Number(itemUpdate.partnerSupply.agreedCost)
                  : undefined,
              notes: itemUpdate.partnerSupply.notes,
            };
          }
          rental.items.push(newLine as any);

          if (ownQty > 0 || itemUpdate.unitId) {
            await this.reserveThenActivateNewRentalLine(
              companyId,
              rental,
              itemUpdate.itemId,
              itemUpdate.unitId ? quantity : ownQty,
              itemUpdate.unitId,
              userId,
            );
          }
        }
      }

      await partnerService.syncLoansForRental(
        companyId,
        String(rental._id),
        rental.items as any,
      );

      await this.removeObsoleteUnpaidBillingsForRentalLineKeys(
        companyId,
        rental._id,
        keysToInvalidate,
      );

      for (const { item: row } of touchedSnapshots) {
        row.lastBillingDate = undefined;
        row.nextBillingDate = undefined;
      }
      const seenRowIds = new Set<string>();
      for (const { item: row, snapKey } of touchedSnapshots) {
        const rowKeyStr = `${
          row.itemId?.toString?.() || String(row.itemId)
        }\t${String(row.unitId || "")}\t${
          typeof row.lineId === "string" ? row.lineId : ""
        }`;
        if (seenRowIds.has(rowKeyStr)) continue;
        seenRowIds.add(rowKeyStr);

        const lockedEnd = await this.getLatestLockedItemBillingEnd(
          companyId,
          rental._id,
          row.itemId,
          row.unitId,
          snapKey,
        );
        if (lockedEnd) {
          row.lastBillingDate = lockedEnd;
          const nextStart = this.addDays(lockedEnd, 1);
          row.nextBillingDate = this.getPeriodEnd(
            nextStart,
            row.rentalType || "daily",
          );
        }
      }

      await this.recalcPricingForRental(rental, companyId);
      this.markRentalItemsAndPricingModified(rental);

      const pickups = rental.items
        .map((i) => i.pickupScheduled)
        .filter(Boolean) as Date[];
      if (pickups.length > 0) {
        rental.dates.pickupScheduled = new Date(
          Math.min(...pickups.map((d) => d.getTime())),
        );
      }
      const returns = rental.items
        .map((i) => i.returnScheduled)
        .filter(Boolean) as Date[];
      if (returns.length > 0) {
        rental.dates.returnScheduled = new Date(
          Math.max(...returns.map((d) => d.getTime())),
        );
      }

      const allReturnedAfterEdit =
        (rental.items?.length ?? 0) > 0 &&
        rental.items.every((item) => item.returnActual);
      if (
        allReturnedAfterEdit &&
        rental.status !== "completed" &&
        rental.status !== "cancelled"
      ) {
        rental.status = "ready_to_close";
        const latestReturn = rental.items.reduce<Date | null>((acc, item) => {
          if (!item.returnActual) return acc;
          const t = new Date(item.returnActual);
          if (!acc || t.getTime() > acc.getTime()) return t;
          return acc;
        }, null);
        if (latestReturn) {
          rental.dates.returnActual = latestReturn;
        }
      }
    } else if (hasServiceChanges) {
      await this.recalcPricingForRental(rental, companyId);
      this.markRentalItemsAndPricingModified(rental);
    }

    const shouldSyncBillings =
      (hasDateChanges || hasItemChanges || hasServiceChanges) &&
      ["reserved", "active", "overdue", "ready_to_close"].includes(
        rental.status,
      );

    await this.addChangeHistory(
      rental,
      "rental_update",
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      userId,
    );

    this.markRentalItemsAndPricingModified(rental);
    await rental.save();

    if (shouldSyncBillings) {
      try {
        await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: string }).name)
            : "";
        if (name !== "VersionError") {
          throw err;
        }
        console.warn(
          `[updateRental] Fechamentos não sincronizados após edição do aluguel ${rentalId}: conflito de versão.`,
        );
      }
    }

    const finalRental =
      (await Rental.findOne({ _id: rentalId, companyId })) || rental;

    return { rental: finalRental, requiresApproval: false };
  }

  /**
   * Check and update overdue rentals
   */
  async checkOverdueRentals(companyId: string): Promise<number> {
    const now = new Date();
    const overdueRentals = await Rental.updateMany(
      {
        companyId,
        status: { $in: ["active", "reserved"] },
        "dates.returnScheduled": { $lt: now },
      },
      {
        $set: { status: "overdue" },
      },
    );

    return overdueRentals.modifiedCount;
  }

  /**
   * NOVO: Obter dashboard de vencimentos
   */
  async getExpirationDashboard(companyId: string): Promise<{
    expired: IRental[];
    expiringSoon: IRental[];
    expiringToday: IRental[];
    active: number;
    summary: {
      totalExpired: number;
      totalExpiringSoon: number;
      totalExpiringToday: number;
      totalActive: number;
    };
  }> {
    const now = new Date();

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    //Contratos vencidos
    const expiredQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $lt: todayStart,
      },
    };

    //Vencem hoje
    const expiringTodayQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gte: todayStart,
        $lt: todayEnd,
      },
    };

    //Vencem em até 7 dias
    const expiringSoonQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gt: todayEnd,
        $lte: sevenDaysFromNow,
      },
    };

    //Ativos
    const activeQuery = {
      companyId,
      status: "active",
    };

    const [expired, expiringSoon, expiringToday, activeCount] =
      await Promise.all([
        Rental.find(expiredQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringSoonQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringTodayQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 }),

        Rental.countDocuments(activeQuery),
      ]);

    return {
      expired,
      expiringSoon,
      expiringToday,
      active: activeCount,
      summary: {
        totalExpired: expired.length,
        totalExpiringSoon: expiringSoon.length,
        totalExpiringToday: expiringToday.length,
        totalActive: activeCount,
      },
    };
  }

  /** Troca a unidade de uma linha já existente (libera a antiga e reserva/ativa a nova). */
  private async applyRentalLineUnitSwap(
    companyId: string,
    rental: IRental,
    existingItem: IRentalItem,
    nextUnitId: string,
    userId: string,
  ): Promise<void> {
    const prevUnitId = String(existingItem.unitId || "").trim();
    const newUnitId = String(nextUnitId || "").trim();
    if (!newUnitId || newUnitId === prevUnitId) return;

    if (existingItem.returnActual) {
      throw badRequest(
        "Não é possível trocar a unidade de um item já devolvido.",
      );
    }

    const itemIdStr = asIdString(existingItem.itemId);
    const takenByOtherLine = (rental.items || []).some((line) => {
      if (line === existingItem) return false;
      return (
        asIdString(line.itemId) === itemIdStr &&
        String(line.unitId || "").trim() === newUnitId
      );
    });
    if (takenByOtherLine) {
      throw badRequest(`A unidade ${newUnitId} já está neste aluguel.`);
    }

    const itemOid =
      typeof existingItem.itemId === "object" && (existingItem.itemId as any)?._id
        ? ((existingItem.itemId as any)._id as mongoose.Types.ObjectId)
        : (existingItem.itemId as mongoose.Types.ObjectId);

    const fresh = await Item.findOne({ _id: itemOid, companyId });
    const newUnit = fresh?.units?.find((u) => u.unitId === newUnitId);
    if (!newUnit || newUnit.status !== "available") {
      throw badRequest(
        `Unidade ${newUnitId} não está disponível para aluguel.`,
      );
    }

    const oldKey = buildRentalLineKey(existingItem as any);

    await this.releaseRentalLineInventory(
      companyId,
      rental,
      existingItem,
      userId,
    );

    existingItem.unitId = newUnitId;

    const onField =
      rental.status === "active" ||
      rental.status === "overdue" ||
      rental.status === "ready_to_close";
    const customerIdStr = rental.customerId.toString();

    await this.updateItemQuantityForRental(
      companyId,
      itemOid,
      1,
      "reserve",
      userId,
      rental._id,
      newUnitId,
      customerIdStr,
    );
    if (onField) {
      await this.updateItemQuantityForRental(
        companyId,
        itemOid,
        1,
        "activate",
        userId,
        rental._id,
        newUnitId,
        customerIdStr,
      );
    }

    await this.relinkBillingUnitIdsForRentalLine(companyId, rental._id, {
      itemId: itemIdStr,
      oldUnitId: prevUnitId,
      newUnitId,
      oldRentalLineKey: oldKey,
      newRentalLineKey: buildRentalLineKey(existingItem as any),
      lineId:
        typeof existingItem.lineId === "string"
          ? existingItem.lineId
          : undefined,
    });
  }

  /** Libera estoque de uma linha removida do aluguel (reserva cancelada ou devolução em campo). */
  private async releaseRentalLineInventory(
    companyId: string,
    rental: IRental,
    line: IRentalItem,
    userId: string,
  ): Promise<void> {
    const itemId =
      typeof line.itemId === "object" && (line.itemId as any)?._id
        ? ((line.itemId as any)._id as mongoose.Types.ObjectId)
        : (line.itemId as mongoose.Types.ObjectId);
    const customerIdStr = rental.customerId.toString();
    const qty = Math.max(0, ownStockQuantity(line));
    const onField =
      rental.status === "active" ||
      rental.status === "overdue" ||
      rental.status === "ready_to_close";

    const inventoryItem = await Item.findOne({ _id: itemId, companyId });
    const isUnit = inventoryItem?.trackingType === "unit";

    if (isUnit) {
      if (onField) {
        await this.updateItemQuantityForRental(
          companyId,
          itemId,
          1,
          "return",
          userId,
          rental._id,
          line.unitId,
          customerIdStr,
        );
      } else {
        await this.updateItemQuantityForRental(
          companyId,
          itemId,
          1,
          "cancel",
          userId,
          rental._id,
          line.unitId,
          customerIdStr,
        );
      }
      return;
    }

    if (qty <= 0) return;

    if (onField) {
      await this.updateItemQuantityForRental(
        companyId,
        itemId,
        qty,
        "return",
        userId,
        rental._id,
        undefined,
        customerIdStr,
      );
    } else {
      await this.updateItemQuantityForRental(
        companyId,
        itemId,
        qty,
        "cancel",
        userId,
        rental._id,
        undefined,
        customerIdStr,
      );
    }
  }

  /** Nova linha em aluguel já em campo: mesmo fluxo da criação (reserva → ativa). */
  private async reserveThenActivateNewRentalLine(
    companyId: string,
    rental: {
      _id: mongoose.Types.ObjectId;
      status: string;
      customerId: mongoose.Types.ObjectId;
    },
    itemId: mongoose.Types.ObjectId,
    quantity: number,
    unitId: string | undefined,
    userId: string,
  ): Promise<void> {
    const customerIdStr = rental.customerId.toString();
    const onField =
      rental.status === "active" || rental.status === "overdue";

    if (onField) {
      await this.updateItemQuantityForRental(
        companyId,
        itemId,
        quantity,
        "reserve",
        userId,
        rental._id,
        unitId,
        customerIdStr,
      );
      await this.updateItemQuantityForRental(
        companyId,
        itemId,
        quantity,
        "activate",
        userId,
        rental._id,
        unitId,
        customerIdStr,
      );
    } else {
      await this.updateItemQuantityForRental(
        companyId,
        itemId,
        quantity,
        "reserve",
        userId,
        rental._id,
        unitId,
        customerIdStr,
      );
    }
  }

  private async sumReturnMovementsForRental(
    companyId: string,
    itemId: mongoose.Types.ObjectId | string,
    rentalId: mongoose.Types.ObjectId,
  ): Promise<number> {
    const movements = await ItemMovement.find({
      companyId,
      itemId,
      referenceId: rentalId,
      type: "return",
    })
      .select("quantity")
      .lean();

    return movements.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0),
      0,
    );
  }

  /**
   * Quantas unidades ainda precisam sair de "alugadas" no estoque para esta devolução.
   * Considera devoluções anteriores (ex.: tentativa que atualizou estoque e falhou no fechamento).
   */
  private async resolveInventoryReturnForRentalLine(
    companyId: string,
    inventoryItem: {
      _id: mongoose.Types.ObjectId | string;
      name?: string;
      quantity?: { rented?: number; reserved?: number; available?: number };
    },
    quantity: number,
    rentalId: mongoose.Types.ObjectId,
  ): Promise<{ applyQuantity: number }> {
    const rented = Number(inventoryItem.quantity?.rented ?? 0);
    const reserved = Number(inventoryItem.quantity?.reserved ?? 0);

    if (reserved >= quantity) {
      throw badRequest(
        `Item "${inventoryItem.name}" não foi ativado: ainda consta como reservado no estoque. Ative o aluguel antes de registrar a devolução.`,
      );
    }

    if (rented >= quantity) {
      return { applyQuantity: quantity };
    }

    const priorReturned = await this.sumReturnMovementsForRental(
      companyId,
      inventoryItem._id,
      rentalId,
    );
    const remainingForRental = Math.max(0, quantity - priorReturned);

    if (remainingForRental === 0) {
      return { applyQuantity: 0 };
    }

    if (rented <= 0) {
      if (priorReturned > 0) {
        return { applyQuantity: 0 };
      }
      throw badRequest(
        `O estoque não registra unidades alugadas para "${inventoryItem.name}" (devolução de ${quantity}). Ative o aluguel antes de registrar a devolução.`,
      );
    }

    return { applyQuantity: Math.min(rented, remainingForRental) };
  }

  private async updateItemQuantityForRental(
    companyId: string,
    itemId: mongoose.Types.ObjectId,
    quantity: number,
    action: "reserve" | "activate" | "return" | "cancel",
    userId: string,
    rentalId: mongoose.Types.ObjectId,
    unitId?: string,
    customerId?: string,
  ): Promise<void> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw notFound("Item not found");
    }

    // =========================
    // ITEM UNITÁRIO
    // =========================
    if (item.trackingType === "unit") {
      if (!unitId) {
        console.warn("[AVISO] Ação de unidade sem unitId", { itemId, rentalId });
        return;
      }

      const unit = item.units?.find((u) => u.unitId === unitId);
      if (!unit) {
        throw notFound("Unidade não encontrada");
      }

      switch (action) {
        case "reserve":
          if (unit.status === "reserved") return; // idempotente

          if (unit.status !== "available") {
            throw badRequest(`Unidade ${unit.unitId} não está disponível`);
          }

          unit.status = "reserved";
          unit.currentRental = rentalId;
          unit.currentCustomer = customerId
            ? new mongoose.Types.ObjectId(customerId)
            : undefined;
          break;

        case "activate":
          if (unit.status === "rented") return; // idempotente

          if (unit.status !== "reserved") {
            throw badRequest(`Unidade ${unit.unitId} não está reservada`);
          }

          unit.status = "rented";
          break;

        case "return":
          //proteção forte
          if (unit.status === "available") return;

          if (unit.status === "reserved") {
            console.warn(
              `Tentativa de devolução em unidade ainda reservada: ${unit.unitId}`,
            );
            return;
          }

          if (unit.status !== "rented") {
            throw badRequest(`Unidade ${unit.unitId} não está alugada`);
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;

        case "cancel":
          if (unit.status === "available") return;

          if (unit.status !== "reserved") {
            console.warn(
              `Cancelamento ignorado - unidade não está reservada: ${unit.unitId}`,
            );
            return;
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;
      }

      // =========================
      // RECÁLCULO BASEADO NAS UNITS (FONTE DA VERDADE)
      // =========================
      const units = item.units ?? [];

      item.quantity.total = units.length;
      item.quantity.available = units.filter(
        (u) => u.status === "available",
      ).length;
      item.quantity.reserved = units.filter(
        (u) => u.status === "reserved",
      ).length;
      item.quantity.rented = units.filter((u) => u.status === "rented").length;
      item.quantity.maintenance = units.filter(
        (u) => u.status === "maintenance",
      ).length;
      item.quantity.damaged = units.filter(
        (u) => u.status === "damaged",
      ).length;

      await item.save();

      await ItemMovement.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId,
        type: action === "return" ? "return" : "rent",
        quantity: 1,
        referenceId: rentalId,
        notes: `Unit ${unit.unitId} ${action}`,
        createdBy: new mongoose.Types.ObjectId(userId),
      });

      return;
    }

    // =========================
    // ITEM QUANTITATIVO
    // =========================
    item.quantity.reserved = Number(item.quantity.reserved || 0);
    const previousQuantity = { ...item.quantity };

    switch (action) {
      case "reserve":
        item.quantity.available -= quantity;
        item.quantity.reserved += quantity;
        break;

      case "activate":
        item.quantity.reserved -= quantity;
        item.quantity.rented += quantity;
        break;

      case "return":
        item.quantity.rented -= quantity;
        item.quantity.available += quantity;
        break;

      case "cancel":
        item.quantity.reserved -= quantity;
        item.quantity.available += quantity;
        break;
    }

    if (
      item.quantity.available < 0 ||
      item.quantity.rented < 0 ||
      item.quantity.reserved < 0
    ) {
      const negativeField =
        item.quantity.rented < 0
          ? "alugada"
          : item.quantity.reserved < 0
            ? "reservada"
            : "disponível";
      console.error("[ERRO] Quantidade negativa após operação:", {
        itemName: item.name,
        itemId: item._id,
        acao: action,
        quantidadeSolicitada: quantity,
        quantidadeAnterior: previousQuantity,
        quantidadeAtual: item.quantity,
        rentalId,
      });

      throw badRequest(
        `Operação inválida de quantidade para "${item.name}": Após ${action} de ${quantity} unidades, a quantidade ${negativeField} ficaria negativa. ${action === "return" ? "Isto pode indicar que o item já foi devolvido ou há inconsistência nos dados." : "Verifique a disponibilidade do item."} Por favor, contate o administrador.`,
      );
    }

    await item.save();

    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId,
      type: action === "return" ? "return" : "rent",
      quantity,
      previousQuantity,
      newQuantity: item.quantity,
      referenceId: rentalId,
      notes: `Rental ${action}: ${quantity} units`,
      createdBy: new mongoose.Types.ObjectId(userId),
    });
  }
  /**
   * NOVO: Solicitar aprovação para alteração no aluguel
   */
  async requestApproval(
    companyId: string,
    rentalId: string,
    requestType: string,
    requestDetails: any,
    userId: string,
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    if (!rental.pendingApprovals) {
      rental.pendingApprovals = [];
    }

    const approval: IRentalPendingApproval = {
      requestedBy: new mongoose.Types.ObjectId(userId),
      requestDate: new Date(),
      requestType,
      requestDetails,
      status: "pending",
      notes,
    };

    rental.pendingApprovals.push(approval);
    await rental.save();

    return rental;
  }

  /**
   * NOVO: Aprovar solicitação pendente
   */
  async approveRequest(
    companyId: string,
    rentalId: string,
    approvalId: string,
    userId: string,
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw notFound("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw notFound("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw conflict("Approval request is not pending");
    }

    // Aplicar a alteração baseada no tipo de solicitação
    await this.applyApprovalChange(rental, approval, userId);

    // Atualizar status da aprovação
    approval.status = "approved";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      approval.requestType,
      approval.requestDetails.previousValue || "",
      approval.requestDetails.newValue || "",
      userId,
      notes,
    );

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Rejeitar solicitação pendente
   */
  async rejectRequest(
    companyId: string,
    rentalId: string,
    approvalId: string,
    userId: string,
    notes: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw notFound("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw notFound("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw conflict("Approval request is not pending");
    }

    approval.status = "rejected";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Aplicar alteração aprovada
   */
  private async applyApprovalChange(
    rental: IRental,
    approval: IRentalPendingApproval,
    userId: string,
  ): Promise<void> {
    const { requestType, requestDetails } = approval;

    switch (requestType) {
      case "rental_type_change":
        // Alterar tipo de aluguel dos itens
        if (requestDetails.items && Array.isArray(requestDetails.items)) {
          for (const itemChange of requestDetails.items) {
            const item = this.findRentalLineItemForPatch(rental, {
              itemId: itemChange.itemId,
              unitId: itemChange.unitId,
              lineId:
                typeof itemChange.lineId === "string"
                  ? itemChange.lineId
                  : undefined,
            });
            if (!item) continue;
            const rkBefore = buildRentalLineKey(item as any);
            await this.removeObsoleteUnpaidBillingsForRentalLineKeys(
              rental.companyId.toString(),
              rental._id,
              new Set([rkBefore]),
            );
            item.rentalType = itemChange.newRentalType;
            item.lastBillingDate = undefined;
            item.nextBillingDate = undefined;
            const lockedEnd = await this.getLatestLockedItemBillingEnd(
              rental.companyId.toString(),
              rental._id,
              item.itemId,
              item.unitId,
              rkBefore,
            );
            if (lockedEnd) {
              item.lastBillingDate = lockedEnd;
              const nextStart = this.addDays(lockedEnd, 1);
              item.nextBillingDate = this.getPeriodEnd(
                nextStart,
                item.rentalType || "daily",
              );
            }
          }
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.itemIndex !== undefined || requestDetails.itemId) {
          const item =
            requestDetails.itemIndex !== undefined
              ? rental.items[requestDetails.itemIndex]
              : this.findRentalLineItemForPatch(rental, {
                  itemId: requestDetails.itemId,
                  unitId: requestDetails.unitId,
                  lineId:
                    typeof requestDetails.lineId === "string"
                      ? requestDetails.lineId
                      : undefined,
                }) ||
                rental.items.find(
                  (i) => i.itemId.toString() === requestDetails.itemId,
                );
          if (item && requestDetails.newRentalType) {
            const rkBefore = buildRentalLineKey(item as any);
            await this.removeObsoleteUnpaidBillingsForRentalLineKeys(
              rental.companyId.toString(),
              rental._id,
              new Set([rkBefore]),
            );
            item.rentalType = requestDetails.newRentalType;
            item.lastBillingDate = undefined;
            item.nextBillingDate = undefined;
            const lockedEnd = await this.getLatestLockedItemBillingEnd(
              rental.companyId.toString(),
              rental._id,
              item.itemId,
              item.unitId,
              rkBefore,
            );
            if (lockedEnd) {
              item.lastBillingDate = lockedEnd;
              const nextStart = this.addDays(lockedEnd, 1);
              item.nextBillingDate = this.getPeriodEnd(
                nextStart,
                item.rentalType || "daily",
              );
            }
            await this.recalcPricingForRental(
              rental,
              rental.companyId.toString(),
            );
          }
        }
        break;

      case "discount":
        // Aplicar desconto
        rental.pricing.discount = requestDetails.discount || 0;
        rental.pricing.discountReason = requestDetails.reason;
        rental.pricing.discountApprovedBy = new mongoose.Types.ObjectId(userId);
        rental.pricing.total = Math.max(
          0,
          rental.pricing.subtotal -
            rental.pricing.discount +
            rental.pricing.lateFee,
        );
        break;

      case "extension":
        // Estender período
        if (requestDetails.newReturnDate) {
          rental.dates.returnScheduled = new Date(requestDetails.newReturnDate);
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        break;

      case "service_addition":
        // Adicionar serviço
        if (!rental.services) {
          rental.services = [];
        }
        rental.services.push(requestDetails.service);
        rental.pricing.servicesSubtotal += requestDetails.service.subtotal;
        rental.pricing.subtotal =
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal;
        rental.pricing.total = Math.max(
          0,
          rental.pricing.subtotal -
            rental.pricing.discount +
            rental.pricing.lateFee,
        );
        break;

      case "status_change":
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
          );
        }
        break;

      case "close_adjustment":
        if (requestDetails?.adjustments?.rentalType) {
          for (const item of rental.items) {
            item.rentalType = requestDetails.adjustments.rentalType;
          }
          rental.dates.billingCycle = requestDetails.adjustments.rentalType;
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
            requestDetails.adjustments,
          );
        }
        break;

      case "rental_update":
        if (requestDetails.newNotes !== undefined) {
          rental.notes = requestDetails.newNotes;
        }
        if (requestDetails.newPickupScheduled) {
          rental.dates.pickupScheduled = new Date(
            requestDetails.newPickupScheduled,
          );
        }
        if (requestDetails.newReturnScheduled) {
          rental.dates.returnScheduled = new Date(
            requestDetails.newReturnScheduled,
          );
        }
        if (Array.isArray(requestDetails.items)) {
          const keysToInvalidate = new Set<string>();
          const touchedSnapshots: Array<{
            item: IRentalItem;
            snapKey: string;
          }> = [];

          const removalChanges = requestDetails.items.filter(
            (c: { removed?: boolean }) => c.removed,
          );
          const otherChanges = requestDetails.items.filter(
            (c: { removed?: boolean }) => !c.removed,
          );

          if (removalChanges.length > 0) {
            if (["completed", "cancelled"].includes(rental.status)) {
              throw badRequest(
                "Não é possível remover itens deste aluguel no status atual.",
              );
            }
            if (
              (rental.items?.length || 0) - removalChanges.length <
              1
            ) {
              throw badRequest("O aluguel deve manter ao menos um item.");
            }

            for (const itemChange of removalChanges) {
              const existingItem = this.findRentalLineItemForPatch(rental, {
                itemId: itemChange.itemId,
                unitId: itemChange.unitId,
                lineId:
                  typeof itemChange.lineId === "string"
                    ? itemChange.lineId
                    : undefined,
              });
              if (!existingItem) continue;

              if (existingItem.returnActual) {
                throw badRequest(
                  "Não é possível remover itens já devolvidos. Use a devolução parcial se ainda houver quantidade em aberto.",
                );
              }
              const snapKey = buildRentalLineKey(existingItem as any);
              const lockedEnd = await this.getLatestLockedItemBillingEnd(
                rental.companyId.toString(),
                rental._id,
                existingItem.itemId,
                existingItem.unitId,
                snapKey,
              );
              if (lockedEnd) {
                throw badRequest(
                  "Não é possível remover este item: existe fechamento quitado ou com baixa vinculada.",
                );
              }
              keysToInvalidate.add(snapKey);
              await this.releaseRentalLineInventory(
                rental.companyId.toString(),
                rental,
                existingItem,
                userId,
              );
              rental.items = (rental.items || []).filter(
                (i) => i !== existingItem,
              );
            }
          }

          for (const itemChange of otherChanges) {
            const inventoryItem = await Item.findOne({
              _id: itemChange.itemId,
              companyId: rental.companyId,
            });
            if (!inventoryItem) {
              throw notFound(`Item ${itemChange.itemId} not found`);
            }

            const isUnit = inventoryItem.trackingType === "unit";
            if (isUnit && !itemChange.unitId) {
              throw badRequest(
                `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
              );
            }

            const patchLineId =
              typeof itemChange.lineId === "string"
                ? itemChange.lineId
                : undefined;
            const existingItem = this.findRentalLineItemForPatch(rental, {
              itemId: itemChange.itemId,
              unitId: itemChange.unitId,
              lineId: patchLineId,
            });

            if (
              !existingItem &&
              !itemChange.isNew &&
              this.rentalLineCountSameEquipment(
                rental,
                itemChange.itemId,
                itemChange.unitId,
              ) > 0
            ) {
              throw badRequest(
                "Este contrato tem mais de uma linha do mesmo equipamento. Informe lineId ao editar cada segmento.",
              );
            }

            if (existingItem && !itemChange.isNew) {
              const snapKey = buildRentalLineKey(existingItem as any);
              keysToInvalidate.add(snapKey);
              touchedSnapshots.push({ item: existingItem, snapKey });

              if (itemChange.newRentalType) {
                existingItem.rentalType = itemChange.newRentalType;
              }
              if (itemChange.newPickupScheduled) {
                existingItem.pickupScheduled = new Date(
                  itemChange.newPickupScheduled,
                );
              }
              if (itemChange.newReturnScheduled !== undefined) {
                existingItem.returnScheduled = itemChange.newReturnScheduled
                  ? new Date(itemChange.newReturnScheduled)
                  : undefined;
              }
            } else if (itemChange.isNew) {
              const quantity = itemChange.quantity || 1;
              if (!isUnit) {
                const available = inventoryItem.quantity.available || 0;
                if (available < quantity) {
                  throw badRequest(
                    `Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
                  );
                }
              } else {
                const unit = inventoryItem.units?.find(
                  (u) => u.unitId === itemChange.unitId,
                );
                if (!unit || unit.status !== "available") {
                  throw badRequest(
                    `Unit ${itemChange.unitId} is not available for rental`,
                  );
                }
              }

              const rentalType: RentalType =
                itemChange.newRentalType || "daily";
              const pickupScheduled = itemChange.newPickupScheduled
                ? new Date(itemChange.newPickupScheduled)
                : rental.dates.pickupScheduled;
              const returnScheduled = itemChange.newReturnScheduled
                ? new Date(itemChange.newReturnScheduled)
                : undefined;
              const pricingEndDate =
                returnScheduled ||
                this.getPricingEndDate(pickupScheduled, rentalType);

              const price = this.calculateRentalPrice(
                inventoryItem.pricing,
                pickupScheduled,
                pricingEndDate,
                rentalType,
              );

              rental.items.push({
                itemId: itemChange.itemId,
                unitId: itemChange.unitId,
                quantity,
                unitPrice: price,
                rentalType,
                pickupScheduled,
                returnScheduled,
                subtotal: price * quantity,
              } as any);

              await this.reserveThenActivateNewRentalLine(
                rental.companyId.toString(),
                rental,
                itemChange.itemId,
                quantity,
                itemChange.unitId,
                userId,
              );
            }
          }

          await this.removeObsoleteUnpaidBillingsForRentalLineKeys(
            rental.companyId.toString(),
            rental._id,
            keysToInvalidate,
          );

          for (const { item: row } of touchedSnapshots) {
            row.lastBillingDate = undefined;
            row.nextBillingDate = undefined;
          }
          const seenRowIdsApproval = new Set<string>();
          for (const { item: row, snapKey } of touchedSnapshots) {
            const rowKeyStr = `${
              row.itemId?.toString?.() || String(row.itemId)
            }\t${String(row.unitId || "")}\t${
              typeof row.lineId === "string" ? row.lineId : ""
            }`;
            if (seenRowIdsApproval.has(rowKeyStr)) continue;
            seenRowIdsApproval.add(rowKeyStr);

            const lockedEnd = await this.getLatestLockedItemBillingEnd(
              rental.companyId.toString(),
              rental._id,
              row.itemId,
              row.unitId,
              snapKey,
            );
            if (lockedEnd) {
              row.lastBillingDate = lockedEnd;
              const nextStart = this.addDays(lockedEnd, 1);
              row.nextBillingDate = this.getPeriodEnd(
                nextStart,
                row.rentalType || "daily",
              );
            }
          }

          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.services !== undefined) {
          const { services, servicesSubtotal } =
            this.mapRentalServicesFromPayload(requestDetails.services);
          rental.services = services.length > 0 ? services : undefined;
          rental.pricing.servicesSubtotal = servicesSubtotal;
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        break;

      default:
        // Outros tipos de alteração podem ser adicionados aqui
        break;
    }
  }

  /**
   * NOVO: Adicionar entrada no histórico de alterações
   */
  private async addChangeHistory(
    rental: IRental,
    changeType: string,
    previousValue: string,
    newValue: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    if (!rental.changeHistory) {
      rental.changeHistory = [];
    }

    const historyEntry: IRentalChangeHistory = {
      date: new Date(),
      changedBy: new mongoose.Types.ObjectId(userId),
      changeType,
      previousValue,
      newValue,
      reason,
      approvedBy: new mongoose.Types.ObjectId(userId),
    };

    rental.changeHistory.push(historyEntry);
  }

  /**
   * NOVO: Listar aprovações pendentes
   */
  async getPendingApprovals(companyId: string): Promise<IRental[]> {
    return Rental.find({
      companyId,
      "pendingApprovals.status": "pending",
    })
      .populate("customerId", "name cpfCnpj")
      .populate("pendingApprovals.requestedBy", "name email")
      .sort({ createdAt: -1 });
  }

  /**
   * NOVO: Aplicar desconto (com aprovação se necessário)
   */
  async applyDiscount(
    companyId: string,
    rentalId: string,
    discount: number,
    discountReason: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw notFound("Rental not found");
    }

    const subtotal = rental.pricing.subtotal;
    const discountPercent = (discount / subtotal) * 100;

    // Se desconto > 10% ou não for admin, requer aprovação
    if (discountPercent > 10 && !isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        "discount",
        {
          discount,
          reason: discountReason,
          previousValue: rental.pricing.discount.toString(),
          newValue: discount.toString(),
        },
        userId,
        `Desconto de ${discountPercent.toFixed(2)}% solicitado`,
      );
    }

    // Aplicar desconto diretamente se admin ou <= 10%
    rental.pricing.discount = discount;
    rental.pricing.discountReason = discountReason;
    rental.pricing.discountApprovedBy = isAdmin
      ? new mongoose.Types.ObjectId(userId)
      : undefined;
    rental.pricing.total = Math.max(0, subtotal - discount + rental.pricing.lateFee);

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      "discount",
      rental.pricing.discount.toString(),
      discount.toString(),
      userId,
      discountReason,
    );

    await rental.save();
    return rental;
  }

  async changeRentalTypeFromEvent(
    companyId: string,
    rentalId: string,
    itemId: string,
    newRentalType: RentalType,
    userId: string,
    options?: {
      unitId?: string;
      lineId?: string;
      effectiveDate?: Date;
      notes?: string;
    },
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Rental not found");
    }

    const item = this.findOpenRentalItem(
      rental.items,
      itemId,
      options?.unitId,
      options?.lineId,
    );
    if (!item) {
      throw notFound("Item not found in rental");
    }

    const previousRentalType = item.rentalType || "daily";
    if (previousRentalType === newRentalType) {
      return rental;
    }

    const inventoryItem = await Item.findOne({
      _id: item.itemId,
      companyId,
    });
    if (!inventoryItem) {
      throw notFound("Item not found");
    }
    this.assertConfiguredRateForRentalType(inventoryItem, newRentalType);

    const effectiveNorm = options?.effectiveDate
      ? this.normalizeDate(options.effectiveDate)
      : this.normalizeDate(new Date());

    const periodStartForClose = item.lastBillingDate
      ? this.addDays(this.normalizeDate(new Date(item.lastBillingDate)), 1)
      : this.normalizeDate(
          new Date(item.pickupScheduled || rental.dates.pickupScheduled),
        );

    if (effectiveNorm.getTime() > periodStartForClose.getTime()) {
      await billingService.createPeriodicBillingForItem(
        companyId,
        rental,
        item,
        periodStartForClose,
        effectiveNorm,
        userId,
        {
          includeServices: false,
          notes: options?.notes || "Fechamento por mudança de tipo",
          status: "approved",
        },
      );
      item.lastBillingDate = effectiveNorm;
    }

    item.rentalType = newRentalType;
    const anchor = item.lastBillingDate
      ? this.normalizeDate(new Date(item.lastBillingDate))
      : periodStartForClose;
    item.nextBillingDate = this.getPeriodEnd(
      this.addDays(anchor, 1),
      newRentalType,
    );

    await this.addChangeHistory(
      rental,
      "rental_type_change",
      previousRentalType,
      newRentalType,
      userId,
      options?.notes || "Alteração de tipo no evento",
    );

    await rental.save();
    await this.syncBillingsAfterRentalChange(companyId, rentalId, userId);
    return Rental.findOne({ _id: rentalId, companyId });
  }

  // compatibilidade com endpoint legado baseado em índice
  async changeRentalType(
    companyId: string,
    rentalId: string,
    itemIndex: number,
    newRentalType: RentalType,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw notFound("Rental not found");
    }
    if (itemIndex < 0 || itemIndex >= rental.items.length) {
      throw badRequest("Item index out of range");
    }

    const item = rental.items[itemIndex];
    return this.changeRentalTypeFromEvent(
      companyId,
      rentalId,
      item.itemId.toString(),
      newRentalType,
      userId,
      { unitId: item.unitId },
    );
  }
}

export const rentalService = new RentalService();
