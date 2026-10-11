import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { IntentMode } from "../src/generated/prisma/enums";
import { loadCampusMatchPool } from "../src/server/matching/candidates";
import { buildIdfLookup, computeMatchTerms } from "../src/server/matching/terms";
import { scoreFromTerms, reciprocityScore } from "../src/server/matching/score";
import { INTENT_WEIGHTS } from "../src/server/matching/weights";
import { personalizeWeights } from "../src/server/matching/personalize";
import { writeFileSync } from "node:fs";

// Local demo only: prints Mina's term breakdown against everyone on Demo University.
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("local database only");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const campus = (await prisma.emailDomain.findUnique({ where: { domain: "demo.ac.kr" } }))!.campusId;
  const idf = buildIdfLookup(await prisma.idfStat.findMany({ where: { campusId: campus } }));
  const names = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name ?? ""]));
  const out: any[] = [];
  for (const intent of [IntentMode.FRIENDS, IntentMode.STUDY]) {
    const pool = await loadCampusMatchPool(prisma as any, campus, intent);
    const mina = pool.profiles.find((p) => names.get(p.userId) === "Mina");
    if (!mina) continue;
    for (const o of pool.profiles) {
      if (o === mina) continue;
      const t = computeMatchTerms(mina, o, idf);
      const w = INTENT_WEIGHTS[intent];
      const a = scoreFromTerms(t, personalizeWeights(w, mina.sliders));
      const b = scoreFromTerms(t, personalizeWeights(w, o.sliders));
      out.push({ intent, name: names.get(o.userId), C: t.C, K: t.K, T: t.T, I: t.I, V: t.V, a, b, rank: reciprocityScore(a, b), w });
    }
  }
  writeFileSync("C:/Users/User/overlap-demo/math.json", JSON.stringify(out, null, 1));
  for (const r of out) console.log(r.intent, r.name.padEnd(9), [r.C, r.K, r.T, r.I, r.V].map((x: number) => x.toFixed(2)).join(" "), r.rank.toFixed(1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
