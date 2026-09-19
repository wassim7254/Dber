import { env } from "@/lib/config/env";
import { isProduction } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors";
import type { PaymentGateway } from "@/infrastructure/payments/gateway";
import { MockGateway } from "@/infrastructure/payments/mock-gateway";
import { StripeGateway } from "@/infrastructure/payments/stripe-gateway";

let cached: PaymentGateway | null = null;

/**
 * Provider selection (§19/§72): the adapter is chosen once from validated
 * environment configuration. Production must select a real provider and its
 * secrets must be present — misconfiguration fails loudly, never falls back
 * to the mock silently.
 */
export function getGateway(): PaymentGateway {
  if (cached) return cached;
  if (env.DBER_PAYMENT_PROVIDER === "stripe") {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ConfigurationError(
        "Payment provider is Stripe but STRIPE_SECRET_KEY is not configured",
      );
    }
    cached = new StripeGateway(env.STRIPE_SECRET_KEY);
    return cached;
  }
  if (isProduction) {
    throw new ConfigurationError("The mock payment gateway is not allowed in production");
  }
  cached = new MockGateway();
  return cached;
}

/** Test support: reset the cached adapter after mutating env config. */
export function resetGatewayCache(): void {
  cached = null;
}
