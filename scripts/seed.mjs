import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed O&P Awards.");
}

const sql = neon(databaseUrl);

const ids = {
  cycle: "10000000-0000-4000-8000-000000000001",
  innovation: "20000000-0000-4000-8000-000000000003",
  leadership: "20000000-0000-4000-8000-000000000001",
  service: "20000000-0000-4000-8000-000000000002",
};

await sql`
  insert into award_cycles (id, title, stage, published_at)
  values (${ids.cycle}, '2026 O&P Awards', 'nominations', null)
  on conflict (id) do update set
    title = excluded.title,
    stage = excluded.stage,
    published_at = null,
    updated_at = now()
`;

await sql`
  insert into categories (
    id,
    cycle_id,
    title,
    description,
    nomination_question,
    nomination_limit,
    finalist_limit,
    nominee_staff_scope,
    active
  )
  values
    (
      ${ids.leadership},
      ${ids.cycle},
      'Leadership Excellence',
      'Recognizes a member whose leadership improved the O&P community.',
      'What leadership action created measurable value for members?',
      1,
      3,
      'all',
      true
    ),
    (
      ${ids.service},
      ${ids.cycle},
      'Member Service',
      'Honors a member who gave exceptional service to peers.',
      'How did this member serve others beyond their regular role?',
      1,
      3,
      'all',
      true
    ),
    (
      ${ids.innovation},
      ${ids.cycle},
      'Practice Innovation',
      'Celebrates a member who modernized practice, process, or education.',
      'Which new idea or process should the association recognize?',
      1,
      3,
      'all',
      true
    )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    nomination_question = excluded.nomination_question,
    nomination_limit = excluded.nomination_limit,
    finalist_limit = excluded.finalist_limit,
    nominee_staff_scope = excluded.nominee_staff_scope,
    active = true,
    updated_at = now()
`;

console.log("Seeded clean O&P Awards cycle and categories.");
