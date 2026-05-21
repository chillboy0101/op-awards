export function buildClerkMemberValues({ existing, profile }) {
  return {
    awardsEligible: existing?.awardsEligible ?? true,
    clerkUserId: profile.clerkUserId,
    email: profile.email,
    name: profile.name,
    photoUrl: profile.photoUrl,
    status: "active",
  };
}
