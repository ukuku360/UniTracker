# UniTracker

## Authentication + Sync (Firebase)

This project uses Firebase Auth (email/password) and Firestore. Each user is
stored in `user_data/{uid}`.

### 1) Create Firebase project + web app

- Create a Firebase project in the Firebase console.
- Add a **Web App** and copy its config values.

### 2) Enable email/password sign-in

- Firebase Console -> Authentication -> Sign-in method
- Enable **Email/Password**

### 3) Create Firestore + security rules

- Firebase Console -> Firestore Database -> Create database
- Apply rules:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /user_data/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4) Configure local env

Copy `.env.example` to `.env.local` and fill in:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Optional keys (recommended if present in your Firebase config):

```bash
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
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
