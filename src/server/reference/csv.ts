/**
 * Minimal RFC 4180 CSV parser for the reference-data importers (S06). Handles quoted
 * fields with commas, doubled quotes and line breaks, CRLF or LF line endings, and a
 * UTF-8 BOM (Excel adds one when saving "CSV UTF-8", which is how Korean catalogs
 * usually arrive). Small enough that a dependency isn't worth it.
 */

export type CsvRecord = {
  /** 1-based line number where the record starts, for validation reports. */
  line: number;
  values: Record<string, string>;
};

export type CsvParseResult =
  | { ok: true; headers: string[]; records: CsvRecord[] }
  | { ok: false; error: string };

export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const rows: { line: number; fields: string[] }[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let fieldWasQuoted = false;

  const endField = () => {
    fields.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // Skip fully blank lines (a trailing newline, or spacing someone left in by hand).
    if (!(fields.length === 1 && fields[0] === "")) {
      rows.push({ line: rowStartLine, fields });
    }
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      inQuotes = true;
      fieldWasQuoted = true;
      field = "";
    } else if (char === ",") {
      endField();
    } else if (char === "\r" && text[i + 1] === "\n") {
      // CRLF: let the \n branch end the row.
    } else if (char === "\n" || char === "\r") {
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    return { ok: false, error: `Unclosed quoted field starting on line ${rowStartLine}.` };
  }
  if (field !== "" || fields.length > 0) endRow();

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return { ok: false, error: "The file is empty (no header row)." };

  const headers = headerRow.fields.map((h) => h.trim().toLowerCase());
  const duplicate = headers.find((h, i) => headers.indexOf(h) !== i);
  if (duplicate) return { ok: false, error: `Duplicate column "${duplicate}" in the header.` };

  const records: CsvRecord[] = [];
  for (const row of dataRows) {
    if (row.fields.length !== headers.length) {
      return {
        ok: false,
        error: `Line ${row.line}: expected ${headers.length} columns, found ${row.fields.length}.`,
      };
    }
    const values: Record<string, string> = {};
    headers.forEach((h, i) => (values[h] = row.fields[i]));
    records.push({ line: row.line, values });
  }

  return { ok: true, headers, records };
}
