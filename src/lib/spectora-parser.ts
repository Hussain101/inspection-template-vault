import * as XLSX from "xlsx";

export type ParsedComment = { name: string; bodyHtml: string };
export type ParsedItem = { name: string; comments: ParsedComment[] };
export type ParsedSection = { name: string; items: ParsedItem[] };
export type ParsedIssue = {
  rowNumber: number | null;
  rawExcerpt: string;
  reason: string;
};

export type ParseResult = {
  sections: ParsedSection[];
  issues: ParsedIssue[];
  counts: { sections: number; items: number; comments: number };
};

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const norm = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();

const key = (value: unknown) => norm(value).toLowerCase().replace(/[^a-z]/g, "");

type ColumnMap = {
  section: number;
  item: number;
  commentName: number;
  commentText: number;
  extras: { index: number; label: string }[];
};

function detectColumns(row: unknown[]): ColumnMap | null {
  let section = -1;
  let item = -1;
  let commentName = -1;
  let commentText = -1;
  const extras: { index: number; label: string }[] = [];

  row.forEach((cell, index) => {
    const label = norm(cell);
    const k = key(cell);
    if (!k) return;

    if (section === -1 && k.includes("section")) {
      section = index;
      return;
    }
    if (item === -1 && (k.includes("item") || k.includes("subsection"))) {
      item = index;
      return;
    }
    if (
      commentText === -1 &&
      (k.includes("html") ||
        k.includes("commenttext") ||
        k.includes("text") ||
        k.includes("body") ||
        k.includes("narrative") ||
        k.includes("description"))
    ) {
      commentText = index;
      return;
    }
    if (commentName === -1 && k.includes("comment")) {
      commentName = index;
      return;
    }
    extras.push({ index, label });
  });

  if (section === -1 || item === -1) return null;
  return { section, item, commentName, commentText, extras };
}

function cell(row: unknown[], index: number) {
  if (index < 0) return "";
  return norm(row[index]);
}

export function parseRows(rows: unknown[][], _sheetName: string): ParseResult {
  let headerIndex = -1;
  let columns: ColumnMap | null = null;

  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    const found = detectColumns(rows[i] ?? []);
    if (found) {
      headerIndex = i;
      columns = found;
      break;
    }
  }

  if (!columns || headerIndex === -1) {
    throw new ImportError(
      "We couldn't find Section and Item columns in this file. In Spectora, use Export to spreadsheet → Export HTML Text, then upload that file.",
    );
  }

  if (columns.commentText === -1 && columns.commentName === -1) {
    throw new ImportError(
      "This file has no comment column. It looks like a plain-text export. Please re-export using Export to spreadsheet → Export HTML Text.",
    );
  }

  const issues: ParsedIssue[] = [];
  const sections: ParsedSection[] = [];
  const sectionIndex = new Map<string, ParsedSection>();
  const itemIndex = new Map<string, ParsedItem>();

  let currentSection = "";
  let currentItem = "";
  let commentCount = 0;
  let htmlSeen = false;

  columns.extras.forEach((extra) => {
    issues.push({
      rowNumber: headerIndex + 1,
      rawExcerpt: extra.label,
      reason: `Column "${extra.label}" wasn't recognised, so its values were not imported.`,
    });
  });

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    const raw = row.map((value) => norm(value)).filter(Boolean);
    if (raw.length === 0) continue;

    const sectionName = cell(row, columns.section);
    const itemName = cell(row, columns.item);
    const commentName = cell(row, columns.commentName);
    const commentText = cell(row, columns.commentText);

    if (sectionName) currentSection = sectionName;
    if (itemName) currentItem = itemName;

    if (!currentSection) {
      issues.push({
        rowNumber,
        rawExcerpt: raw.join(" | ").slice(0, 300),
        reason: "Row appeared before any section, so it had nowhere to go.",
      });
      continue;
    }

    let section = sectionIndex.get(currentSection);
    if (!section) {
      section = { name: currentSection, items: [] };
      sectionIndex.set(currentSection, section);
      sections.push(section);
    }

    if (!currentItem) {
      if (commentName || commentText) {
        issues.push({
          rowNumber,
          rawExcerpt: raw.join(" | ").slice(0, 300),
          reason: "Comment row had no item above it.",
        });
      }
      continue;
    }

    const itemKey = `${currentSection}\u0000${currentItem}`;
    let item = itemIndex.get(itemKey);
    if (!item) {
      item = { name: currentItem, comments: [] };
      itemIndex.set(itemKey, item);
      section.items.push(item);
    }

    if (!commentName && !commentText) continue;

    if (/<[a-z][\s\S]*>/i.test(commentText)) htmlSeen = true;

    item.comments.push({ name: commentName, bodyHtml: commentText });
    commentCount += 1;
  }

  if (sections.length === 0) {
    throw new ImportError("This spreadsheet has column headers but no template rows.");
  }

  if (commentCount > 4 && !htmlSeen) {
    throw new ImportError(
      "No HTML was found in the comment text. This looks like a plain-text export — please re-export using Export to spreadsheet → Export HTML Text.",
    );
  }

  return {
    sections,
    issues,
    counts: {
      sections: sections.length,
      items: sections.reduce((total, s) => total + s.items.length, 0),
      comments: commentCount,
    },
  };
}

export async function parseTemplateFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx|xls)$/.test(name)) {
    throw new ImportError("Please upload a .csv, .xlsx or .xls file.");
  }
  if (file.size === 0) {
    throw new ImportError("That file is empty.");
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    throw new ImportError("We couldn't read that file. It may be corrupted or password protected.");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportError("That spreadsheet has no sheets.");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new ImportError("That spreadsheet has no readable sheet.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (rows.length === 0) throw new ImportError("That spreadsheet has no rows.");

  return parseRows(rows, sheetName);
}
