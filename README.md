# UniTracker

## Authentication (Supabase)

This project now uses Supabase Auth (email + password) and stores each user’s data
in a single `user_data` row.

### 1) Create a Supabase project

- Enable **Email** auth in the Supabase dashboard.
- Decide if you want email confirmation for sign ups (optional).

### 2) Create the `user_data` table + policies

Run the SQL below in the Supabase SQL editor:

```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  courses jsonb not null default '[]'::jsonb,
  assessments jsonb not null default '[]'::jsonb,
  wam_goal text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can read their data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their data"
  on public.user_data for update
  using (auth.uid() = user_id);
```

### 3) Configure local env

Copy `.env.example` to `.env.local` and fill in:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then restart the dev server.

---

## Handbook scraping (2026 Semester 1)

Generate the local handbook dataset used by the lookup card:

```bash
npm run scrape:handbook
```

Optional flags:

```bash
npm run scrape:handbook -- --search <url> --max-pages 5 --concurrency 4 --delay-ms 200 --output public/data/handbook-2026-s1.json
```

The output is written to `public/data/handbook-2026-s1.json`.

### Import handbook assessments into a course

After you add a course (by subject code), open the course detail modal and use
`Import handbook` to create assessment items from `assessment.tables` in the
handbook dataset.

- Duplicate items are skipped automatically.
- Weight is mapped from `Percentage`/`Weight` columns.
- Due date is parsed when timing text contains a concrete date.

### Optional: Handbook API server

Run a lightweight API server that provides `/api/handbook/meta` and `/api/handbook/refresh`:

```bash
npm run api:handbook
```

Then set the client base URL:

```
VITE_HANDBOOK_API_BASE=http://127.0.0.1:5174
```

If you want to protect refresh calls, set `HANDBOOK_REFRESH_TOKEN` on the server and send `X-Handbook-Token` with the request.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
