const LETTER_VARIANTS: Record<string, string> = {
  a: "aáàâãäåāăąÁÀÂÃÄÅĀĂĄ",
  e: "eéèêëēĕėęěÉÈÊËĒĔĖĘĚ",
  i: "iíìîïĩīįıÍÌÎÏĨĪĮİ",
  o: "oóòôõöōŏőøÓÒÔÕÖŌŎŐØ",
  u: "uúùûüũūŭůűÚÙÛÜŨŪŬŮŰ",
  c: "cçćĉċčÇĆĈĊČ",
  n: "nñńņňÑŃŅŇ",
  y: "yýÿŷÝŸŶ",
  s: "sśŝşšŚŜŞŠ",
  z: "zźżžŹŻŽ",
};

const CHAR_TO_BASE: Record<string, string> = {};
for (const [base, variants] of Object.entries(LETTER_VARIANTS)) {
  for (const ch of variants) {
    CHAR_TO_BASE[ch] = base;
  }
}

const foldToBase = (ch: string): string => {
  if (CHAR_TO_BASE[ch]) return CHAR_TO_BASE[ch];
  const stripped = ch.normalize("NFD").replace(/\p{M}/gu, "");
  return CHAR_TO_BASE[stripped] || stripped.toLowerCase();
};

const escapeRegexChar = (ch: string): string =>
  ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex que trata "Romario" e "Romário" como equivalentes. */
export const toAccentInsensitiveRegex = (input: string): string =>
  [...input].map((ch) => {
    const base = foldToBase(ch);
    const variants = LETTER_VARIANTS[base];
    if (variants) return `[${variants}]`;
    return escapeRegexChar(ch);
  }).join("");

export const accentInsensitiveRegexFilter = (term: string) => ({
  $regex: toAccentInsensitiveRegex(term),
  $options: "i" as const,
});
