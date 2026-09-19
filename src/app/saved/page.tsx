import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { krayaAssets, khidmaServices, savedItems, souqProducts, users } from "@/db/schema";
import { authenticate } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState } from "@/components/dber/ui";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const identity = await authenticate();
  if (!identity) redirect("/welcome");

  const rows = await db
    .select()
    .from(savedItems)
    .where(eq(savedItems.userId, identity.userId));

  const souqIds = rows.filter((r) => r.entityType === "souq_product").map((r) => r.entityId);
  const serviceIds = rows.filter((r) => r.entityType === "khidma_service").map((r) => r.entityId);
  const assetIds = rows.filter((r) => r.entityType === "kraya_asset").map((r) => r.entityId);

  const [souq, services, assets] = await Promise.all([
    souqIds.length
      ? db
          .select({ id: souqProducts.id, title: souqProducts.title, price: souqProducts.basePriceMinor, currency: souqProducts.currency })
          .from(souqProducts)
          .where(inArray(souqProducts.id, souqIds))
      : Promise.resolve([]),
    serviceIds.length
      ? db
          .select({ id: khidmaServices.id, title: khidmaServices.title, price: khidmaServices.basePriceMinor, currency: khidmaServices.currency, pro: users.displayName, professionalId: khidmaServices.professionalId })
          .from(khidmaServices)
          .innerJoin(users, eq(khidmaServices.professionalId, users.id))
          .where(inArray(khidmaServices.id, serviceIds))
      : Promise.resolve([]),
    assetIds.length
      ? db
          .select({ id: krayaAssets.id, title: krayaAssets.title, price: krayaAssets.dailyRateMinor, currency: krayaAssets.currency })
          .from(krayaAssets)
          .where(inArray(krayaAssets.id, assetIds))
      : Promise.resolve([]),
  ]);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[760px] space-y-5">
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Saved</h1>
          <p className="mt-1 text-[13.5px] text-muted">Products, services, and rentals you bookmarked.</p>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            icon="saved"
            title="Nothing saved yet"
            body="Save any product, professional, or rental to compare here later."
            action={
              <Link href="/" className="rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-green-dark">
                Explore
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {souq.map((product) => (
              <li key={product.id}>
                <Link href="/souq" className="block">
                  <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]">
                    <div>
                      <p className="text-[14px] font-semibold">{product.title}</p>
                      <p className="text-[12.5px] text-muted">SOUQ · list price</p>
                    </div>
                    <DberMoney amountMinor={product.price} currency={product.currency} size="sm" />
                  </Card>
                </Link>
              </li>
            ))}
            {services.map((service) => (
              <li key={service.id}>
                <Link href={`/khidma/pro/${service.professionalId}`} className="block">
                  <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]">
                    <div>
                      <p className="text-[14px] font-semibold">{service.title}</p>
                      <p className="text-[12.5px] text-muted">KHIDMA · {service.pro}</p>
                    </div>
                    <DberMoney amountMinor={service.price} currency={service.currency} size="sm" />
                  </Card>
                </Link>
              </li>
            ))}
            {assets.map((asset) => (
              <li key={asset.id}>
                <Link href={`/kraya/${asset.id}`} className="block">
                  <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]">
                    <div>
                      <p className="text-[14px] font-semibold">{asset.title}</p>
                      <p className="text-[12.5px] text-muted">KRAYA · per day</p>
                    </div>
                    <DberMoney amountMinor={asset.price} currency={asset.currency} size="sm" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
