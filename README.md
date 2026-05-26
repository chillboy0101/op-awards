# O&P Awards

A production-oriented nomination and anonymous voting system for O&P member awards.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For database-backed local runs, copy `.env.example` to `.env.local`, set `POSTGRES_URL`
or `DATABASE_URL`, then run:

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

- Public `/` live view with cycle status and published winners only.
- Clerk-protected `/member` for existing Latewatch organization users.
- Phase-gated member work: nominations show only during nominations, ballots show only during voting.
- `/admin` for users with `publicMetadata.cpaAwards.role = "admin"`.
- Clerk roster sync into O&P Awards member records through `clerk_user_id`.
- Member nomination with searchable tap-to-select people cards and profile photos.
- Anonymous ballot flow with finalist cards and vote receipts.
- Admin command center for cycle stage, roster sync, manual member add, runoff creation, certification, email, and audit events.
- Neon/Drizzle schema and migration for members, staff users, magic links, sessions, cycles, categories, nominations, finalists, vote receipts, anonymous votes, result certification, Cloudinary assets, and audit events.
- Resend-backed vote receipt helpers.
- Tested domain logic and production service helpers.

## Clerk Setup

O&P Awards uses the existing Latewatch Clerk app and organization. Add these env vars locally and in Vercel:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_ALLOWED_ORG_ID=
```

Admin access is namespaced so it does not affect Latewatch:

```json
{
  "cpaAwards": {
    "role": "admin"
  }
}
```

See `docs/awards-system.md` for the production rules and database model.
