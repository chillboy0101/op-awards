import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { neon } from "@neondatabase/serverless";

function scopeOf(row) {
  return row?.ballotScope ?? row?.ballot_scope ?? "main";
}

function rowCategoryIds(receipt, fallbackCategoryIds = []) {
  if (Array.isArray(receipt?.categoryIds)) return receipt.categoryIds;
  if (Array.isArray(receipt?.category_ids)) return receipt.category_ids;

  return fallbackCategoryIds;
}

function uniqueSorted(values, order = new Map()) {
  return [...new Set(values)].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeCompare(right);
  });
}

export function planAffectedCategoryRevote({
  ballotScope = "main",
  categories = [],
  finalists = [],
  voteReceipts = [],
  votes = [],
}) {
  const scopedCategories = categories.filter(
    (category) => category.active !== false && scopeOf(category) === ballotScope,
  );
  const categoryOrder = new Map(
    scopedCategories.map((category, index) => [category.id, index]),
  );
  const scopedCategoryIds = scopedCategories.map((category) => category.id);
  const scopedCategoryIdSet = new Set(scopedCategoryIds);
  const scopedReceipts = voteReceipts.filter((receipt) => scopeOf(receipt) === ballotScope);
  const receiptByMemberId = new Map(
    scopedReceipts.map((receipt) => [receipt.memberId ?? receipt.member_id, receipt]),
  );
  const affectedCategoryIds = uniqueSorted(
    finalists
      .filter(
        (finalist) =>
          finalist.status === "approved" &&
          finalist.nomineeId &&
          scopedCategoryIdSet.has(finalist.categoryId),
      )
      .filter((finalist) => {
        const receipt = receiptByMemberId.get(finalist.nomineeId);
        if (!receipt) return false;

        return rowCategoryIds(receipt, scopedCategoryIds).includes(finalist.categoryId);
      })
      .map((finalist) => finalist.categoryId),
    categoryOrder,
  );
  const affectedCategoryIdSet = new Set(affectedCategoryIds);
  const deletedVoteIds = votes
    .filter(
      (vote) =>
        scopeOf(vote) === ballotScope && affectedCategoryIdSet.has(vote.categoryId),
    )
    .map((vote) => vote.id);
  const receiptUpdates = [];
  const deletedReceiptIds = [];

  for (const receipt of scopedReceipts) {
    const submittedCategoryIds = rowCategoryIds(receipt, scopedCategoryIds);
    if (!submittedCategoryIds.some((categoryId) => affectedCategoryIdSet.has(categoryId))) {
      continue;
    }

    const categoryIds = uniqueSorted(
      submittedCategoryIds.filter((categoryId) => !affectedCategoryIdSet.has(categoryId)),
      categoryOrder,
    );

    if (categoryIds.length === 0) {
      deletedReceiptIds.push(receipt.id);
    } else {
      receiptUpdates.push({
        categoryIds,
        id: receipt.id,
        memberId: receipt.memberId ?? receipt.member_id,
      });
    }
  }

  return {
    affectedCategoryIds,
    deletedReceiptIds,
    deletedVoteIds,
    receiptUpdates,
  };
}

export function summarizeRevotePlan(plan) {
  return {
    affectedCategoryCount: plan.affectedCategoryIds.length,
    affectedCategoryIds: plan.affectedCategoryIds,
    deletedReceiptCount: plan.deletedReceiptIds.length,
    deletedVoteCount: plan.deletedVoteIds.length,
    updatedReceiptCount: plan.receiptUpdates.length,
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

function requiredDatabaseUrl() {
  const value = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("POSTGRES_URL or DATABASE_URL is required.");
  return value;
}

function parseArgs(argv) {
  const ballotScopeFlag = argv.find((arg) => arg.startsWith("--ballot-scope="));

  return {
    ballotScope: ballotScopeFlag?.slice("--ballot-scope=".length) || null,
    confirm: argv.includes("--confirm"),
  };
}

export function latestActiveBallotScope(categories = []) {
  const scopes = new Map();

  for (const category of categories) {
    if (category.active === false) continue;

    const ballotScope = scopeOf(category);
    const createdAt = category.createdAt ?? category.created_at;
    const timestamp = createdAt ? new Date(createdAt).getTime() : 0;
    const current = scopes.get(ballotScope);

    if (!current || timestamp > current.timestamp) {
      scopes.set(ballotScope, {
        ballotScope,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      });
    }
  }

  return (
    [...scopes.values()].sort((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      if (left.ballotScope === "main") return 1;
      if (right.ballotScope === "main") return -1;
      return left.ballotScope.localeCompare(right.ballotScope);
    })[0]?.ballotScope ?? "main"
  );
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

  const categories = await sql`
    select
      id,
      active,
      ballot_scope as "ballotScope",
      created_at as "createdAt",
      title
    from categories
    where cycle_id = ${cycle.id}
  `;
  const categoryIds = categories.map((category) => category.id);
  const finalists = categoryIds.length
    ? await sql`
        select
          id,
          category_id as "categoryId",
          nominee_id as "nomineeId",
          status
        from finalists
        where category_id = any(${categoryIds})
      `
    : [];
  const voteReceipts = await sql`
    select
      id,
      ballot_scope as "ballotScope",
      category_ids as "categoryIds",
      member_id as "memberId"
    from vote_receipts
    where cycle_id = ${cycle.id}
  `;
  const votes = await sql`
    select
      id,
      ballot_scope as "ballotScope",
      category_id as "categoryId"
    from anonymous_votes
    where cycle_id = ${cycle.id}
  `;

  return { categories, cycle, finalists, voteReceipts, votes };
}

async function applyRevotePlan(sql, cycleId, ballotScope, plan) {
  const deletedVotes = [];

  for (const categoryId of plan.affectedCategoryIds) {
    const rows = await sql`
      delete from anonymous_votes
      where cycle_id = ${cycleId}
        and ballot_scope = ${ballotScope}
        and category_id = ${categoryId}
      returning id
    `;
    deletedVotes.push(...rows);
  }

  for (const update of plan.receiptUpdates) {
    await sql`
      update vote_receipts
      set
        category_ids = ${JSON.stringify(update.categoryIds)}::jsonb,
        updated_at = now()
      where id = ${update.id}
    `;
  }

  for (const receiptId of plan.deletedReceiptIds) {
    await sql`
      delete from vote_receipts
      where id = ${receiptId}
    `;
  }

  const summary = summarizeRevotePlan({
    ...plan,
    deletedVoteIds: deletedVotes.map((vote) => vote.id),
  });

  await sql`
    insert into audit_events (actor_role, action, target, summary, metadata)
    values (
      'system',
      'reopen_self_vote_categories',
      ${cycleId},
      ${`Reopened ${summary.affectedCategoryCount} affected ${ballotScope} categories for revote.`},
      ${JSON.stringify(summary)}::jsonb
    )
  `;

  return summary;
}

async function main() {
  await loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const sql = neon(requiredDatabaseUrl());
  const rows = await loadLatestCycleRows(sql);
  const ballotScope = args.ballotScope ?? latestActiveBallotScope(rows.categories);
  const plan = planAffectedCategoryRevote({
    ballotScope,
    categories: rows.categories,
    finalists: rows.finalists,
    voteReceipts: rows.voteReceipts,
    votes: rows.votes,
  });
  const summary = summarizeRevotePlan(plan);

  console.log(JSON.stringify({ ballotScope, dryRun: !args.confirm, summary }, null, 2));

  if (!args.confirm) {
    console.log("Dry run only. Re-run with --confirm to apply the repair.");
    return;
  }

  const appliedSummary = await applyRevotePlan(sql, rows.cycle.id, ballotScope, plan);
  console.log(JSON.stringify({ applied: true, ballotScope, summary: appliedSummary }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
