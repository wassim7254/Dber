import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listSellerCircles, listSellerProducts } from "@/domains/souq/application/souq-read";
import { listOwnerBookings } from "@/domains/kraya/application/kraya-read";
import { listOwnerAssets } from "@/domains/kraya/application/kraya-read";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { Card, DberMoney, EmptyState, SectionTitle, StatusBadge } from "@/components/dber/ui";
import { db } from "@/db/client";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function SellerOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller");
  if (user.role !== "seller" && user.role !== "admin") {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState
          icon="souq"
          title="This workspace is for sellers"
          body="Sign in with a seller account to manage products, groups and earnings."
        />
      </div>
    );
  }

  const [products, circles, bookings, assets, payouts] = await Promise.all([
    listSellerProducts(db, user.userId),
    listSellerCircles(db, user.userId),
    listOwnerBookings(db, user.userId),
    listOwnerAssets(db, user.userId),
    listPayoutsForOwner(db, user.userId),
  ]);

  const activeProducts = products.filter((product) => product.status === "active").length;
  const openCircles = circles.filter((circle) => circle.state === "open").length;
  const activeRentals = bookings.filter((booking) => ["confirmed", "active"].includes(booking.state)).length;
  const paidEarnings = payouts
    .filter((payout) => payout.state === "paid")
    .reduce((sum, payout) => sum + payout.amountMinor, 0);
  const pendingEarnings = payouts
    .filter((payout) => ["pending", "processing"].includes(payout.state))
    .reduce((sum, payout) => sum + payout.amountMinor, 0);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Seller overview"
        description="Your products, live groups, rental listings and earnings — all in one place."
        nav="seller"
        current="/pro/seller"
      />

      <section>
        <SectionTitle>At a glance</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Live products" value={String(activeProducts)} href="/pro/seller/products" />
          <StatCard label="Open groups" value={String(openCircles)} href="/pro/seller/groups" />
          <StatCard label="Active rentals" value={String(activeRentals)} href="/pro/rental/bookings" />
          <StatCard label="Assets listed" value={String(assets.length)} href="/pro/rental/assets" />
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <Link href="/pro/seller/products/new" className="text-[13px] font-semibold text-green-dark hover:underline">
              + New product
            </Link>
          }
        >
          Latest products
        </SectionTitle>
        {products.length === 0 ? (
          <EmptyState
            icon="souq"
            title="No products yet"
            body="Create your first SOUQ product draft — you can publish it once photos, price and inventory are set."
            action={
              <Link href="/pro/seller/products/new" className="rounded-lg bg-green px-4 py-2 text-[13px] font-semibold text-bg hover:bg-green-dark">
                Create a product
              </Link>
            }
          />
        ) : (
          <Card className="divide-y divide-line">
            {products.slice(0, 5).map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <Link href={`/pro/seller/products/${product.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                    {product.title}
                  </Link>
                  <p className="text-[12px] capitalize text-muted">{product.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <DberMoney amountMinor={product.basePriceMinor} currency={product.currency} size="sm" />
                  <StatusBadge state={product.status} withIcon={false} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Earnings</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Paid out</p>
            <DberMoney amountMinor={paidEarnings} currency="MAD" size="lg" />
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Pending settlement</p>
            <DberMoney amountMinor={pendingEarnings} currency="MAD" size="lg" />
          </div>
          <Link href="/pro/seller/earnings" className="text-[13px] font-semibold text-green-dark hover:underline">
            View earnings ledger →
          </Link>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="px-4 py-4 transition-colors hover:border-green">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="tnum mt-1 font-mono text-[24px] font-semibold">{value}</p>
      </Card>
    </Link>
  );
}
