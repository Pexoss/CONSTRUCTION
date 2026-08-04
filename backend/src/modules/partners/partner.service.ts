import mongoose from "mongoose";
import { Partner } from "./partner.model";
import { PartnerLoan } from "./partner-loan.model";
import { IPartner, IPartnerLoan, PartnerLoanStatus } from "./partner.types";
import { badRequest, notFound } from "../../shared/utils/http-error.util";

class PartnerService {
  async createPartner(companyId: string, data: any): Promise<IPartner> {
    const partner = await Partner.create({
      companyId,
      name: String(data.name || "").trim(),
      phone: data.phone?.trim() || undefined,
      email: data.email?.trim() || undefined,
      document: data.document?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      isActive: data.isActive !== false,
    });
    return partner;
  }

  async getPartners(
    companyId: string,
    filters: {
      search?: string;
      isActive?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ partners: IPartner[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const query: Record<string, unknown> = { companyId };

    if (typeof filters.isActive === "boolean") {
      query.isActive = filters.isActive;
    }
    if (filters.search?.trim()) {
      const term = filters.search.trim();
      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { document: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
      ];
    }

    const [partners, total] = await Promise.all([
      Partner.find(query)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Partner.countDocuments(query),
    ]);

    return { partners, total, page, limit };
  }

  async getPartnerById(
    companyId: string,
    partnerId: string,
  ): Promise<IPartner | null> {
    return Partner.findOne({ _id: partnerId, companyId });
  }

  async updatePartner(
    companyId: string,
    partnerId: string,
    data: any,
  ): Promise<IPartner> {
    const partner = await Partner.findOne({ _id: partnerId, companyId });
    if (!partner) throw notFound("Parceiro não encontrado");

    if (data.name !== undefined) partner.name = String(data.name).trim();
    if (data.phone !== undefined) partner.phone = data.phone?.trim() || undefined;
    if (data.email !== undefined) partner.email = data.email?.trim() || undefined;
    if (data.document !== undefined) {
      partner.document = data.document?.trim() || undefined;
    }
    if (data.notes !== undefined) partner.notes = data.notes?.trim() || undefined;
    if (typeof data.isActive === "boolean") partner.isActive = data.isActive;

    await partner.save();
    return partner;
  }

  async deletePartner(companyId: string, partnerId: string): Promise<void> {
    const openLoans = await PartnerLoan.countDocuments({
      companyId,
      partnerId,
      status: { $in: ["with_customer", "awaiting_partner_return"] },
    });
    if (openLoans > 0) {
      throw badRequest(
        "Não é possível excluir parceiro com equipamentos ainda em aberto. Inative o cadastro.",
      );
    }
    const deleted = await Partner.deleteOne({ _id: partnerId, companyId });
    if (deleted.deletedCount === 0) throw notFound("Parceiro não encontrado");
  }

  async getLoans(
    companyId: string,
    filters: {
      partnerId?: string;
      status?: PartnerLoanStatus;
      rentalId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    loans: IPartnerLoan[];
    total: number;
    page: number;
    limit: number;
    summary: {
      withCustomerQty: number;
      awaitingPartnerReturnQty: number;
      pendingAgreedCost: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const query: Record<string, unknown> = { companyId };

    if (filters.partnerId) query.partnerId = filters.partnerId;
    if (filters.status) query.status = filters.status;
    if (filters.rentalId) query.rentalId = filters.rentalId;
    if (filters.startDate || filters.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          createdAt.$gte = start;
        }
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          createdAt.$lte = end;
        }
      }
      if (Object.keys(createdAt).length > 0) {
        query.createdAt = createdAt;
      }
    }

    const [loans, total, openLoans] = await Promise.all([
      PartnerLoan.find(query)
        .populate("partnerId", "name phone document")
        .populate("itemId", "name sku customId")
        .populate("rentalId", "rentalNumber status")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Partner.countDocuments(query).then(() => PartnerLoan.countDocuments(query)),
      PartnerLoan.find({
        companyId,
        status: { $in: ["with_customer", "awaiting_partner_return"] },
        ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
      }).select("status quantityWithCustomer agreedCost quantity returnedToPartnerQty"),
    ]);

    let withCustomerQty = 0;
    let awaitingPartnerReturnQty = 0;
    let pendingAgreedCost = 0;
    for (const loan of openLoans) {
      if (loan.status === "with_customer") {
        withCustomerQty += Number(loan.quantityWithCustomer || 0);
      }
      if (loan.status === "awaiting_partner_return") {
        awaitingPartnerReturnQty += Math.max(
          0,
          Number(loan.quantity || 0) - Number(loan.returnedToPartnerQty || 0),
        );
      }
      const remaining =
        Number(loan.quantity || 0) - Number(loan.returnedToPartnerQty || 0);
      if (remaining > 0 && Number(loan.agreedCost || 0) > 0) {
        const unit =
          Number(loan.quantity || 0) > 0
            ? Number(loan.agreedCost) / Number(loan.quantity)
            : 0;
        pendingAgreedCost += Number((unit * remaining).toFixed(2));
      }
    }

    return {
      loans,
      total,
      page,
      limit,
      summary: {
        withCustomerQty,
        awaitingPartnerReturnQty,
        pendingAgreedCost: Number(pendingAgreedCost.toFixed(2)),
      },
    };
  }

  async returnToPartner(
    companyId: string,
    loanId: string,
    quantity?: number,
  ): Promise<IPartnerLoan> {
    const loan = await PartnerLoan.findOne({ _id: loanId, companyId });
    if (!loan) throw notFound("Empréstimo de parceiro não encontrado");

    if (loan.status === "cancelled") {
      throw badRequest("Empréstimo cancelado");
    }
    if (loan.status === "returned_to_partner") {
      throw badRequest("Equipamento já devolvido ao parceiro");
    }
    if (loan.status === "with_customer") {
      throw badRequest(
        "Aguarde a devolução do cliente antes de devolver ao parceiro",
      );
    }

    const remaining = Math.max(
      0,
      Number(loan.quantity) - Number(loan.returnedToPartnerQty || 0),
    );
    if (remaining <= 0) {
      loan.status = "returned_to_partner";
      loan.returnedToPartnerAt = new Date();
      await loan.save();
      return loan;
    }

    const qty = quantity != null ? Math.max(1, Math.floor(quantity)) : remaining;
    if (qty > remaining) {
      throw badRequest(
        `Quantidade a devolver (${qty}) maior que o pendente (${remaining})`,
      );
    }

    loan.returnedToPartnerQty = Number(loan.returnedToPartnerQty || 0) + qty;
    if (loan.returnedToPartnerQty >= loan.quantity) {
      loan.status = "returned_to_partner";
      loan.returnedToPartnerAt = new Date();
      loan.returnedToPartnerQty = loan.quantity;
    }
    await loan.save();
    return loan;
  }

  /**
   * Cria ou atualiza PartnerLoan a partir da linha do aluguel.
   */
  async upsertLoanFromRentalLine(
    companyId: string,
    rentalId: string,
    line: {
      lineId?: string;
      itemId: mongoose.Types.ObjectId | string;
      quantity: number;
      partnerSupply?: {
        partnerId: mongoose.Types.ObjectId | string;
        quantity: number;
        agreedCost?: number;
        notes?: string;
      };
    },
  ): Promise<void> {
    const lineId = String(line.lineId || "").trim();
    if (!lineId) return;

    const partnerQty = Math.max(0, Number(line.partnerSupply?.quantity ?? 0));
    if (!line.partnerSupply || partnerQty <= 0) {
      await PartnerLoan.updateMany(
        {
          companyId,
          rentalId,
          lineId,
          status: { $in: ["with_customer", "awaiting_partner_return"] },
        },
        { $set: { status: "cancelled" } },
      );
      return;
    }

    const partnerId = String(line.partnerSupply.partnerId);
    const partner = await Partner.findOne({
      _id: partnerId,
      companyId,
      isActive: true,
    });
    if (!partner) {
      throw badRequest("Parceiro inválido ou inativo");
    }
    if (partnerQty > Number(line.quantity)) {
      throw badRequest(
        "Quantidade de terceiros não pode ser maior que a quantidade da linha",
      );
    }

    const ownQuantity = Math.max(0, Number(line.quantity) - partnerQty);
    const existing = await PartnerLoan.findOne({ companyId, rentalId, lineId });

    if (existing && existing.status === "returned_to_partner") {
      return;
    }

    if (existing) {
      existing.partnerId = new mongoose.Types.ObjectId(partnerId);
      existing.itemId = new mongoose.Types.ObjectId(String(line.itemId));
      existing.quantity = partnerQty;
      existing.ownQuantity = ownQuantity;
      existing.agreedCost =
        line.partnerSupply.agreedCost != null
          ? Number(line.partnerSupply.agreedCost)
          : existing.agreedCost;
      existing.notes = line.partnerSupply.notes ?? existing.notes;
      if (existing.status === "cancelled") {
        existing.status = "with_customer";
        existing.quantityWithCustomer = partnerQty;
        existing.returnedToPartnerQty = 0;
        existing.returnedToPartnerAt = undefined;
      } else if (existing.status === "with_customer") {
        existing.quantityWithCustomer = Math.min(
          partnerQty,
          Math.max(0, Number(existing.quantityWithCustomer || partnerQty)),
        );
        if (existing.quantityWithCustomer > partnerQty) {
          existing.quantityWithCustomer = partnerQty;
        }
        // Se aumentou a qtd de parceiro, assume o extra ainda com o cliente
        if (partnerQty > Number(existing.quantity)) {
          existing.quantityWithCustomer = partnerQty;
        }
      }
      await existing.save();
      return;
    }

    await PartnerLoan.create({
      companyId,
      partnerId,
      rentalId,
      lineId,
      itemId: line.itemId,
      quantity: partnerQty,
      ownQuantity,
      quantityWithCustomer: partnerQty,
      agreedCost: line.partnerSupply.agreedCost,
      notes: line.partnerSupply.notes,
      status: "with_customer",
      returnedToPartnerQty: 0,
    });
  }

  async syncLoansForRental(
    companyId: string,
    rentalId: string,
    items: Array<{
      lineId?: string;
      itemId: mongoose.Types.ObjectId | string;
      quantity: number;
      returnActual?: Date;
      partnerSupply?: {
        partnerId: mongoose.Types.ObjectId | string;
        quantity: number;
        agreedCost?: number;
        notes?: string;
      };
    }>,
  ): Promise<void> {
    const activeLineIds = new Set<string>();
    for (const item of items) {
      const lineId = String(item.lineId || "").trim();
      if (!lineId) continue;
      activeLineIds.add(lineId);
      await this.upsertLoanFromRentalLine(companyId, rentalId, item);
    }

    await PartnerLoan.updateMany(
      {
        companyId,
        rentalId,
        lineId: { $nin: [...activeLineIds] },
        status: { $in: ["with_customer", "awaiting_partner_return"] },
      },
      { $set: { status: "cancelled" } },
    );
  }

  /**
   * Ao devolver unidades do cliente: baixa primeiro o estoque próprio (na chamada do rental),
   * e reduz quantityWithCustomer do loan.
   */
  async applyCustomerReturn(
    companyId: string,
    rentalId: string,
    lineId: string | undefined,
    returnedQuantity: number,
    partnerQtyOnLine: number,
    ownQtyOnLine: number,
  ): Promise<{ inventoryOwnReturn: number }> {
    const partnerOnLine = Math.max(0, partnerQtyOnLine);
    const ownOnLine = Math.max(0, ownQtyOnLine);
    const returned = Math.max(0, Math.floor(returnedQuantity));

    const ownReturn = Math.min(returned, ownOnLine);
    const partnerReturnFromCustomer = Math.max(0, returned - ownReturn);

    const lid = String(lineId || "").trim();
    if (lid && partnerOnLine > 0) {
      const loan = await PartnerLoan.findOne({
        companyId,
        rentalId,
        lineId: lid,
        status: { $in: ["with_customer", "awaiting_partner_return"] },
      });
      if (loan) {
        loan.quantityWithCustomer = Math.max(
          0,
          Number(loan.quantityWithCustomer || 0) - partnerReturnFromCustomer,
        );
        if (loan.quantityWithCustomer <= 0) {
          loan.quantityWithCustomer = 0;
          if (loan.status === "with_customer") {
            loan.status = "awaiting_partner_return";
          }
        }
        await loan.save();
      }
    }

    return { inventoryOwnReturn: ownReturn };
  }

  async cancelLoansForRental(companyId: string, rentalId: string): Promise<void> {
    await PartnerLoan.updateMany(
      {
        companyId,
        rentalId,
        status: { $in: ["with_customer", "awaiting_partner_return"] },
      },
      { $set: { status: "cancelled" } },
    );
  }

  async reassignLoanLineId(
    companyId: string,
    rentalId: string,
    fromLineId: string,
    toLineId: string,
  ): Promise<void> {
    const from = String(fromLineId || "").trim();
    const to = String(toLineId || "").trim();
    if (!from || !to || from === to) return;
    await PartnerLoan.updateOne(
      { companyId, rentalId, lineId: from },
      { $set: { lineId: to } },
    );
  }
}

export const partnerService = new PartnerService();

/** Quantidade própria (estoque da empresa) em uma linha de aluguel. */
export function ownStockQuantity(item: {
  quantity: number;
  partnerSupply?: { quantity?: number } | null;
}): number {
  const total = Math.max(0, Number(item.quantity || 0));
  const partner = Math.max(0, Number(item.partnerSupply?.quantity ?? 0));
  return Math.max(0, total - Math.min(partner, total));
}

export function partnerStockQuantity(item: {
  quantity: number;
  partnerSupply?: { quantity?: number } | null;
}): number {
  const total = Math.max(0, Number(item.quantity || 0));
  const partner = Math.max(0, Number(item.partnerSupply?.quantity ?? 0));
  return Math.min(partner, total);
}
