# CPA Awards

A production-oriented nomination and anonymous voting system for CPA member awards.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For database-backed local runs, copy `.env.example` to `.env.local`, set `DATABASE_URL`,
then run:

```bash
npm run db:migrate
npm run db:seed
```

## Checks

```bash
npm test
npm run lint
npm run build
```

## What Is Included

- Public winners/archive view.
- Member nomination with searchable tap-to-select roster cards.
- Anonymous ballot flow with finalist cards and vote receipts.
- Reviewer nomination queue.
- Admin command center for cycles, roster, Cloudinary photo signing, categories, runoff creation, certification, email, and audit events.
- Neon/Drizzle schema and migration for members, staff users, magic links, sessions, cycles, categories, nominations, finalists, vote receipts, anonymous votes, result certification, Cloudinary assets, and audit events.
- Resend-backed magic link and vote receipt helpers.
- Tested domain logic and production service helpers.

See `docs/awards-system.md` for the production rules and database model.
