/**
 * Lista clientes duplicados no MongoDB (mesmo CPF/CNPJ ou mesmo nome+telefone).
 *
 * Compass: cole este arquivo no mongosh e rode.
 * Terminal:
 *   mongosh "MONGODB_URI" --file scripts/mongo/list-duplicate-customers.js
 *
 * Opcional: preencha COMPANY_ID para restringir a uma empresa.
 */
const COMPANY_ID = ""; // ex.: "6aabc533a3475a243e269d7c"

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

function scoped(extra) {
  if (!COMPANY_ID) return extra;
  return Object.assign({ companyId: ObjectId(COMPANY_ID) }, extra);
}

function countLinks(customerId) {
  const filter = scoped({ customerId: customerId });
  return {
    rentals: db.rentals.countDocuments(filter),
    billings: db.billings.countDocuments(filter),
    charges: db.charges.countDocuments(filter),
    invoices: db.invoices.countDocuments(filter),
    tokens: db.rentalcpfbypasstokens.countDocuments(filter),
    units: db.items.countDocuments(scoped({ "units.currentCustomer": customerId })),
  };
}

const customers = db.customers
  .find(scoped({}), {
    name: 1,
    cpfCnpj: 1,
    phone: 1,
    email: 1,
    isBlocked: 1,
    companyId: 1,
    createdAt: 1,
  })
  .sort({ createdAt: 1 })
  .toArray();

const groups = {};
for (const customer of customers) {
  const doc = digits(customer.cpfCnpj);
  let key;
  if (doc.length >= 11) {
    key = String(customer.companyId) + "|doc|" + doc;
  } else {
    const name = fold(customer.name);
    const phone = digits(customer.phone);
    if (name.length < 3 || phone.length < 8) continue;
    key = String(customer.companyId) + "|np|" + name + "|" + phone;
  }
  if (!groups[key]) groups[key] = [];
  groups[key].push(customer);
}

const duplicates = Object.values(groups).filter((rows) => rows.length > 1);

if (duplicates.length === 0) {
  print("Nenhum grupo duplicado encontrado.");
} else {
  print("Grupos duplicados: " + duplicates.length);
  print("");
  for (const group of duplicates) {
    const first = group[0];
    const label = digits(first.cpfCnpj).length >= 11
      ? "CPF/CNPJ " + first.cpfCnpj
      : first.name + " / " + first.phone;
    print("--- " + label + " ---");
    for (const customer of group) {
      const links = countLinks(customer._id);
      print(
        "  " +
          customer._id +
          " | " +
          (customer.isBlocked ? "BLOQUEADO" : "ativo") +
          " | " +
          customer.name
      );
      print(
        "    alugueis=" +
          links.rentals +
          " fechamentos=" +
          links.billings +
          " cobrancas=" +
          links.charges +
          " faturas=" +
          links.invoices +
          " unidades=" +
          links.units
      );
    }
    const keep = group[0]._id;
    const drops = group.slice(1).map((row) => row._id).join(", ");
    print("  sugerido KEEP=" + keep + "  DROP=" + drops);
    print("");
  }
}
