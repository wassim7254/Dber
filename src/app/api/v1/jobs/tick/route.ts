import { NextResponse } from "next/server";

import { runJobsOnce } from "@/jobs/run-once";
import { createRequestContext, runWithRequestContext } from "@/infrastructure/request-context/request-context";
import { env } from "@/lib/config/env";

const DEV_FALLBACK_JOBS_SECRET = "dber-dev-jobs-secret";

/** Cron-driven job execution for deploys without a persistent worker process. */
export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get("x-dber-jobs-secret");
  const expected = env.DBER_JOBS_SECRET ?? DEV_FALLBACK_JOBS_SECRET;
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Invalid jobs secret" } }, { status: 401 });
  }
  return runWithRequestContext(createRequestContext({ kind: "job" }), async () => {
    const summary = await runJobsOnce();
    return NextResponse.json({ data: summary, requestId: "jobs" });
  });
}
