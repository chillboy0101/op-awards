import { NextResponse } from "next/server";
import { z } from "zod";

import { assertRole } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getServerEnv } from "@/lib/env";
import {
  buildCloudinaryMemberPhotoParams,
  signCloudinaryParams,
} from "@/lib/media/cloudinary";

const signatureSchema = z.object({
  memberId: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const parsed = signatureSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Member id is required." }, { status: 400 });
  }

  const env = getServerEnv();

  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_CLOUD_NAME) {
    return NextResponse.json(
      { ok: false, error: "Cloudinary environment variables are not configured." },
      { status: 503 },
    );
  }

  const params = buildCloudinaryMemberPhotoParams({
    memberId: parsed.data.memberId,
    timestamp: Math.floor(Date.now() / 1000),
  });

  return NextResponse.json({
    ok: true,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    params,
    signature: signCloudinaryParams(params, env.CLOUDINARY_API_SECRET),
  });
}
