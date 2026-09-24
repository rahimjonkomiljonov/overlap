# Moderation playbook (draft — DRAFT for lawyer review, O6)

> Written for S13, per requirements H1, G1, G5–G8. Describes the process the S16
> "Safety core" step builds tooling for — this file is the process draft; the report
> queue, strike enforcement and evidence-preservation UI are S16's job, not this one.

## Report categories and SLA

| Priority | Categories | First response |
|---|---|---|
| **Urgent** | Non-consensual intimate images, deepfakes, illegal filming; threats of violence; a minor on the platform; anything suggesting an in-progress safety risk | < 2 hours, any time of day (on-call rota, not just business hours) |
| **Standard** | Harassment, unwanted contact after a block/hide request, scams/phishing, spam/solicitation, fake profile, inappropriate content, other ToS/Guidelines violations | < 24 hours |

Every report queue entry shows: category, priority, the reporter-supplied evidence
(only source of chat content a moderator ever sees — see G1), the reported account's
prior strikes, and one-click actions (dismiss, warn, suspend, ban, escalate to
police-referral).

## Evidence handling

- A report is the **only** path by which chat content reaches a human. The reporter
  (a party to that conversation) attaches up to the last 50 messages when filing;
  moderators never browse chat outside of an active report.
- Reported evidence is retained 90 days after the report closes, per the retention
  table in `docs/REQUIREMENTS.md` §15.4 — long enough for an appeal or a
  law-enforcement follow-up, not indefinitely.
- Evidence for a case referred to police (see below) is preserved past the normal
  90-day window until the referring moderator confirms the referral is resolved or
  withdrawn.

## Decision and enforcement

- **Every suspension or ban is decided by a human moderator**, with a stated reason
  shown to the affected user and a path to appeal (PIPA Art. 37-2 — automated-decision
  rights; no account is ever suspended or banned by an algorithm alone). An automated
  trust-score reach limit (G10) may reduce a low-trust account's visibility, but can
  never itself produce a permanent ban without human review.
- **Strike ladder:** warn → 7-day suspension → permanent ban. A single urgent-category
  substantiated report (non-consensual imagery, deepfakes, illegal filming, credible
  threats) can jump straight to permanent ban and police referral — it does not need
  to work through the ladder first.
- On ban, the account's identity is kept only as a salted hash to block re-registration
  (A3); strike records for banned accounts are kept up to 3 years (§15.4).
- The reported user never learns who filed the report; the reporting user is
  auto-hidden from the reported account immediately on filing, before any moderator
  decision.

## Police-referral and evidence-preservation checklist

For non-consensual intimate imagery, deepfakes, illegal filming, or any report
suggesting an ongoing sexual-crime risk:

1. **Preserve first, act second where they conflict.** Snapshot the reporter-supplied
   evidence, the reported account's profile state, and any relevant metadata (upload
   timestamps, account creation date) before taking any account action that might
   change what's visible.
2. **Escalate to the moderation lead immediately** — this category is never handled by
   a first-response moderator alone.
3. **Take the account action** appropriate to the severity (immediate ban for
   substantiated non-consensual imagery/deepfakes; urgent-priority hold for anything
   less clear-cut pending review) — do not leave a credible urgent report unactioned
   while deciding on police referral.
4. **Offer the reporter the digital sex-crime victim support center and 1366** contact
   information directly in the report-confirmation flow (see `/safety` page), whether
   or not they choose to also involve police.
5. **Police referral itself is the reporter's or victim's choice to make**, not
   something the platform does on their behalf without consent — except where Korean
   law creates a mandatory reporting duty (counsel to confirm the scope of any such
   duty for this platform). The moderation lead's job is to have the preserved
   evidence ready to hand over if and when it's requested through valid legal process,
   not to initiate contact with police unprompted.
6. **Log the referral** (case reference, date, evidence retained, outcome once known)
   separately from the ordinary report record, since its retention need may outlast
   the standard 90-day window.

## Staffing

- Named moderators with an on-call rota covering the urgent-response window
  (nights/weekends included — urgent reports don't wait for business hours).
- New moderators complete training on: the category list above, the evidence-handling
  rule (report-only access to chat), the human-decision requirement, and the
  police-referral checklist before taking queue shifts.
- Moderator wellbeing: rotation off urgent-category review after sustained exposure,
  and access to support resources — exact program to be defined with the owner before
  launch (O-task, not yet scheduled).
- Role-based access: moderators see reports, evidence and account state needed to act;
  they never see sensitive fields (`interested_in`, any future biometric data) outside
  what a specific report's evidence legitimately includes (H4).

## Metrics reviewed weekly

- Reports by category and priority, resolved within SLA vs. not.
- Time-to-first-response for urgent vs. standard.
- Repeat-report accounts and strike-ladder outcomes.
- Any police referrals and their status.
