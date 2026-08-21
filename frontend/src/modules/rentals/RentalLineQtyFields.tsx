import React from "react";
import { selectInputText } from "../../utils/selectInputText";
import {
  RentalQtyFields,
  rentalLineDeliveryShortfall,
  syncRentalLineQuantities,
} from "../../utils/rental-partner-qty.util";

type Props = {
  quantity: number;
  ownQuantity: number;
  partnerQuantity: number;
  availableOwn: number;
  disabled?: boolean;
  compact?: boolean;
  onChange: (next: RentalQtyFields) => void;
};

const parseQty = (raw: string): number | null => {
  if (raw === "") return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
};

const qtyInputClass = (compact?: boolean) =>
  compact
    ? "w-full px-2 py-2 border rounded-md text-sm dark:bg-gray-700 dark:border-gray-600"
    : "w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600";

const RentalLineQtyFields: React.FC<Props> = ({
  quantity,
  ownQuantity,
  partnerQuantity,
  availableOwn,
  disabled,
  compact,
  onChange,
}) => {
  const shortfall = rentalLineDeliveryShortfall(ownQuantity, availableOwn);

  const handleChange = (
    raw: string,
    changed: "quantity" | "ownQuantity" | "partnerQuantity",
  ) => {
    const parsed = parseQty(raw);
    if (parsed === null) return;
    onChange(
      syncRentalLineQuantities({
        quantity: changed === "quantity" ? parsed : quantity,
        ownQuantity: changed === "ownQuantity" ? parsed : ownQuantity,
        partnerQuantity:
          changed === "partnerQuantity" ? parsed : partnerQuantity,
        changed,
      }),
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Total a alugar
          </label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            disabled={disabled}
            value={quantity || ""}
            onFocus={selectInputText}
            onClick={selectInputText}
            onChange={(e) => handleChange(e.target.value, "quantity")}
            className={qtyInputClass(compact)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Do meu estoque
          </label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            disabled={disabled}
            value={ownQuantity}
            onFocus={selectInputText}
            onClick={selectInputText}
            onChange={(e) => handleChange(e.target.value, "ownQuantity")}
            className={qtyInputClass(compact)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            De terceiros
          </label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            disabled={disabled}
            value={partnerQuantity || ""}
            onFocus={selectInputText}
            onClick={selectInputText}
            onChange={(e) => handleChange(e.target.value, "partnerQuantity")}
            className={qtyInputClass(compact)}
          />
        </div>
      </div>
      <p className="text-2xs text-gray-500 dark:text-gray-400">
        Disponível no estoque próprio: {availableOwn}. Total = próprio +
        terceiros.
      </p>
      {shortfall > 0 ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Faltam {shortfall} para entrega. Estoque próprio cobre {availableOwn},
          mas esta linha precisa de {ownQuantity} do seu estoque.
        </p>
      ) : null}
    </div>
  );
};

export default RentalLineQtyFields;
