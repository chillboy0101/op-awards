import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed O&P Awards.");
}

const sql = neon(databaseUrl);
const bootstrapAdminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "ari@cpa.example").toLowerCase();

const ids = {
  cycle: "10000000-0000-4000-8000-000000000001",
  leadership: "20000000-0000-4000-8000-000000000001",
  service: "20000000-0000-4000-8000-000000000002",
  innovation: "20000000-0000-4000-8000-000000000003",
  ari: "30000000-0000-4000-8000-000000000001",
  blair: "30000000-0000-4000-8000-000000000002",
  casey: "30000000-0000-4000-8000-000000000003",
  devon: "30000000-0000-4000-8000-000000000004",
  elliot: "30000000-0000-4000-8000-000000000005",
  staffAdmin: "40000000-0000-4000-8000-000000000001",
  staffReviewer: "40000000-0000-4000-8000-000000000002",
  nomBlair: "45000000-0000-4000-8000-000000000001",
  nomDevon: "45000000-0000-4000-8000-000000000002",
  nomCasey: "45000000-0000-4000-8000-000000000003",
  nomAri: "45000000-0000-4000-8000-000000000004",
  finBlair: "50000000-0000-4000-8000-000000000001",
  finDevon: "50000000-0000-4000-8000-000000000002",
  finCasey: "50000000-0000-4000-8000-000000000003",
  finAri: "50000000-0000-4000-8000-000000000004",
  certLeadership: "60000000-0000-4000-8000-000000000001",
  certService: "60000000-0000-4000-8000-000000000002",
  certInnovation: "60000000-0000-4000-8000-000000000003",
  auditVoting: "70000000-0000-4000-8000-000000000001",
  auditDuplicate: "70000000-0000-4000-8000-000000000002",
  auditFinalists: "70000000-0000-4000-8000-000000000003",
};

await sql`
  insert into members (id, name, email, chapter, status, joined_year)
  values
    (${ids.ari}, 'Ari Morgan', 'ari@cpa.example', 'North', 'active', '2019'),
    (${ids.blair}, 'Blair Chen', 'blair@cpa.example', 'Central', 'active', '2017'),
    (${ids.casey}, 'Casey Rivera', 'casey@cpa.example', 'West', 'active', '2021'),
    (${ids.devon}, 'Devon Patel', 'devon@cpa.example', 'South', 'active', '2016'),
    (${ids.elliot}, 'Elliot Brooks', 'elliot@cpa.example', 'East', 'inactive', '2020')
  on conflict (email) do update set
    name = excluded.name,
    chapter = excluded.chapter,
    status = excluded.status,
    joined_year = excluded.joined_year,
    updated_at = now()
`;

await sql`
  insert into staff_users (id, member_id, email, role, active)
  values
    (${ids.staffAdmin}, ${ids.ari}, ${bootstrapAdminEmail}, 'admin', true),
    (${ids.staffReviewer}, ${ids.blair}, 'blair@cpa.example', 'reviewer', true)
  on conflict (email, role) do update set
    active = true,
    updated_at = now()
`;

await sql`
  insert into award_cycles (
    id,
    title,
    stage,
    nominations_open_at,
    nominations_close_at,
    voting_open_at,
    voting_close_at,
    publish_at
  )
  values (
    ${ids.cycle},
    '2026 O&P Excellence Awards',
    'voting',
    '2026-05-20T13:00:00Z',
    '2026-06-10T23:59:59Z',
    '2026-06-18T13:00:00Z',
    '2026-06-28T23:59:59Z',
    '2026-07-12T13:00:00Z'
  )
  on conflict (id) do update set
    title = excluded.title,
    stage = excluded.stage,
    nominations_open_at = excluded.nominations_open_at,
    nominations_close_at = excluded.nominations_close_at,
    voting_open_at = excluded.voting_open_at,
    voting_close_at = excluded.voting_close_at,
    publish_at = excluded.publish_at,
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
      true
    )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    nomination_question = excluded.nomination_question,
    updated_at = now()
`;

await sql`
  insert into nominations (
    id,
    cycle_id,
    category_id,
    nominator_id,
    nominee_id,
    statement,
    supporting_link,
    reviewer_score,
    status,
    duplicate_risk
  )
  values
    (${ids.nomBlair}, ${ids.cycle}, ${ids.leadership}, ${ids.ari}, ${ids.blair}, 'Blair coordinated the chapter mentoring program and doubled first-year participation.', 'https://example.org/mentor-report', 94, 'recommended', 'clear'),
    (${ids.nomDevon}, ${ids.cycle}, ${ids.leadership}, ${ids.casey}, ${ids.devon}, 'Devon led the standards roundtable and turned member feedback into published guidance.', null, 91, 'recommended', 'clear'),
    (${ids.nomCasey}, ${ids.cycle}, ${ids.service}, ${ids.blair}, ${ids.casey}, 'Casey organized volunteer review clinics for members preparing for annual compliance deadlines.', null, 88, 'needs_info', 'possible'),
    (${ids.nomAri}, ${ids.cycle}, ${ids.innovation}, ${ids.devon}, ${ids.ari}, 'Ari built a repeatable quality checklist that several firms adopted across their audit teams.', null, 96, 'approved', 'resolved')
  on conflict (category_id, nominator_id) do update set
    nominee_id = excluded.nominee_id,
    statement = excluded.statement,
    supporting_link = excluded.supporting_link,
    reviewer_score = excluded.reviewer_score,
    status = excluded.status,
    duplicate_risk = excluded.duplicate_risk,
    updated_at = now()
`;

await sql`
  insert into finalists (
    id,
    category_id,
    nominee_id,
    display_name,
    summary,
    nomination_count,
    status,
    approved_by_staff_id,
    approved_at
  )
  values
    (${ids.finBlair}, ${ids.leadership}, ${ids.blair}, 'Blair Chen', 'Expanded the chapter mentoring program and doubled first-year participation.', 5, 'approved', ${ids.staffAdmin}, now()),
    (${ids.finDevon}, ${ids.leadership}, ${ids.devon}, 'Devon Patel', 'Turned member feedback into standards guidance for the association.', 4, 'approved', ${ids.staffAdmin}, now()),
    (${ids.finCasey}, ${ids.service}, ${ids.casey}, 'Casey Rivera', 'Organized volunteer review clinics for annual compliance deadlines.', 6, 'approved', ${ids.staffAdmin}, now()),
    (${ids.finAri}, ${ids.innovation}, ${ids.ari}, 'Ari Morgan', 'Built a repeatable quality checklist adopted across audit teams.', 7, 'approved', ${ids.staffAdmin}, now())
  on conflict (category_id, nominee_id) do update set
    display_name = excluded.display_name,
    summary = excluded.summary,
    nomination_count = excluded.nomination_count,
    status = excluded.status,
    updated_at = now()
`;

await sql`
  delete from result_certifications
  where category_id in (${ids.leadership}, ${ids.service}, ${ids.innovation})
`;

await sql`
  insert into result_certifications (
    id,
    category_id,
    winner_finalist_id,
    status,
    tally_snapshot,
    certified_by_staff_id,
    certified_at
  )
  values
    (${ids.certLeadership}, ${ids.leadership}, ${ids.finBlair}, 'tie', '{"leader":"Blair Chen","count":42,"status":"tie-check"}'::jsonb, null, null),
    (${ids.certService}, ${ids.service}, ${ids.finCasey}, 'certified', '{"leader":"Casey Rivera","count":51,"status":"ready"}'::jsonb, ${ids.staffAdmin}, now()),
    (${ids.certInnovation}, ${ids.innovation}, ${ids.finAri}, 'certified', '{"leader":"Ari Morgan","count":49,"status":"ready"}'::jsonb, ${ids.staffAdmin}, now())
`;

await sql`
  insert into audit_events (id, actor_member_id, actor_role, action, target, summary, metadata)
  values
    (${ids.auditVoting}, ${ids.ari}, 'admin', 'opened_voting', '2026 cycle', 'Voting opened for active O&P members.', '{"stage":"voting"}'::jsonb),
    (${ids.auditDuplicate}, ${ids.blair}, 'reviewer', 'resolved_duplicate', 'Practice Innovation', 'Reviewer resolved a possible duplicate nomination.', '{"duplicateRisk":"resolved"}'::jsonb),
    (${ids.auditFinalists}, ${ids.ari}, 'admin', 'approved_finalists', 'Leadership Excellence', 'Finalist slate approved for voting.', '{"finalists":2}'::jsonb)
  on conflict (id) do update set
    action = excluded.action,
    target = excluded.target,
    summary = excluded.summary,
    metadata = excluded.metadata
`;

console.log("Seeded O&P Awards baseline data.");
