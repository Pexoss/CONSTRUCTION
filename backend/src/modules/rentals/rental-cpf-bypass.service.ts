import crypto from "crypto";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { Company } from "../companies/company.model";
import { RentalCpfBypassToken } from "./rental-cpf-bypass.model";
import { emailService } from "../../shared/services/email.service";
import { badRequest, forbidden, notFound } from "../../shared/utils/http-error.util";
import { canBypassCustomerCpfAsAdmin } from "../../helpers/UserPermission";
import { RoleType } from "../../shared/constants/roles";

const TOKEN_TTL_MINUTES = 30;

function generateBypassCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

class RentalCpfBypassService {
  async requestBypassCode(
    companyId: string,
    customerId: string,
    userId: string,
  ): Promise<{
    tokenId: string;
    expiresAt: Date;
    adminEmailsNotified: number;
  }> {
    const user = await User.findOne({ _id: userId, companyId, isActive: true });
    if (!user) throw notFound("Usuário não encontrado");

    if (canBypassCustomerCpfAsAdmin(user.role as RoleType)) {
      throw badRequest(
        "Administradores podem confirmar o aluguel sem CPF diretamente na tela.",
      );
    }

    const customer = await Customer.findOne({ _id: customerId, companyId });
    if (!customer) throw notFound("Cliente não encontrado");

    const admins = await User.find({
      companyId,
      isActive: true,
      role: { $in: ["admin", "superadmin"] },
    }).select("name email");

    const adminEmails = admins
      .map((admin) => admin.email?.trim())
      .filter(Boolean) as string[];

    if (!adminEmails.length) {
      throw badRequest(
        "Nenhum administrador com e-mail cadastrado para enviar o código.",
      );
    }

    const company = await Company.findById(companyId).select("name");
    const code = generateBypassCode();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await RentalCpfBypassToken.updateMany(
      {
        companyId,
        customerId,
        requestedBy: userId,
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
    );

    const token = await RentalCpfBypassToken.create({
      companyId,
      customerId,
      requestedBy: userId,
      code,
      expiresAt,
    });

    const companyName = company?.name || "sua empresa";
    const customerName = customer.name || "Cliente sem nome";
    const employeeName = user.name || user.email;

    const subject = `[${companyName}] Código para aluguel sem CPF/CNPJ`;
    const text = [
      `Olá,`,
      ``,
      `${employeeName} solicitou autorização para criar um aluguel sem CPF/CNPJ cadastrado.`,
      ``,
      `Cliente: ${customerName}`,
      `Código de autorização: ${code}`,
      `Validade: ${expiresAt.toLocaleString("pt-BR")}`,
      ``,
      `Informe este código ao funcionário para que ele conclua o aluguel.`,
    ].join("\n");

    await emailService.sendEmail({
      to: adminEmails,
      subject,
      text,
    });

    return {
      tokenId: token._id.toString(),
      expiresAt,
      adminEmailsNotified: adminEmails.length,
    };
  }

  async consumeBypassToken(
    companyId: string,
    customerId: string,
    userId: string,
    tokenId: string,
    code: string,
  ): Promise<void> {
    const user = await User.findOne({ _id: userId, companyId, isActive: true });
    if (!user) throw notFound("Usuário não encontrado");

    if (canBypassCustomerCpfAsAdmin(user.role as RoleType)) {
      throw forbidden("Administradores não precisam de código de autorização.");
    }

    const normalizedCode = String(code || "").trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      throw badRequest("Informe o código de 6 dígitos enviado ao administrador.");
    }

    const token = await RentalCpfBypassToken.findOne({
      _id: tokenId,
      companyId,
      customerId,
      requestedBy: userId,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!token) {
      throw badRequest(
        "Código expirado ou inválido. Solicite um novo código ao administrador.",
      );
    }

    if (token.code !== normalizedCode) {
      throw badRequest("Código incorreto.");
    }

    token.usedAt = new Date();
    await token.save();
  }

  async listPendingBypassCodes(companyId: string, userId: string) {
    const user = await User.findOne({ _id: userId, companyId, isActive: true });
    if (!user) throw notFound("Usuário não encontrado");

    if (!canBypassCustomerCpfAsAdmin(user.role as RoleType)) {
      throw forbidden("Somente administradores podem visualizar os códigos.");
    }

    const now = new Date();
    const tokens = await RentalCpfBypassToken.find({
      companyId,
      usedAt: { $exists: false },
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .populate("customerId", "name cpfCnpj")
      .populate("requestedBy", "name email role")
      .lean();

    return tokens.map((token) => ({
      _id: String(token._id),
      code: token.code,
      customer: token.customerId,
      requestedBy: token.requestedBy,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    }));
  }
}

export const rentalCpfBypassService = new RentalCpfBypassService();
