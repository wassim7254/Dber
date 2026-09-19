import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listSellerProducts } from "@/domains/souq/application/souq-read";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function SellerProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/products");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to manage products." /></div>;
  }
  const products = await listSellerProducts(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Products"
        description="Draft, publish and manage what you sell on SOUQ. Publishing requires a photo, price and inventory."
        nav="seller"
        current="/pro/seller/products"
      />
      <div className="flex justify-end">
        <Link href="/pro/seller/products/new" className="rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-green-dark">
          + New product
        </Link>
      </div>
      {products.length === 0 ? (
        <EmptyState
          icon="souq"
          title="No products yet"
          body="Your SOUQ storefront starts with a product. Create a draft, add photos and publish."
          action={
            <Link href="/pro/seller/products/new" className="rounded-lg bg-green px-4 py-2 text-[13px] font-semibold text-bg hover:bg-green-dark">
              Create your first product
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {products.map((product) => (
            <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link href={`/pro/seller/products/${product.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                  {product.title}
                </Link>
                <p className="tnum text-[12px] text-muted">
                  <span className="capitalize">{product.category}</span> · created {new Date(product.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DberMoney amountMinor={product.basePriceMinor} currency={product.currency} size="sm" />
                <StatusBadge state={product.status} withIcon={false} />
                <ListingStatusActions
                  transitionPath={`/api/v1/souq/products/${product.id}/transition`}
                  status={product.status}
                  compact
                />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
