export const AUTH_COOKIE = "hd_auth";

// Cookie value is a hash of the password, so rotating APP_PASSWORD logs everyone out.
export async function authToken(): Promise<string> {
  const bytes = new TextEncoder().encode(`hiring-dashboard:${process.env.APP_PASSWORD ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}
