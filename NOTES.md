# NOTES.md

## What this is

Template Vault is a web app that lets home inspection companies migrate their Spectora templates without retyping them. It imports Spectora's "Export to spreadsheet → Export HTML Text" format, preserves the Section → Item → Comment hierarchy and HTML-formatted comment bodies, and stores everything in a structured Supabase database scoped to the signed-in user.

---

## Time spent

~8–10 hours over two days.

- Parser + error handling: ~2 h
- Database schema + RLS + duplicate function: ~2 h
- Import flow + dashboard UI: ~2 h
- Template editor (inline editing, preview, save, duplicate): ~2 h
- Auth, routing, polish, deployment prep: ~1–2 h

---

## Stack

- **TanStack Start** (React 19, Vite 7, file-based routing with TanStack Router)
- **Tailwind CSS v4**
- **Supabase** — Postgres database, Row Level Security, Auth (email + Google OAuth)
- **SheetJS (xlsx)** — client-side spreadsheet parsing for csv / xlsx / xls
- **DOMPurify** — sanitises HTML before rendering in preview mode

---

## How import works

1. The user uploads a `.csv`, `.xlsx`, or `.xls` file.
2. `spectora-parser.ts` uses SheetJS to read the sheet into a 2-D array of rows.
3. It scans the first 25 rows for a header that contains columns matching `section`, `item`, `comment`, and a text/HTML body column. Matching is keyword-based and case-insensitive — it handles variations like "Subsection", "Comment Text", "Narrative", "HTML", etc.
4. Data rows are walked in order. Section and item names carry forward (i.e. a comment row that doesn't repeat the section name still belongs to the current section).
5. Any row or column the parser cannot place is recorded in `import_issues` with its row number, a raw excerpt, and a human-readable reason. It is shown to the user on the template page — nothing is silently dropped.
6. After parsing, `template-api.ts` inserts the template, sections, items, comments, and issues into Supabase in batched writes. If any write fails the template row is cleaned up so the database is never left in a partial state.

### What HTML handling looks like

Spectora's "Export HTML Text" includes HTML tags (`<p>`, `<strong>`, `<ul>`, etc.) in the comment body column. The parser stores that raw HTML in `comments.body_html`. The editor shows it as raw markup by default (editable in a `<textarea>`), with a Preview button that renders it through DOMPurify before inserting it as `innerHTML`. Links, bold, italic and list formatting are preserved. Embedded images that reference Spectora CDN URLs are stored but will not load outside Spectora — this is documented as a known limitation.

### Distinguishing unsupported from missing

- **Missing from the export**: Spectora does not export photos, condition ratings, or observation flags in the HTML-text format. Those fields do not appear in the file at all.
- **Not supported by the importer**: Any column whose header the parser does not recognise is listed in `import_issues` with the message `Column "X" wasn't recognised`. The raw column label is preserved so the user can see exactly what was skipped.

---

## How I checked my work

1. **Imported the sample template** (committed to `/sample/`) and compared the section, item, and comment counts from the toast notification against a manual count in the spreadsheet.
2. **Saved an edit** — changed a section name and a comment body, saved, refreshed the browser, and confirmed the new values loaded from Supabase (not from React state).
3. **Duplicated a template** — edited the copy's section name, saved, went back to the original and confirmed its section name was unchanged.
4. **Failure cases tested**:
   - Uploaded a plain `.txt` file → rejected with "Please upload a .csv, .xlsx or .xls file."
   - Uploaded an empty `.xlsx` → rejected with "That spreadsheet has no rows."
   - Uploaded a plain-text Spectora export (no HTML column) → rejected with "This file has no comment column."
   - Uploaded a valid file while not signed in → rejected at the API level with "You need to be signed in."

---

## What I deliberately cut and why

| Feature | Why cut |
|---|---|
| Reordering sections/items by drag-and-drop | The customer's immediate problem is getting data out of Spectora faithfully; reordering is a day-two feature once they trust the import. |
| Adding new sections, items, or comments from scratch | Same reasoning — editing existing content matters more than authoring from zero. |
| Rich-text comment editor (WYSIWYG) | A `<textarea>` editing raw HTML is not ideal UX, but a WYSIWYG editor (Tiptap, Slate) would add a week of work and a compatibility surface. The Preview button bridges the gap. |
| CSV export / re-import to Spectora | Spectora's import format is not documented publicly; the round-trip is out of scope. |
| Writing actual reports, scheduling, payments, homeowner portals | Explicitly out of scope per the brief. |
| Mobile layout | The brief says desktop only. |
| AI-assisted import mapping | The parser is deterministic and keyword-based. An LLM would add latency, cost, and hallucination risk for a task that heuristics handle reliably. |

---

## Known limitations

- **Images in comment HTML**: Spectora CDN image URLs embedded in comment bodies will not render once outside Spectora's domain.
- **Only the first sheet is parsed**: Multi-sheet workbooks are supported but only the first sheet is read. This matches Spectora's export behaviour.
- **Large templates**: The importer batches writes in groups of 400 rows to stay within Supabase's request limits. Templates with several thousand comments may take a few seconds to import.
- **Google OAuth**: Requires the Supabase project to have Google as an enabled provider. Email + password auth always works.
- **No position editing**: Items and sections can be renamed but not reordered in this version.

---

## Credits and build-on

- Project scaffolded from the **Lovable TanStack Start starter** (TanStack Router + Vite + Tailwind v4 + Supabase integration boilerplate). All application logic — parser, schema, editor, API layer — was written from scratch on top of that scaffold.
- **SheetJS** (`xlsx` package) for spreadsheet parsing.
- **DOMPurify** for HTML sanitisation before rendering user-edited content.
- **shadcn/ui** components (Button, Input, Textarea, AlertDialog, etc.) via the starter's pre-installed component set.
