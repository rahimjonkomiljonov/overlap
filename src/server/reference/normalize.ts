/**
 * Normalization for autocomplete: NFKC (folds full-width Latin/digits that Korean
 * input methods produce, e.g. "ＣＳＥ" → "CSE"), lowercase, and no whitespace at all,
 * so "자료 구조" finds "자료구조" and "cse 2010" finds "CSE2010". The same function
 * builds the stored `searchText` and normalizes the query, so they always agree.
 */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/**
 * The stored search column: each field normalized, joined with a separator that
 * normalized queries can never contain, so a match can't straddle two fields.
 */
export function buildSearchText(...fields: (string | null | undefined)[]): string {
  return fields
    .filter((f): f is string => !!f)
    .map(normalizeForSearch)
    .join("|");
}

/** A query normalized like `searchText`, with the separator stripped out. */
export function normalizeQuery(query: string): string {
  return normalizeForSearch(query).replaceAll("|", "");
}
