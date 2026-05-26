import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { neon } from "@neondatabase/serverless";

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function planSelfNominationRepair({ nominations = [] }) {
  const selfNominations = nominations.filter(
    (nomination) =>
      nomination.nominatorId &&
      nomination.nomineeId &&
      nomination.nominatorId === nomination.nomineeId,
  );

  return {
    affectedCategoryIds: uniqueSorted(selfNominations.map((nomination) => nomination.categoryId)),
    affectedNominatorIds: uniqueSorted(selfNominations.map((nomination) => nomination.nominatorId)),
    deletedNominationIds: selfNominations.map((nomination) => nomination.id).sort(),
  };
}

export function summarizeSelfNominationRepair(plan) {
  return {
    affectedCategoryCount: plan.affectedCategoryIds.length,
    affectedCategoryIds: plan.affectedCategoryIds,
    affectedNominatorCount: plan.affectedNominatorIds.length,
    deletedNominationCount: plan.deletedNominationIds.length,
  };
}

async function loadLocalEnv() {
  if (!existsSync(".env.local")) return;

  const content = await readFile(".env.local", "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function parseArgs(argv) {
  return {
    confirm: argv.includes("--confirm"),
  };
}

async function loadLatestCycleRows(sql) {
  const cycles = await sql`
    select id
    from award_cycles
    order by created_at desc
    limit 1
  `;
  const cycle = cycles[0];

  if (!cycle) throw new Error("No award cycle found.");

  const nominations = await sql`
    select
      id,
      category_id as "categoryId",
      nominee_id as "nomineeId",
      nominator_id as "nominatorId"
    from nominations
    where cycle_id = ${cycle.id}
  `;

  return { cycle, nominations };
}

async function applySelfNominationRepair(sql, cycleId, plan) {
  const deletedNominations = [];

  for (const nominationId of plan.deletedNominationIds) {
    const rows = await sql`
      delete from nominations
      where id = ${nominationId}
      returning id
    `;
    deletedNominations.push(...rows);
  }

  const summary = summarizeSelfNominationRepair({
    ...plan,
    deletedNominationIds: deletedNominations.map((nomination) => nomination.id),
  });

  await sql`
    insert into audit_events (actor_role, action, target, summary, metadata)
    values (
      'system',
      'reopen_self_nomination_categories',
      ${cycleId},
      ${`Removed ${summary.deletedNominationCount} self-nominations for renomination.`},
      ${JSON.stringify(summary)}::jsonb
    )
  `;

  return summary;
}

async function main() {
  await loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const sql = neon(requiredEnv("DATABASE_URL"));
  const rows = await loadLatestCycleRows(sql);
  const plan = planSelfNominationRepair(rows);
  const summary = summarizeSelfNominationRepair(plan);

  console.log(JSON.stringify({ dryRun: !args.confirm, summary }, null, 2));

  if (!args.confirm) {
    console.log("Dry run only. Re-run with --confirm to delete self-nominations.");
    return;
  }

  const appliedSummary = await applySelfNominationRepair(sql, rows.cycle.id, plan);
  console.log(JSON.stringify({ applied: true, summary: appliedSummary }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
