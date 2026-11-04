-- Supabase advisor clean-up (2026-11-04).
-- 1) pg_trgm out of "public": the autocomplete GIN indexes use it only through gin_trgm_ops, bound by object id,
--    so they keep working; no query calls its functions by name. Guarded: plain Postgres (CI) has no "extensions" schema.
-- 2) Storage buckets: only JPEG up to 8 MB (the app re-encodes everything to JPEG and checks 8 MB itself). Guarded: no "storage" schema in CI.
-- 3) Indexes for 18 foreign keys that had none.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
     AND EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm' AND n.nspname = 'public') THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET file_size_limit = 8388608, allowed_mime_types = ARRAY['image/jpeg']
     WHERE id IN ('profile-photos', 'verification-selfies');
  END IF;
END $$;

CREATE INDEX "event_connects_fromUserId_idx" ON "event_connects"("fromUserId");
CREATE INDEX "events_organizerId_idx" ON "events"("organizerId");
CREATE INDEX "events_spotId_idx" ON "events"("spotId");
CREATE INDEX "hide_rules_hiddenUserId_idx" ON "hide_rules"("hiddenUserId");
CREATE INDEX "matches_userBId_idx" ON "matches"("userBId");
CREATE INDEX "meet_proposals_proposedByUserId_idx" ON "meet_proposals"("proposedByUserId");
CREATE INDEX "meet_proposals_spotId_idx" ON "meet_proposals"("spotId");
CREATE INDEX "meetup_feedback_entries_userId_idx" ON "meetup_feedback_entries"("userId");
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");
CREATE INDEX "moderation_actions_actorId_idx" ON "moderation_actions"("actorId");
CREATE INDEX "moderation_actions_reportId_idx" ON "moderation_actions"("reportId");
CREATE INDEX "plan_share_links_proposalId_idx" ON "plan_share_links"("proposalId");
CREATE INDEX "profile_courses_sectionId_idx" ON "profile_courses"("sectionId");
CREATE INDEX "reports_conversationId_idx" ON "reports"("conversationId");
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");
CREATE INDEX "selfies_decidedById_idx" ON "selfies"("decidedById");
CREATE INDEX "trust_appeals_reviewerId_idx" ON "trust_appeals"("reviewerId");
CREATE INDEX "users_inviteCodeId_idx" ON "users"("inviteCodeId");
