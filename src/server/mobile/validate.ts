import type { NextResponse } from "next/server";
import type * as z from "zod";
import { mobileError, type FieldProblem } from "./guard";

/** Largest request body a mobile route reads. Photos and selfies are uploaded by their own routes, not as JSON. */
export const MAX_BODY_BYTES = 64 * 1024;

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Zod's issues reduced to "which field, what kind of problem". Never the value, never zod's message (it can echo input). */
function problemsOf(error: z.ZodError): FieldProblem[] {
  return error.issues
    .slice(0, 10)
    .map((issue) => ({ name: issue.path.join(".") || "(body)", problem: issue.code }));
}

const bad = (fields: FieldProblem[]): { ok: false; response: NextResponse } => ({
  ok: false,
  response: mobileError("INVALID_INPUT", { fields }),
});

/**
 * Reads and validates a JSON request body. Refuses a missing or wrong content type, a body over
 * MAX_BODY_BYTES, text that is not JSON, and anything the schema does not accept. Use a strict
 * schema (`z.strictObject`) so unexpected fields are rejected too.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return bad([{ name: "Content-Type", problem: "must_be_application_json" }]);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    return bad([{ name: "(body)", problem: "too_large" }]);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return bad([{ name: "(body)", problem: "invalid_json" }]);
  }
  const result = schema.safeParse(value);
  return result.success ? { ok: true, data: result.data } : bad(problemsOf(result.error));
}

/** Validates the query string (`?limit=20&cursor=...`). A repeated parameter uses its first value. */
export function readQuery<S extends z.ZodType>(request: Request, schema: S): Parsed<z.infer<S>> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams)
    if (!(key in params)) params[key] = value;
  const result = schema.safeParse(params);
  return result.success ? { ok: true, data: result.data } : bad(problemsOf(result.error));
}
