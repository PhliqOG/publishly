// Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and
// newlines inside quotes, CRLF/LF endings. Returns rows of raw string cells.
// Kept dependency-free on purpose - the bulk importer is the only consumer.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    // Skip rows that are entirely empty (trailing newline artifacts)
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"' && cell === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushCell();
      i++;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i++;
      }
      pushRow();
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }
    cell += ch;
    i++;
  }

  if (cell !== '' || row.length > 0) {
    pushRow();
  }

  return rows;
}

export type CsvRecord = Record<string, string>;

// Header-aware variant: first row is the header; keys are lowercased/trimmed.
export function parseCsvWithHeader(text: string): {
  header: string[];
  records: CsvRecord[];
} {
  const rows = parseCsv(text);
  if (!rows.length) {
    return { header: [], records: [] };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((cells) =>
    header.reduce((all, key, idx) => {
      all[key] = (cells[idx] ?? '').trim();
      return all;
    }, {} as CsvRecord)
  );
  return { header, records };
}
