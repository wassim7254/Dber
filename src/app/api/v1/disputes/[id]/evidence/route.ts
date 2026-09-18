import { mutationRoute } from "@/lib/http/with-route";
import { addEvidenceSchema } from "@/domains/disputes/schemas";
import { addEvidence } from "@/domains/disputes/application/dispute-service";

export const POST = mutationRoute({
  scope: "dispute.evidence",
  auth: ["buyer", "seller", "professional", "admin"],
  body: addEvidenceSchema,
  handler: ({ tx, identity, body, params }) =>
    addEvidence(tx, identity, { disputeId: params.id, evidenceType: body.evidenceType, storageReference: body.storageReference }),
});
