import { Rental } from "./rental.model";

/**
 * Remove o unique global em rentalNumber (bloqueava o mesmo nº em empresas
 * diferentes) e garante o índice composto { companyId, rentalNumber }.
 */
export async function ensureRentalIndexes(): Promise<void> {
  const collection = Rental.collection;

  let indexes: Awaited<ReturnType<typeof collection.indexes>>;
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      (error as { code?: number }).code !== 26
    ) {
      throw error;
    }
    indexes = [];
  }

  for (const idx of indexes) {
    const key = idx.key as Record<string, number> | undefined;
    if (!key || !idx.unique) continue;
    const keys = Object.keys(key);
    const isLegacyGlobalNumber =
      keys.length === 1 && keys[0] === "rentalNumber";
    if (!isLegacyGlobalNumber) continue;

    const name = idx.name;
    if (!name || name === "_id_") continue;

    try {
      await collection.dropIndex(name);
      console.log(`[Rental] Índice legado removido: ${name}`);
    } catch (error) {
      console.warn(`[Rental] Não foi possível remover índice ${name}:`, error);
    }
  }

  await Rental.syncIndexes();
}
