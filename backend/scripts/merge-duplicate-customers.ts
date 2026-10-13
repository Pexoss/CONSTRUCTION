/**
 * Unifica clientes duplicados:
 * 1) transfere aluguéis, fechamentos, cobranças, faturas e estoque
 *    do cliente que sai para o que permanece;
 * 2) bloqueia o duplicado (isBlocked), como na tela de clientes;
 * 3) limpa o CPF/CNPJ do bloqueado para não colidir com o ativo.
 *
 * Uso:
 *   npx ts-node scripts/merge-duplicate-customers.ts --list
 *   npx ts-node scripts/merge-duplicate-customers.ts --keep=ID --drop=ID
 *   npx ts-node scripts/merge-duplicate-customers.ts --keep=ID --drop=ID --apply
 *
 * Sem --apply só mostra o que seria alterado (dry-run).
 * --drop pode repetir. --company=ID restringe a uma empresa.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Customer } from "../src/modules/customers/customer.model";
import { Rental } from "../src/modules/rentals/rental.model";
import { Billing } from "../src/modules/billings/billing.model";
import { Charge } from "../src/modules/charges/charge.model";
import { Invoice } from "../src/modules/invoices/invoice.model";
import { Item } from "../src/modules/inventory/item.model";
import { RentalCpfBypassToken } from "../src/modules/rentals/rental-cpf-bypass.model";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(`--${name}`);
const getArg = (name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const getArgAll = (name: string) =>
  args
    .filter((arg) => arg.startsWith(`--${name}=`))
    .map((arg) => arg.slice(name.length + 3))
    .filter(Boolean);

const isApply = hasFlag("apply");
const isList = hasFlag("list");
const companyFilter = getArg("company");
const keepId = getArg("keep");
const dropIds = [...new Set(getArgAll("drop"))];
const blockReasonArg = getArg("reason");

const fold = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const digits = (value?: string | null) => String(value || "").replace(/\D/g, "");

const oid = (value: string) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new Error(`ID inválido: ${value}`);
  }
  return new mongoose.Types.ObjectId(value);
};

const scoped = (extra: Record<string, unknown> = {}) => {
  if (!companyFilter) return extra;
  return { ...extra, companyId: oid(companyFilter) };
};

const log = (message: string) => console.log(message);

const addressKey = (row: any) =>
  [
    fold(row?.street),
    fold(row?.number),
    digits(row?.zipCode),
    fold(row?.city),
    fold(row?.neighborhood),
  ].join("|");

const workKey = (row: any) => fold(row?.workName);

const responsibleKey = (row: any) =>
  [fold(row?.name), fold(row?.role), digits(row?.phone)].join("|");

type LinkCounts = {
  rentals: number;
  billings: number;
  charges: number;
  invoices: number;
  tokens: number;
  itemUnits: number;
};

const countLinks = async (customerId: mongoose.Types.ObjectId): Promise<LinkCounts> => {
  const filter = scoped({ customerId });
  const [rentals, billings, charges, invoices, tokens, itemUnits] =
    await Promise.all([
      Rental.countDocuments(filter),
      Billing.countDocuments(filter),
      Charge.countDocuments(filter),
      Invoice.countDocuments(filter),
      RentalCpfBypassToken.countDocuments(filter),
      Item.countDocuments(scoped({ "units.currentCustomer": customerId })),
    ]);
  return { rentals, billings, charges, invoices, tokens, itemUnits };
};

const printCounts = (title: string, counts: LinkCounts) => {
  log(
    `  ${title}: aluguéis=${counts.rentals} fechamentos=${counts.billings} cobranças=${counts.charges} faturas=${counts.invoices} bypass=${counts.tokens} unidades=${counts.itemUnits}`,
  );
};

const listDuplicateCandidates = async () => {
  const customers = await Customer.find(scoped())
    .select("name cpfCnpj phone email isBlocked companyId createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const byDoc = new Map<string, any[]>();
  const byNamePhone = new Map<string, any[]>();

  for (const customer of customers) {
    const doc = digits(customer.cpfCnpj);
    if (doc.length >= 11) {
      const key = `${String(customer.companyId)}|doc|${doc}`;
      byDoc.set(key, [...(byDoc.get(key) || []), customer]);
      continue;
    }
    const name = fold(customer.name);
    const phone = digits(customer.phone);
    if (name.length >= 3 && phone.length >= 8) {
      const key = `${String(customer.companyId)}|np|${name}|${phone}`;
      byNamePhone.set(key, [...(byNamePhone.get(key) || []), customer]);
    }
  }

  const groups = [...byDoc.values(), ...byNamePhone.values()].filter(
    (rows) => rows.length > 1,
  );

  if (groups.length === 0) {
    log("Nenhum grupo duplicado encontrado (mesmo CPF/CNPJ ou mesmo nome+telefone).");
    return;
  }

  log(`Encontrados ${groups.length} grupo(s) duplicado(s):\n`);
  for (const group of groups) {
    const label = digits(group[0].cpfCnpj)
      ? `CPF/CNPJ ${group[0].cpfCnpj}`
      : `${group[0].name} / ${group[0].phone}`;
    log(`--- ${label} ---`);
    for (const customer of group) {
      const counts = await countLinks(customer._id);
      log(
        `  ${customer._id} | ${customer.isBlocked ? "BLOQUEADO" : "ativo"} | ${customer.name} | criado ${customer.createdAt?.toISOString?.() || ""}`,
      );
      printCounts("vínculos", counts);
    }
    log(
      `  sugerido --keep=${group[0]._id} ${group
        .slice(1)
        .map((row) => `--drop=${row._id}`)
        .join(" ")}`,
    );
    log("");
  }
};

const mergeProfile = (keep: any, drop: any) => {
  const workIdMap = new Map<string, string>();
  const responsibleIdMap = new Map<string, string>();

  const keepAddresses = [...(keep.addresses || [])];
  const addressIndexMap = new Map<number, number>();
  (drop.addresses || []).forEach((address: any, oldIndex: number) => {
    const key = addressKey(address);
    const existingIndex = keepAddresses.findIndex(
      (row) => addressKey(row) === key && key !== "||||",
    );
    if (existingIndex >= 0) {
      addressIndexMap.set(oldIndex, existingIndex);
      return;
    }
    addressIndexMap.set(oldIndex, keepAddresses.length);
    keepAddresses.push(address);
  });

  const keepWorks = [...(keep.works || [])];
  for (const work of drop.works || []) {
    const oldWorkId = String(work.workId || "");
    const existing = keepWorks.find((row) => workKey(row) === workKey(work) && workKey(work));
    const nextAddressIndex = addressIndexMap.has(Number(work.addressIndex))
      ? addressIndexMap.get(Number(work.addressIndex))!
      : Math.max(0, Number(work.addressIndex) || 0);
    if (existing) {
      if (oldWorkId) workIdMap.set(oldWorkId, String(existing.workId));
      const mergedRentals = new Set([
        ...(existing.activeRentals || []).map((id: any) => String(id)),
        ...(work.activeRentals || []).map((id: any) => String(id)),
      ]);
      existing.activeRentals = [...mergedRentals].map(
        (id) => new mongoose.Types.ObjectId(id),
      );
      continue;
    }
    keepWorks.push({
      ...work,
      addressIndex: nextAddressIndex,
    });
  }

  const keepResponsibles = [...(keep.responsibles || [])];
  for (const responsible of drop.responsibles || []) {
    const oldId = String(responsible._id || "");
    const existing = keepResponsibles.find(
      (row) => responsibleKey(row) === responsibleKey(responsible) && fold(responsible.name),
    );
    if (existing) {
      if (oldId && existing._id) responsibleIdMap.set(oldId, String(existing._id));
      continue;
    }
    keepResponsibles.push(responsible);
  }

  return {
    addresses: keepAddresses,
    works: keepWorks,
    responsibles: keepResponsibles,
    workIdMap,
    responsibleIdMap,
  };
};

const reassignCustomerLinks = async (
  keepIdValue: mongoose.Types.ObjectId,
  dropIdValue: mongoose.Types.ObjectId,
  workIdMap: Map<string, string>,
  responsibleIdMap: Map<string, string>,
) => {
  const filter = scoped({ customerId: dropIdValue });
  const result = {
    rentals: 0,
    billings: 0,
    charges: 0,
    invoices: 0,
    tokens: 0,
    itemUnits: 0,
    workRemaps: 0,
    responsibleRemaps: 0,
  };

  const rentals = await Rental.find(filter);
  for (const rental of rentals) {
    rental.customerId = keepIdValue;
    const currentWorkId = String(rental.workAddress?.workId || "");
    if (currentWorkId && workIdMap.has(currentWorkId)) {
      rental.workAddress!.workId = new mongoose.Types.ObjectId(
        workIdMap.get(currentWorkId)!,
      );
      result.workRemaps += 1;
    }
    const financialId = String(
      rental.financialResponsibleContact?.customerResponsibleId || "",
    );
    if (financialId && responsibleIdMap.has(financialId)) {
      rental.financialResponsibleContact!.customerResponsibleId =
        new mongoose.Types.ObjectId(responsibleIdMap.get(financialId)!);
      result.responsibleRemaps += 1;
    }
    const workRespId = String(
      rental.workResponsibleContact?.customerResponsibleId || "",
    );
    if (workRespId && responsibleIdMap.has(workRespId)) {
      rental.workResponsibleContact!.customerResponsibleId =
        new mongoose.Types.ObjectId(responsibleIdMap.get(workRespId)!);
      result.responsibleRemaps += 1;
    }
    await rental.save();
    result.rentals += 1;
  }

  result.billings = (
    await Billing.updateMany(filter, { $set: { customerId: keepIdValue } })
  ).modifiedCount;
  result.charges = (
    await Charge.updateMany(filter, { $set: { customerId: keepIdValue } })
  ).modifiedCount;
  result.invoices = (
    await Invoice.updateMany(filter, { $set: { customerId: keepIdValue } })
  ).modifiedCount;
  result.tokens = (
    await RentalCpfBypassToken.updateMany(filter, {
      $set: { customerId: keepIdValue },
    })
  ).modifiedCount;
  result.itemUnits = (
    await Item.updateMany(
      scoped({ "units.currentCustomer": dropIdValue }),
      { $set: { "units.$[unit].currentCustomer": keepIdValue } },
      { arrayFilters: [{ "unit.currentCustomer": dropIdValue }] },
    )
  ).modifiedCount;

  return result;
};

const blockDuplicate = async (drop: any, keep: any) => {
  const reason =
    blockReasonArg ||
    `Duplicado unificado no cliente ${keep.name} (${keep._id}) em ${new Date().toISOString()}`;
  const notes = [String(drop.notes || "").trim(), `Bloqueado por duplicidade. ${reason}`]
    .filter(Boolean)
    .join("\n");

  await Customer.updateOne(
    { _id: drop._id },
    {
      $set: {
        isBlocked: true,
        blockReason: reason,
        notes,
      },
      $unset: { cpfCnpj: 1 },
    },
  );
};

const mergeOne = async (keepIdRaw: string, dropIdRaw: string) => {
  if (keepIdRaw === dropIdRaw) {
    throw new Error("keep e drop não podem ser o mesmo cliente");
  }
  const keep = await Customer.findById(keepIdRaw);
  const drop = await Customer.findById(dropIdRaw);
  if (!keep) throw new Error(`Cliente keep não encontrado: ${keepIdRaw}`);
  if (!drop) throw new Error(`Cliente drop não encontrado: ${dropIdRaw}`);
  if (String(keep.companyId) !== String(drop.companyId)) {
    throw new Error("Os dois clientes precisam ser da mesma empresa");
  }
  if (companyFilter && String(keep.companyId) !== companyFilter) {
    throw new Error("Cliente fora da empresa informada em --company");
  }

  const beforeDrop = await countLinks(drop._id);
  const beforeKeep = await countLinks(keep._id);

  log(`Keep : ${keep._id} | ${keep.isBlocked ? "BLOQUEADO" : "ativo"} | ${keep.name}`);
  printCounts("já no keep", beforeKeep);
  log(`Drop : ${drop._id} | ${drop.isBlocked ? "BLOQUEADO" : "ativo"} | ${drop.name}`);
  printCounts("a transferir", beforeDrop);

  if (!isApply) {
    log("Dry-run: nada foi gravado. Repita com --apply para executar.");
    return;
  }

  const merged = mergeProfile(keep.toObject(), drop.toObject());
  keep.addresses = merged.addresses;
  keep.works = merged.works;
  keep.responsibles = merged.responsibles;
  if (keep.isBlocked) keep.isBlocked = false;
  await keep.save();

  const moved = await reassignCustomerLinks(
    keep._id,
    drop._id,
    merged.workIdMap,
    merged.responsibleIdMap,
  );
  await blockDuplicate(drop, keep);

  const afterDrop = await countLinks(drop._id);
  const afterKeep = await countLinks(keep._id);
  log("Transferido:");
  log(
    `  aluguéis=${moved.rentals} fechamentos=${moved.billings} cobranças=${moved.charges} faturas=${moved.invoices} bypass=${moved.tokens} unidades=${moved.itemUnits} obras remap=${moved.workRemaps} responsáveis remap=${moved.responsibleRemaps}`,
  );
  printCounts("keep depois", afterKeep);
  printCounts("drop depois (deve ficar 0)", afterDrop);
  log(`Duplicado ${drop._id} bloqueado.`);
};

const printUsage = () => {
  log(`Uso:
  npx ts-node scripts/merge-duplicate-customers.ts --list
  npx ts-node scripts/merge-duplicate-customers.ts --keep=ID_ATIVO --drop=ID_DUPLICADO
  npx ts-node scripts/merge-duplicate-customers.ts --keep=ID_ATIVO --drop=ID1 --drop=ID2 --apply

Opções:
  --list          lista candidatos (mesmo CPF/CNPJ ou mesmo nome+telefone)
  --keep=ID       cliente que permanece ativo
  --drop=ID       cliente que será bloqueado (pode repetir)
  --apply         grava as alterações (sem isso é só simulação)
  --company=ID    restringe a uma empresa
  --reason=texto  motivo do bloqueio`);
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);
  log(`MongoDB conectado. Modo: ${isApply ? "APPLY (grava)" : "dry-run"}`);

  if (isList) {
    await listDuplicateCandidates();
    return;
  }

  if (!keepId || dropIds.length === 0) {
    printUsage();
    return;
  }

  for (const dropId of dropIds) {
    log("");
    await mergeOne(keepId, dropId);
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
