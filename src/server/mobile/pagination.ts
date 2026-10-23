import * as z from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** `?limit=20&cursor=...` for every list route. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(512).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** What a cursor remembers: the sort position of the last item sent (an id, a timestamp). */
export type CursorValue = Record<string, string | number>;

/**
 * Cursors are opaque to the app: base64url of a small JSON object. They are not secret and not
 * signed, because every list query is scoped to the signed-in person anyway; a forged cursor can
 * only move around inside their own results. Always read one back with decodeCursor and a schema.
 */
export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** The cursor's contents if it is well-formed and matches `schema`, otherwise null (the route answers INVALID_INPUT). */
export function decodeCursor<S extends z.ZodType>(cursor: string, schema: S): z.infer<S> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Shapes a list response. Query for `limit + 1` rows: the extra row only tells us there is a next
 * page, it is never sent. `cursorFor` describes the position of the last item that is sent.
 */
export function pageOf<T>(rows: T[], limit: number, cursorFor: (last: T) => CursorValue): Page<T> {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit && items.length > 0;
  return { items, nextCursor: hasMore ? encodeCursor(cursorFor(items[items.length - 1])) : null };
}
