function decodedClerkHost(publishableKey) {
  const encoded = publishableKey?.replace(/^pk_(test|live)_/, "");
  if (!encoded || encoded === publishableKey) return null;

  try {
    return Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return null;
  }
}

export function clerkAccountPortalOriginFromPublishableKey(publishableKey) {
  const host = decodedClerkHost(publishableKey);

  if (!host) return null;

  return `https://${host}`;
}

export function safeAuthRedirectPath(value, fallback = "/member") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  return value;
}

export function buildClerkAccountPortalUrl({
  appOrigin,
  page,
  publishableKey,
  redirectPath = "/member",
}) {
  const accountPortalOrigin = clerkAccountPortalOriginFromPublishableKey(publishableKey);

  if (!accountPortalOrigin) return null;

  const accountPortalUrl = new URL(`/${page}`, accountPortalOrigin);
  const redirectUrl = new URL(safeAuthRedirectPath(redirectPath), appOrigin);

  accountPortalUrl.searchParams.set("redirect_url", redirectUrl.toString());

  return accountPortalUrl.toString();
}
