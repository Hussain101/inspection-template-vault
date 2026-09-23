# Template Vault — Home Inspection Template Manager

Import your Spectora "Export HTML Text" spreadsheet, edit it section by section, duplicate it for new job types, and come back to it any time. Everything is saved to your account.

> **Live app**: _[update after Vercel deployment]_
> **Login**: Create a free account with email + password, or sign in with Google.
> A sample template is pre-loaded in the live app — you can explore it without importing your own file first.

---

## What it does

- **Import** `.csv`, `.xlsx`, or `.xls` exports from Spectora (**Export to spreadsheet → Export HTML Text**).
  Sections, items, and comments are rebuilt exactly as they were. Rows or columns the parser can't place are listed visibly on the template page — nothing is silently dropped.
- **Edit** section names, item names, comment names, and comment HTML bodies inline, then save all changes at once.
- **Preview** HTML comment bodies rendered through DOMPurify before saving.
- **Duplicate** a template into a fully independent copy — editing the copy never touches the original.
- **Store** everything in Supabase (Postgres + Row Level Security), scoped to the signed-in user. Data persists across sessions.

---

## Stack

- [TanStack Start](https://tanstack.com/start) — React 19, Vite 7, file-based routing
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — Postgres database, Row Level Security, Auth
- [SheetJS](https://sheetjs.com/) — client-side spreadsheet parsing
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitisation

---

## Local development

### 1. Clone and install

```sh
git clone https://github.com/Hussain101/inspection-template-vault.git
cd inspection-template-vault
npm install
```

### 2. Environment variables

Copy the example file and fill in your Supabase project values:

```sh
cp .env.example .env
```

Find the values in your Supabase project → **Project Settings → API**:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `anon` / `public` key |
| `VITE_SUPABASE_PROJECT_ID` | Project Reference ID |

### 3. Database initialisation

Run the migration against your Supabase project. In the Supabase dashboard go to **SQL Editor** and paste the contents of:

```
drizzle/migrations/0000_create_inspection_template_schema.sql
```

This creates the `templates`, `sections`, `items`, `comments`, and `import_issues` tables with Row Level Security, plus the `duplicate_template()` stored function.

### 4. Run the dev server

```sh
npm run dev
```

App runs at **http://localhost:8080**.

---

## Deployment (Vercel)

1. Push this repo to GitHub.
2. In Vercel, import the repo and set the following environment variables (same values as your `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
3. Deploy. No build command changes needed — Vercel will pick up `vite build` from `package.json`.

---

## Using the app

1. Sign up or sign in.
2. On the Dashboard, drag-and-drop or choose your Spectora `.xlsx` / `.csv` export.
3. After import you'll see a count of sections, items, and comments imported, plus any rows that were skipped.
4. Edit section names, item names, and comment text directly — click **Save changes** when done.
5. Click **Duplicate** to make an independent copy.

---

## Project notes

See [NOTES.md](./NOTES.md) for:
- Approximate time spent
- What was deliberately cut and why
- Known limitations
- How I checked the import, edits, and copy isolation
- Credits and build-on

---

## Sample export

A real Spectora-format export (`InterNACHI Residential -2026-09-23.xls`) is included in [`public/template/`](./public/template/). Use it to test the import flow locally or download it directly from the landing page of the live app.
