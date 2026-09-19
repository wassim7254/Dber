import { professionalProfileSchema } from "@/domains/khidma/schemas";
import { updateProfessionalProfile } from "@/domains/identity/application/provider-profiles";
import { mutationRoute } from "@/lib/http/with-route";

export const PUT = mutationRoute({
  scope: "professional.profile.update",
  auth: ["professional"],
  body: professionalProfileSchema,
  handler: ({ tx, identity, body }) => updateProfessionalProfile(tx, identity, body),
});
