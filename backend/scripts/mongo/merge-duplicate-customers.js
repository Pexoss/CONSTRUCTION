/**
 * Unifica cliente duplicado direto no MongoDB.
 *
 * 1) Transfere aluguéis, fechamentos, cobranças, faturas, tokens e unidades
 *    do DROP para o KEEP.
 * 2) Copia endereços, obras e responsáveis que ainda não existirem no KEEP.
 * 3) Bloqueia o DROP (isBlocked) e remove o CPF/CNPJ dele.
 *
 * Compass / mongosh:
 *   1. Preencha KEEP_ID e DROP_ID abaixo.
 *   2. Deixe APPLY = false para só simular.
 *   3. Mude APPLY = true e rode de novo para gravar.
 *
 * Terminal:
 *   mongosh "MONGODB_URI" --file scripts/mongo/merge-duplicate-customers.js
 */
const KEEP_ID = ""; // cliente que permanece ativo
const DROP_ID = ""; // cliente duplicado que será bloqueado
const APPLY = false; // true grava no banco
const BLOCK_REASON = ""; // opcional

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function addressKey(row) {
  return [
    fold(row && row.street),
    fold(row && row.number),
    digits(row && row.zipCode),
    fold(row && row.city),
    fold(row && row.neighborhood),
  ].join("|");
}

function workKey(row) {
  return fold(row && row.workName);
}

function responsibleKey(row) {
  return [fold(row && row.name), fold(row && row.role), digits(row && row.phone)].join("|");
}

function countLinks(customerId) {
  const filter = { customerId: customerId };
  return {
    rentals: db.rentals.countDocuments(filter),
    billings: db.billings.countDocuments(filter),
    charges: db.charges.countDocuments(filter),
    invoices: db.invoices.countDocuments(filter),
    tokens: db.rentalcpfbypasstokens.countDocuments(filter),
    units: db.items.countDocuments({ "units.currentCustomer": customerId }),
  };
}

function printCounts(title, counts) {
  print(
    "  " +
      title +
      ": alugueis=" +
      counts.rentals +
      " fechamentos=" +
      counts.billings +
      " cobrancas=" +
      counts.charges +
      " faturas=" +
      counts.invoices +
      " bypass=" +
      counts.tokens +
      " unidades=" +
      counts.units
  );
}

if (!KEEP_ID || !DROP_ID) {
  throw new Error("Preencha KEEP_ID e DROP_ID no topo do script.");
}
if (KEEP_ID === DROP_ID) {
  throw new Error("KEEP_ID e DROP_ID não podem ser iguais.");
}

const keepId = ObjectId(KEEP_ID);
const dropId = ObjectId(DROP_ID);
const keep = db.customers.findOne({ _id: keepId });
const drop = db.customers.findOne({ _id: dropId });

if (!keep) throw new Error("Cliente KEEP não encontrado: " + KEEP_ID);
if (!drop) throw new Error("Cliente DROP não encontrado: " + DROP_ID);
if (String(keep.companyId) !== String(drop.companyId)) {
  throw new Error("Os dois clientes precisam ser da mesma empresa.");
}

print("KEEP: " + keep._id + " | " + (keep.isBlocked ? "BLOQUEADO" : "ativo") + " | " + keep.name);
printCounts("já no keep", countLinks(keepId));
print("DROP: " + drop._id + " | " + (drop.isBlocked ? "BLOQUEADO" : "ativo") + " | " + drop.name);
printCounts("a transferir", countLinks(dropId));

if (!APPLY) {
  print("");
  print("Simulação apenas. Para gravar, mude APPLY = true e rode de novo.");
} else {
  const workIdMap = {};
  const responsibleIdMap = {};

  const keepAddresses = (keep.addresses || []).slice();
  const addressIndexMap = {};
  (drop.addresses || []).forEach(function (address, oldIndex) {
    const key = addressKey(address);
    const existingIndex = keepAddresses.findIndex(function (row) {
      return addressKey(row) === key && key !== "||||";
    });
    if (existingIndex >= 0) {
      addressIndexMap[oldIndex] = existingIndex;
      return;
    }
    addressIndexMap[oldIndex] = keepAddresses.length;
    keepAddresses.push(address);
  });

  const keepWorks = (keep.works || []).slice();
  (drop.works || []).forEach(function (work) {
    const oldWorkId = String((work && work.workId) || "");
    const existing = keepWorks.find(function (row) {
      return workKey(row) === workKey(work) && workKey(work);
    });
    const nextAddressIndex =
      addressIndexMap[Number(work.addressIndex)] != null
        ? addressIndexMap[Number(work.addressIndex)]
        : Math.max(0, Number(work.addressIndex) || 0);
    if (existing) {
      if (oldWorkId) workIdMap[oldWorkId] = String(existing.workId);
      const merged = {};
      (existing.activeRentals || []).forEach(function (id) {
        merged[String(id)] = id;
      });
      (work.activeRentals || []).forEach(function (id) {
        merged[String(id)] = id;
      });
      existing.activeRentals = Object.keys(merged).map(function (id) {
        return ObjectId(id);
      });
      return;
    }
    work.addressIndex = nextAddressIndex;
    keepWorks.push(work);
  });

  const keepResponsibles = (keep.responsibles || []).slice();
  (drop.responsibles || []).forEach(function (responsible) {
    const oldId = String((responsible && responsible._id) || "");
    const existing = keepResponsibles.find(function (row) {
      return responsibleKey(row) === responsibleKey(responsible) && fold(responsible.name);
    });
    if (existing) {
      if (oldId && existing._id) responsibleIdMap[oldId] = String(existing._id);
      return;
    }
    keepResponsibles.push(responsible);
  });

  db.customers.updateOne(
    { _id: keepId },
    {
      $set: {
        addresses: keepAddresses,
        works: keepWorks,
        responsibles: keepResponsibles,
        isBlocked: false,
        updatedAt: new Date(),
      },
    }
  );

  const rentals = db.rentals.find({ customerId: dropId }).toArray();
  let workRemaps = 0;
  let responsibleRemaps = 0;
  rentals.forEach(function (rental) {
    const setDoc = { customerId: keepId, updatedAt: new Date() };
    const currentWorkId = String((rental.workAddress && rental.workAddress.workId) || "");
    if (currentWorkId && workIdMap[currentWorkId]) {
      setDoc["workAddress.workId"] = ObjectId(workIdMap[currentWorkId]);
      workRemaps += 1;
    }
    const financialId = String(
      (rental.financialResponsibleContact &&
        rental.financialResponsibleContact.customerResponsibleId) ||
        ""
    );
    if (financialId && responsibleIdMap[financialId]) {
      setDoc["financialResponsibleContact.customerResponsibleId"] = ObjectId(
        responsibleIdMap[financialId]
      );
      responsibleRemaps += 1;
    }
    const workRespId = String(
      (rental.workResponsibleContact &&
        rental.workResponsibleContact.customerResponsibleId) ||
        ""
    );
    if (workRespId && responsibleIdMap[workRespId]) {
      setDoc["workResponsibleContact.customerResponsibleId"] = ObjectId(
        responsibleIdMap[workRespId]
      );
      responsibleRemaps += 1;
    }
    db.rentals.updateOne({ _id: rental._id }, { $set: setDoc });
  });

  const billings = db.billings.updateMany(
    { customerId: dropId },
    { $set: { customerId: keepId, updatedAt: new Date() } }
  );
  const charges = db.charges.updateMany(
    { customerId: dropId },
    { $set: { customerId: keepId, updatedAt: new Date() } }
  );
  const invoices = db.invoices.updateMany(
    { customerId: dropId },
    { $set: { customerId: keepId, updatedAt: new Date() } }
  );
  const tokens = db.rentalcpfbypasstokens.updateMany(
    { customerId: dropId },
    { $set: { customerId: keepId, updatedAt: new Date() } }
  );
  const units = db.items.updateMany(
    { "units.currentCustomer": dropId },
    { $set: { "units.$[unit].currentCustomer": keepId, updatedAt: new Date() } },
    { arrayFilters: [{ "unit.currentCustomer": dropId }] }
  );

  const reason =
    BLOCK_REASON ||
    "Duplicado unificado no cliente " + keep.name + " (" + keep._id + ") em " + new Date().toISOString();
  const notes = [String(drop.notes || "").trim(), "Bloqueado por duplicidade. " + reason]
    .filter(Boolean)
    .join("\n");

  db.customers.updateOne(
    { _id: dropId },
    {
      $set: {
        isBlocked: true,
        blockReason: reason,
        notes: notes,
        updatedAt: new Date(),
      },
      $unset: { cpfCnpj: "" },
    }
  );

  print("");
  print("Gravado:");
  print(
    "  alugueis=" +
      rentals.length +
      " fechamentos=" +
      billings.modifiedCount +
      " cobrancas=" +
      charges.modifiedCount +
      " faturas=" +
      invoices.modifiedCount +
      " bypass=" +
      tokens.modifiedCount +
      " unidades=" +
      units.modifiedCount +
      " obras remap=" +
      workRemaps +
      " responsaveis remap=" +
      responsibleRemaps
  );
  printCounts("keep depois", countLinks(keepId));
  printCounts("drop depois (deve ficar 0)", countLinks(dropId));
  print("Duplicado " + dropId + " bloqueado.");
}
