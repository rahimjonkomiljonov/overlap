"use client";

import { useEffect } from "react";
import { markMeetupSeen } from "@/server/meetup/actions";

/**
 * Rendered on the meetup page. Opening it is what "seen" means: it tells the server which
 * status this person has now looked at, so the dot stops blinking for them on the chat and
 * the matches list.
 */
export function MeetupSeenMarker({ matchId }: { matchId: string }) {
  useEffect(() => {
    void markMeetupSeen(matchId);
  }, [matchId]);
  return null;
}
