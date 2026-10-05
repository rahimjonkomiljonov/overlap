# Gachon University Global Campus (real campus data, O4)

Built from publicly available information (Gachon's official site and search results),
not an official export from Gachon University. Treat it as realistic reference data for
a personal/demo deployment, not a verified institutional dataset.

**Verified directly:**
- Campus name, address (Seongnam-si, Sujeong-gu), and email domain (`gachon.ac.kr`).
- Global Campus main switchboard: 031-750-5114.
- Student Counseling Center (학생상담센터), Global Campus: 031-750-5965, Global Center
  4th floor, room 401 — https://www.gachon.ac.kr/counseling/index.do
- Human Rights Center (인권센터, sexual harassment/violence support), Global Campus:
  031-750-8964 / 031-750-8965, Central Library rooms 310-311, weekdays 09:00-17:30
  (lunch 12:00-13:00), equality@gachon.ac.kr. Provided by the owner from Gachon's
  official site on 2026-10-05; still call once before launch to confirm it answers.
- The 9 central club names and categories (College list and 중앙동아리 names), and the
  AI Library / Vision Tower, Central Library, and dormitory facilities in `spots.csv`.

**Not independently verified — confirm before relying on them for anything real:**
- `safety-contacts.json`'s `campusSecurityPhone` is still the main switchboard
  (031-750-5114); no direct campus-security line has been confirmed yet. Per
  REQUIREMENTS.md G6 ("verify all numbers before launch"), call and confirm it.
- `courses.csv`'s instructor names are invented placeholders (same convention as
  `reference-data/sample/`), not real Gachon faculty — course codes/titles reflect
  Gachon's real college structure but aren't copied from an actual term's catalog.
- A few `spots.csv` entries (student union dining hall, campus convenience store, gym,
  cafe) are generic campus amenities that very likely exist but weren't individually
  confirmed by name.

Create the campus once, then import:

```sh
npm run db:create-campus -- --name "Gachon University Global Campus" --domain gachon.ac.kr
npm run db:import-reference -- --dir reference-data/gachon --domain gachon.ac.kr
```
