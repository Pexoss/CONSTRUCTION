/**
 * Corrige em produção unidades que já foram devolvidas no aluguel
 * mas continuam como rented/reserved no estoque.
 *
 * Como usar (mongosh ou MongoDB Compass > mongosh):
 * 1) Rodar com APPLY = false e conferir o relatório.
 * 2) Se a lista estiver correta, mudar APPLY para true e rodar de novo.
 *
 * Não usa arrayFilters nem pipeline (compatível com GUI que rejeita isso).
 * Não libera unidade que ainda está em aluguel aberto (sem returnActual).
 */

const APPLY = false;

const OPEN_STATUSES = ["reserved", "active", "overdue", "ready_to_close"];

function unitKey(itemId, unitId) {
  return String(itemId) + "|" + String(unitId).trim();
}

function recountQuantity(units) {
  const list = units || [];
  return {
    total: list.length,
    available: list.filter(function (u) {
      return u.status === "available";
    }).length,
    reserved: list.filter(function (u) {
      return u.status === "reserved";
    }).length,
    rented: list.filter(function (u) {
      return u.status === "rented";
    }).length,
    maintenance: list.filter(function (u) {
      return u.status === "maintenance";
    }).length,
    damaged: list.filter(function (u) {
      return u.status === "damaged";
    }).length,
  };
}

const occupied = {};
db.rentals
  .find({ status: { $in: OPEN_STATUSES } })
  .forEach(function (rental) {
    (rental.items || []).forEach(function (line) {
      if (line.returnActual) return;
      const unitId = line.unitId ? String(line.unitId).trim() : "";
      if (!unitId) return;
      occupied[unitKey(line.itemId, unitId)] = String(rental._id);
    });
  });

const seen = {};
const toFix = [];

db.rentals
  .find({
    "items.unitId": { $exists: true, $nin: [null, ""] },
    "items.returnActual": { $ne: null },
  })
  .forEach(function (rental) {
    (rental.items || []).forEach(function (line) {
      if (!line.returnActual) return;
      const unitId = line.unitId ? String(line.unitId).trim() : "";
      if (!unitId) return;

      const key = unitKey(line.itemId, unitId);
      if (occupied[key]) return;
      if (seen[key]) return;

      const item = db.items.findOne({
        _id: line.itemId,
        trackingType: "unit",
      });
      if (!item || !item.units) return;

      const unit = item.units.find(function (u) {
        return String(u.unitId) === unitId;
      });
      if (!unit) return;
      if (unit.status !== "rented" && unit.status !== "reserved") return;

      seen[key] = true;
      toFix.push({
        itemId: item._id,
        itemName: item.name,
        sku: item.sku,
        unitId: unitId,
        unitStatus: unit.status,
        currentRental: unit.currentRental,
        returnedRentalId: rental._id,
        returnedAt: line.returnActual,
      });
    });
  });

print("=== Unidades devolvidas ainda presas no estoque ===");
print("Ocupadas em aluguel aberto (não serão alteradas): " + Object.keys(occupied).length);
print("Para corrigir: " + toFix.length);
print("APPLY = " + APPLY);
print("");

toFix.forEach(function (row, idx) {
  print(
    idx +
      1 +
      ") " +
      row.itemName +
      " | unidade " +
      row.unitId +
      " | status " +
      row.unitStatus +
      " | item " +
      row.itemId +
      " | aluguel devolvido " +
      row.returnedRentalId,
  );
});

if (!APPLY) {
  print("");
  print("Simulação concluída. Nada foi gravado.");
  print("Se a lista estiver correta, altere APPLY para true e execute novamente.");
} else if (toFix.length === 0) {
  print("Nada para gravar.");
} else {
  const byItem = {};
  toFix.forEach(function (row) {
    const id = String(row.itemId);
    if (!byItem[id]) {
      byItem[id] = { itemId: row.itemId, unitIds: {} };
    }
    byItem[id].unitIds[row.unitId] = true;
  });

  let updatedItems = 0;
  let updatedUnits = 0;

  Object.keys(byItem).forEach(function (id) {
    const group = byItem[id];
    const item = db.items.findOne({ _id: group.itemId });
    if (!item || !item.units) return;

    item.units.forEach(function (unit) {
      if (!group.unitIds[String(unit.unitId)]) return;
      if (unit.status !== "rented" && unit.status !== "reserved") return;
      unit.status = "available";
      delete unit.currentRental;
      delete unit.currentCustomer;
      updatedUnits += 1;
    });

    db.items.updateOne(
      { _id: item._id },
      {
        $set: {
          units: item.units,
          quantity: recountQuantity(item.units),
        },
      },
    );
    updatedItems += 1;
  });

  print("");
  print("Gravação concluída.");
  print("Itens atualizados: " + updatedItems);
  print("Unidades liberadas: " + updatedUnits);
}
