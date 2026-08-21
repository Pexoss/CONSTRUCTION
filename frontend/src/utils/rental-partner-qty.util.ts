export type RentalQtyFields = {
  quantity: number;
  ownQuantity: number;
  partnerQuantity: number;
};

export function ownQuantityFromLine(
  quantity: number,
  partnerQuantity?: number,
): number {
  return Math.max(
    0,
    Math.floor(Number(quantity) || 0) -
      Math.max(0, Math.floor(Number(partnerQuantity) || 0)),
  );
}

/** Máximo que esta linha pode baixar do estoque próprio. */
export function maxOwnStockForRentalLine(params: {
  warehouseAvailable?: number;
  savedLineQuantity?: number;
  savedPartnerQuantity?: number;
}): number {
  const warehouse = Math.max(
    0,
    Math.floor(Number(params.warehouseAvailable) || 0),
  );
  const savedOwn = ownQuantityFromLine(
    params.savedLineQuantity || 0,
    params.savedPartnerQuantity,
  );
  return warehouse + savedOwn;
}

export function rentalLineDeliveryShortfall(
  ownQuantity: number,
  maxOwn: number,
): number {
  return Math.max(
    0,
    Math.floor(Number(ownQuantity) || 0) -
      Math.max(0, Math.floor(Number(maxOwn) || 0)),
  );
}

/**
 * Total = estoque próprio + terceiros.
 * - Alterar total: mantém terceiros e recalcula o próprio.
 * - Alterar terceiros: mantém o total e recalcula o próprio.
 * - Alterar próprio: soma no total (próprio + terceiros).
 */
export function syncRentalLineQuantities(input: {
  quantity: number;
  ownQuantity: number;
  partnerQuantity: number;
  changed: "quantity" | "ownQuantity" | "partnerQuantity";
}): RentalQtyFields {
  let quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  let ownQuantity = Math.max(0, Math.floor(Number(input.ownQuantity) || 0));
  let partnerQuantity = Math.max(
    0,
    Math.floor(Number(input.partnerQuantity) || 0),
  );

  if (input.changed === "quantity") {
    if (partnerQuantity > quantity) {
      partnerQuantity = quantity;
      ownQuantity = 0;
    } else {
      ownQuantity = quantity - partnerQuantity;
    }
  } else if (input.changed === "partnerQuantity") {
    if (quantity <= 0) {
      quantity = ownQuantity + partnerQuantity;
    } else if (partnerQuantity > quantity) {
      quantity = partnerQuantity;
      ownQuantity = 0;
    } else {
      ownQuantity = quantity - partnerQuantity;
    }
  } else {
    quantity = ownQuantity + partnerQuantity;
  }

  return { quantity, ownQuantity, partnerQuantity };
}
