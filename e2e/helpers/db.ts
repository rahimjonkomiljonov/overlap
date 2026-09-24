import { Pool } from "pg";

/**
 * Direct DB access for e2e setup/assertions only (never for the app itself to make
 * decisions with) — plain `pg`, not the generated Prisma client, because Playwright's
 * test-file loader can't evaluate that generated client module (it uses `import.meta`
 * in a way Playwright's transform doesn't support), unlike Vitest's Vite-native one.
 *
 * There's no UI path to grant a role (scripts/promote-role.ts is the real bootstrap
 * mechanism), so tests that need a moderator/admin session use this instead of
 * shelling out to that CLI for every test.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const Role = { USER: "USER", AMBASSADOR: "AMBASSADOR", MODERATOR: "MODERATOR", ADMIN: "ADMIN" } as const;
export type Role = (typeof Role)[keyof typeof Role];

export async function promoteToRole(email: string, role: Role): Promise<void> {
  await pool.query('UPDATE users SET role = $1 WHERE email = $2', [role, email.toLowerCase()]);
}

export async function countAuditLogRows(action: string): Promise<number> {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM audit_log WHERE action = $1', [action]);
  return result.rows[0].count;
}
