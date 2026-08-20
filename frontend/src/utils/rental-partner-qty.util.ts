export type RentalQtyAllocation = {
  quantity: number;
  partnerQuantity?: number;
  didCapToStock: boolean;
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

/**
 * Total alugado = estoque próprio + terceiros.
 * O próprio não passa do disponível; o restante vai para o parceiro.
 */
export function allocateRentalQuantities(input: {
  quantity: number;
  partnerEnabled: boolean;
  partnerQuantity?: number;
  previousPartnerQuantity?: number;
  maxOwn: number;
  changed: "quantity" | "partnerQuantity" | "partnerToggle";
}): RentalQtyAllocation {
  const maxOwn = Math.max(0, Math.floor(Number(input.maxOwn) || 0));
  let quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));

  if (!input.partnerEnabled) {
    const didCapToStock = maxOwn > 0 && quantity > maxOwn;
    return {
      quantity: didCapToStock ? maxOwn : quantity,
      partnerQuantity: undefined,
      didCapToStock,
    };
  }

  if (input.changed === "partnerQuantity") {
    const partner = Math.max(
      1,
      Math.floor(Number(input.partnerQuantity) || 1),
    );
    const prevPartner = Math.max(
      0,
      Math.floor(Number(input.previousPartnerQuantity) || 0),
    );
    const previousOwn = Math.min(maxOwn, Math.max(0, quantity - prevPartner));
    return {
      quantity: previousOwn + partner,
      partnerQuantity: partner,
      didCapToStock: false,
    };
  }

  const minPartner = Math.max(0, quantity - maxOwn);
  let partner = Math.max(
    minPartner,
    Math.floor(Number(input.partnerQuantity) || 0),
    1,
  );
  if (partner > quantity) {
    partner = quantity;
  }

  return {
    quantity,
    partnerQuantity: partner,
    didCapToStock: false,
  };
}
