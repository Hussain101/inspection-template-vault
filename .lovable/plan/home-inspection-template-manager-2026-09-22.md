# Home Inspection Template Manager

Import Spectora spreadsheet exports, edit them, duplicate them, and store everything so it persists.

A note on the stack: this project runs on Lovable's React stack (TanStack Start) with Tailwind, not Next.js. The backend is Lovable Cloud, which is Supabase underneath — so the schema, SQL migrations, and row-level security below all apply as written. No `.env.local` step is needed; connection details are wired in automatically. Publishing to the web is one click, no Vercel setup.

## Phase 1 — Data model (for your review)

Four linked tables, so nothing is stored as an opaque HTML blob.

**templates**
- id, owner (the signed-in user), name, source_filename, created_at, updated_at
- copied_from (points at the template it was duplicated from, if any)

**sections**
- id, template_id, name, position (preserves original order)

**items**
- id, section_id, name, position

**comments**
- id, item_id, name, body_html (the original HTML text), position

**import_issues**
- id, template_id, row_number, raw_excerpt, reason
- Every row the parser could not place lands here and is shown in the UI — nothing is silently dropped.

Rules: deleting a template cascades to its sections, items, and comments. Each user only sees their own templates. Duplicating copies every row with fresh ids, so edits to a copy never touch the original.

## Phase 2 — Import

- Upload area accepting `.csv`, `.xlsx`, `.xls`
- Parser walks the sheet and rebuilds Section → Item → Comment hierarchy, keeping original text and order
- Validation: if the file is empty, malformed, or is a plain-text export rather than the HTML-text spreadsheet, the upload stops with a clear explanation instead of importing garbage
- Anything unrecognized is recorded and surfaced as "Skipped rows" on the template page

## Phase 3 — Editor

- Dashboard listing all templates with counts, import date, and Duplicate / Delete actions
- Template page: collapsible sections, items nested inside, comments under items
- Inline editing of section names, item names, comment names, and comment HTML text
- Explicit Save that writes all pending changes at once, with saving/saved/error states
- Duplicate button producing an independent copy

## Phase 4 — Persistence, errors, docs

- All data lives in the database; reloads and new sessions show the same content
- Friendly errors on upload, save, and load failures
- README with setup, database initialization, and deployment notes

## Sign-in

Templates are per-user, so the app needs accounts. Plan is email + password sign-in on a `/auth` page, with the dashboard behind it.

## Build order

1. Enable the backend, run the schema migration with access rules
2. Auth page and protected dashboard
3. Upload + parser + import issue reporting
4. Template editor with save and duplicate
5. README and polish
