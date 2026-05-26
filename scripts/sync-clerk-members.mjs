import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";

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

function primaryEmailFallback(clerkUserId, identifier) {
  if (identifier?.includes("@")) return identifier.toLowerCase();
  return `${clerkUserId}@clerk.local`;
}

function fullName({ email, firstName, lastName }) {
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || email.split("@")[0] || "O&P member";
}

function normalizeStaffType(value) {
  return ["main", "monitoring_only", "nss"].includes(value) ? value : "main";
}

async function clerkGet(path) {
  const baseUrl = process.env.CLERK_BACKEND_API_URL?.trim() || "https://api.clerk.com";
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${requiredEnv("CLERK_SECRET_KEY")}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Clerk request failed (${response.status}) for ${path}.`);
  }

  return response.json();
}

await loadLocalEnv();

const sql = neon(requiredEnv("DATABASE_URL"));
const organizationId = requiredEnv("CLERK_ALLOWED_ORG_ID");
let offset = 0;
const limit = 100;
let totalCount = 0;
let syncedCount = 0;

do {
  const page = await clerkGet(
    `/v1/organizations/${organizationId}/memberships?limit=${limit}&offset=${offset}`,
  );

  totalCount = page.total_count ?? page.totalCount ?? page.data?.length ?? 0;

  for (const membership of page.data ?? []) {
    const publicUserData = membership.public_user_data ?? membership.publicUserData;
    const clerkUserId = publicUserData?.user_id ?? publicUserData?.userId;
    if (!clerkUserId) continue;

    const email = primaryEmailFallback(clerkUserId, publicUserData.identifier);
    const name = fullName({
      email,
      firstName: publicUserData.first_name ?? publicUserData.firstName,
      lastName: publicUserData.last_name ?? publicUserData.lastName,
    });
    const clerkUser = await clerkGet(`/v1/users/${clerkUserId}`);
    const staffType = normalizeStaffType(
      clerkUser.public_metadata?.latewatchStaffType ??
        clerkUser.publicMetadata?.latewatchStaffType,
    );
    const photoUrl = publicUserData.image_url ?? publicUserData.imageUrl ?? null;
    const existing = await sql`
      select id
      from members
      where clerk_user_id = ${clerkUserId} or email = ${email}
      limit 1
    `;

    if (existing.length) {
      await sql`
        update members
        set
          clerk_user_id = ${clerkUserId},
          email = ${email},
          name = ${name},
          photo_url = ${photoUrl},
          staff_type = ${staffType},
          status = 'active',
          updated_at = now()
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into members (clerk_user_id, email, name, photo_url, chapter, staff_type, status)
        values (${clerkUserId}, ${email}, ${name}, ${photoUrl}, 'Latewatch', ${staffType}, 'active')
      `;
    }

    syncedCount += 1;
  }

  offset += limit;
} while (offset < totalCount);

console.log(`Synced ${syncedCount} Clerk organization members into Neon.`);
