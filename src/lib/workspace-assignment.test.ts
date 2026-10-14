import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Live regression checks use the managed preview session, never embedded credentials.
const sessionValue = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const config = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((line) => line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
}));
const tenantId = "cb94d740-6a55-47b5-adc4-88f41bdbcac7";

describe.skipIf(!sessionValue)("direct workspace assignment live safeguards", () => {
  async function assign(email: string, role = "viewer") {
    if (!sessionValue) throw new Error("Managed session required");
    const session = JSON.parse(sessionValue);
    const response = await fetch(`${config.VITE_SUPABASE_URL}/rest/v1/rpc/admin_add_tenant_user`, {
      method: "POST",
      headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _tenant_id: tenantId, _email: email, _role: role }),
    });
    return { status: response.status, body: await response.json() };
  }

  it("rejects a second direct assignment of the same account", async () => {
    const result = await assign("hello@stratus.africa");
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("23505");
  });

  it("does not grant platform super_admin as a workspace role", async () => {
    const result = await assign("hello@stratus.africa", "super_admin");
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("22023");
  });

  it("does not create an account or grant access for an unknown email", async () => {
    const result = await assign("no-account-direct-assignment@example.invalid");
    expect(result.status).toBe(500);
    expect(result.body.code).toBe("P0002");
  });
});