import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { Role } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * CLI to grant a role (H4). The only way to bootstrap the first admin — there's no UI
 * for it, on purpose (an admin console can't be the thing that promotes its own first
 * admin). Real use: the owner runs this once against the real database to make
 * themselves admin; local dev/e2e use it the same way against the throwaway database.
 *
 * Usage: tsx scripts/promote-role.ts --email <email> --role ADMIN|MODERATOR|USER|AMBASSADOR
 */
async function main() {
  loadEnv({ path: ".env.local" });

  const args = process.argv.slice(2);
  const email = argOf(args, "--email");
  const role = argOf(args, "--role");
  if (!email || !role || !isRole(role)) {
    console.error("Usage: tsx scripts/promote-role.ts --email <email> --role ADMIN|MODERATOR|USER|AMBASSADOR");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    console.log(`${user.email} (${user.name}, ${user.id}) is now ${user.role}.`);
  } catch {
    console.error(`No user found with email ${email}. They must sign up first.`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function isRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}

main();
