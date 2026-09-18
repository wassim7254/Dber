import { z } from "zod";

import { mutationRoute } from "@/lib/http/with-route";
import { removeBlockedWindow } from "@/domains/kraya/application/kraya-service";

/** Owner unblocks a previously blocked window (reversal is operational, audited). */
export const POST = mutationRoute({
  scope: "kraya.availability.unblock",
  auth: ["seller", "professional", "admin"],
  body: z.object({}).optional(),
  handler: ({ tx, identity, params }) =>
    removeBlockedWindow(tx, identity, { assetId: params.id, windowId: params.windowId }),
});
