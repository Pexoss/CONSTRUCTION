import React from "react";
import {
  PAYMENT_METHODS,
  PaymentMethodValue,
  paymentMethodSelectValue,
} from "../constants/paymentMethods";

type PaymentMethodSelectProps = {
  value?: string | null;
  onChange: (value: PaymentMethodValue) => void;
  className?: string;
  id?: string;
  fallback?: PaymentMethodValue;
};

export default function PaymentMethodSelect({
  value,
  onChange,
  className,
  id,
  fallback,
}: PaymentMethodSelectProps) {
  const selected = paymentMethodSelectValue(value, fallback);

  return (
    <select
      id={id}
      value={selected}
      onChange={(e) => onChange(e.target.value as PaymentMethodValue)}
      className={className}
    >
      {PAYMENT_METHODS.map((method) => (
        <option key={method.value} value={method.value}>
          {method.label}
        </option>
      ))}
    </select>
  );
}
