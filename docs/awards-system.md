# CPA Awards System

## Product Rules

- CPA members sign in with the existing Latewatch Clerk app and must belong to the configured Clerk organization.
- CPA Awards admin access comes from `publicMetadata.cpaAwards.role = "admin"`.
- Members may nominate active CPA members only; self-nominations are rejected.
- Members only see the current action for the cycle: nominations during the nominations stage, voting during the voting stage, and a short status otherwise.
- Default nomination limit is one nomination per member per category.
- Reviewers can score nominations, flag duplicates, request more information, and recommend finalists.
- Admins manage the roster, award cycles, categories, dates, finalist approval, runoff creation, result certification, and publication.
- Voting uses one vote per member per category.
- Vote choices are anonymous: store a participation receipt linked to the member, and store vote choices without member or receipt identifiers.
- Results are tallied automatically, then certified by an admin before public publication.
- Tied categories can be moved into an admin-created runoff.

## Application Surfaces

- Public `/`: awards information and certified winner archive only.
- Member `/member`: Clerk-protected member work for the current phase only.
- Admin `/admin`: Clerk org member plus CPA Awards admin metadata.

## Persistent Model

The app now has a Drizzle/Neon persistence layer with an offline seeded fallback for local development without `DATABASE_URL`. Production uses these core tables:

- `members`: Clerk user id, identity, email, chapter, active/inactive status, Cloudinary photo metadata, audit timestamps.
- `staff_users`: admin/reviewer role assignments tied to member or staff email.
- `award_cycles`: cycle title, phase, nomination/voting/certification dates, publication state.
- `categories`: cycle, title, description, custom nomination question, finalist limit, nomination limit, active flag.
- `nominations`: cycle, category, nominator member, nominee member, statement, optional link, review status.
- `finalists`: category, nominee member, nomination summary, nomination count, admin approval metadata.
- `cloudinary_assets`: admin-managed image assets for member headshots and award media.
- `vote_receipts`: cycle, member, submitted category set, submitted timestamp, confirmation code.
- `anonymous_votes`: cycle, category, finalist, submitted timestamp; no member id and no receipt id.
- `result_certifications`: category, tally snapshot, winner finalist, tie/runoff state, certified by, published at.
- `audit_events`: actor, action, target, before/after summary, timestamp.

## Deployment Defaults

- Framework: Next.js App Router on Vercel.
- Database: Neon Postgres using `@neondatabase/serverless` and Drizzle migrations.
- Auth: existing Latewatch Clerk app and organization.
- Email: Resend for vote receipts and admin alerts.
- Media: Cloudinary signed upload flow for admin-managed member photos and award assets.
- Authorization: validate role and member status inside server actions and route handlers, not only in proxy/middleware.
- Audit: write staff-side mutations to `audit_events`.
- Privacy: never join anonymous vote choices back to `members` in application code or reporting exports.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL`, the Clerk keys, `CLERK_ALLOWED_ORG_ID`, and the Resend/Cloudinary keys for production-like local runs.
3. Run `npm run db:migrate`.
4. Run `npm run db:seed`.

## Verification

- Domain rules are covered by `tests/awards-workflow.test.mjs`.
- Production service helpers are covered by `tests/production-services.test.mjs`.
- Clerk role/org helpers are covered by `tests/clerk-access.test.mjs`.
- Phase gating is covered by `tests/phase-gating.test.mjs`.
- Run `npm test` for workflow behavior.
- Run `npm run lint` for code quality.
- Run `npm run build` for type checking and production build validation.
