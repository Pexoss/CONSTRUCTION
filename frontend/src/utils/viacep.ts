/** Apenas dígitos, máximo 8 (Brasil). */
export function normalizeBrazilZipDigits(value: string): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Formato 99999-999 quando completo. */
export function formatBrazilZipCodeDigits(digits: string): string {
  const d = normalizeBrazilZipDigits(digits);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type BrazilZipLookupResult = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zipFormatted: string;
};

/** Consulta ViaCEP (`digits` deve ter 8 caracteres numéricos). */
export async function lookupBrazilZipViaCep(digits: string): Promise<
  | { ok: true; data: BrazilZipLookupResult }
  | { ok: false; message: string }
> {
  const zip = normalizeBrazilZipDigits(digits);
  if (zip.length !== 8) {
    return { ok: false, message: "Digite um CEP com 8 dígitos para buscar." };
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
    const payload = await response.json();

    if (!response.ok || payload?.erro) {
      return { ok: false, message: "CEP não encontrado." };
    }

    const zipFormatted = formatBrazilZipCodeDigits(zip);

    return {
      ok: true,
      data: {
        zipFormatted,
        street: String(payload.logradouro || "").trim(),
        neighborhood: String(payload.bairro || "").trim(),
        city: String(payload.localidade || "").trim(),
        state: String(payload.uf || "")
          .trim()
          .toUpperCase(),
      },
    };
  } catch {
    return { ok: false, message: "Não foi possível consultar o CEP agora." };
  }
}
