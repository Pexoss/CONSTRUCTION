import { Customer } from "./customer.model";

function isPartialCpfCnpjIndex(
  partialFilterExpression: unknown,
): boolean {
  if (!partialFilterExpression || typeof partialFilterExpression !== "object") {
    return false;
  }
  return "cpfCnpj" in (partialFilterExpression as Record<string, unknown>);
}

/**
 * Remove índice legado { companyId, cpfCnpj } sem filtro parcial (bloqueava
 * vários clientes sem documento na mesma empresa) e garante o índice atual.
 */
export async function ensureCustomerIndexes(): Promise<void> {
  const collection = Customer.collection;
  const indexes = await collection.indexes();

  for (const idx of indexes) {
    const key = idx.key as Record<string, number> | undefined;
    if (!key?.companyId || !key?.cpfCnpj || !idx.unique) {
      continue;
    }
    if (isPartialCpfCnpjIndex(idx.partialFilterExpression)) {
      continue;
    }

    const name = idx.name;
    if (!name || name === "_id_") {
      continue;
    }

    try {
      await collection.dropIndex(name);
      console.log(`[Customer] Índice legado removido: ${name}`);
    } catch (error) {
      console.warn(`[Customer] Não foi possível remover índice ${name}:`, error);
    }
  }

  await Customer.syncIndexes();
}
