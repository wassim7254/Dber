import { queryRoute } from "@/lib/http/with-route";
import { getCircleDetailView } from "@/domains/souq/application/souq-read";
import { db } from "@/db/client";

export const GET = queryRoute({
  handler: async ({ params, identity }) => {
    const circle = await getCircleDetailView(db, params.id, identity?.userId ?? null);
    return { circle };
  },
});
