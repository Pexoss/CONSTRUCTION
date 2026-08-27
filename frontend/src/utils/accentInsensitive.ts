export const foldAccents = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export const matchesAccentInsensitive = (
  haystack: string | null | undefined,
  needle: string,
): boolean => {
  if (!needle) return true;
  return foldAccents(haystack || "").includes(foldAccents(needle));
};

export const matchesAnyAccentInsensitive = (
  haystacks: Array<string | null | undefined>,
  needle: string,
): boolean => haystacks.some((value) => matchesAccentInsensitive(value, needle));
