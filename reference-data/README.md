# Reference data (S06)

Real campus data (courses, clubs, spots, safety contacts) is owner task O4 and isn't
in yet. `sample/` is placeholder data for local/CI testing only — the campus security
and counselling phone numbers in `sample/safety-contacts.json` are **fake** and must
never be imported into a real campus. Per REQUIREMENTS.md G6: "Verify all numbers
before launch."

Import a directory of CSVs (and an optional `safety-contacts.json`) for one campus:

```sh
npm run db:import-reference -- --dir reference-data/sample --domain test.ac.kr
```

`--domain` is any email domain already on that campus (`EmailDomain.domain`), used to
resolve which campus the files belong to. See `scripts/import-reference.ts` for the
expected file names and `src/server/reference/schemas.ts` for each row's shape.

Safe to re-run: rows are upserted by natural key, and a row missing from a later
import is deactivated (not deleted), since profile data (S07+) can reference it.

National emergency numbers (112, 119, 1366, 디지털성범죄피해자지원센터) are **not**
part of this import — they're code constants (`src/server/safety/emergency.ts`, S16)
so a per-campus config file can never omit or mistype them. Only campus-specific
numbers (security office, counselling center, sexual-violence center) come from
`safety-contacts.json`.
