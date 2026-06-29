const FIELD_LABELS: Record<string, string> = {
  companyId: "empresa",
  cpfCnpj: "CPF/CNPJ",
  email: "e-mail",
  cnpj: "CNPJ",
};

export function duplicateKeyErrorMessage(err: {
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}): string {
  const keyPattern = err.keyPattern ?? {};
  const keys = Object.keys(keyPattern);
  const keyValue = err.keyValue ?? {};

  if (keys.includes("companyId") && keys.includes("cpfCnpj")) {
    const doc = keyValue.cpfCnpj;
    if (doc == null || doc === "") {
      return "Não foi possível cadastrar o cliente sem CPF/CNPJ. Reinicie o servidor para atualizar os índices do banco.";
    }
    return "Já existe um cliente cadastrado com este CPF/CNPJ nesta empresa.";
  }

  if (keys.length > 1) {
    const labels = keys.map((k) => FIELD_LABELS[k] ?? k);
    return `Combinação já cadastrada (${labels.join(" + ")}).`;
  }

  const field = keys[0] ?? "campo";
  const label = FIELD_LABELS[field] ?? field;
  return `${label} já está em uso.`;
}
