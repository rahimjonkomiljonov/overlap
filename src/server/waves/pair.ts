/**
 * Orders two user ids consistently so `Match.userAId`/`userBId` (and any other
 * unordered-pair key) is the same regardless of who waved first or which side is
 * "from"/"to" on either `Wave` row.
 */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
