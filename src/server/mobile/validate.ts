import type { NextResponse } from "next/server";
import type * as z from "zod";
import type { UploadedFile } from "@/server/profile/photos-service";
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

/**
 * Largest file a mobile upload accepts. Vercel rejects any request body over 4.5 MB before our code
 * runs (with its own, unhelpful error), so ours is lower: the app shrinks every photo on the phone
 * first (a 1600 pixel JPEG is well under 1 MB), and a file over this gets a clear FILE_TOO_LARGE.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Room for the multipart envelope around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type UploadRead = { ok: true; file: UploadedFile } | { ok: false; response: NextResponse };

/**
 * Reads one file from a multipart/form-data request. Looks at the declared length first, so an
 * oversized upload is refused before it is buffered. The declared content type of the file is only
 * what the sender claims: the photo and selfie services still decode the bytes to be sure.
 */
export async function readUpload(
  request: Request,
  field: string,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<UploadRead> {
  if (
    !(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")
  ) {
    return bad([{ name: "Content-Type", problem: "must_be_multipart_form_data" }]);
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    return { ok: false, response: mobileError("RULE_VIOLATION", { reason: "FILE_TOO_LARGE" }) };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad([{ name: "(body)", problem: "invalid_multipart" }]);
  }
  const file = form.get(field);
  if (!(file instanceof File)) return bad([{ name: field, problem: "required" }]);
  return {
    ok: true,
    file: {
      size: file.size,
      type: file.type,
      bytes: async () => Buffer.from(await file.arrayBuffer()),
    },
  };
}
