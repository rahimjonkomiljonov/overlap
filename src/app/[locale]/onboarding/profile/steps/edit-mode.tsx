"use client";

import { createContext, useContext } from "react";

/**
 * Set by the profile editor (/me/profile) around the same step components the onboarding
 * wizard uses. In edit mode a step hides the "Step 3 of 11" counter and shows a Save
 * button instead of Next; outside the editor (null) nothing changes.
 */
export const EditModeContext = createContext<{ saveLabel: string } | null>(null);

export function useEditMode() {
  return useContext(EditModeContext);
}
