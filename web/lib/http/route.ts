import { z, ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "./errors";

/**
 * Route-handler plumbing shared by every `app/api/**` route:
 * request parsing with zod and one error shape `{ error, code, ...details }`.
 */

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { ...(err.details ?? {}), error: err.message, code: err.code },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return Response.json({ error: formatZodError(err), code: "bad_request" }, { status: 400 });
  }
  console.error("[api] unhandled error", err);
  return Response.json({ error: "internal error", code: "internal" }, { status: 500 });
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

type Handler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response>;

/** Wrap a handler so thrown `AppError`/`ZodError` become JSON error responses. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parse and validate a JSON body. Invalid JSON or schema mismatches → 400. */
export async function parseBody<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("request body must be valid JSON");
  }
  return schema.parse(raw);
}

/** Parse and validate URL search params (all values arrive as strings). */
export function parseQuery<S extends ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}

/** Common field schemas. */
export const ids = {
  uuid: z.string().uuid(),
  sessionId: z.string().uuid({ message: "session_id must be a session uuid" }),
};

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
