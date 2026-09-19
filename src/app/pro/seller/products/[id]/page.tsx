import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { groupBuyCircles, souqProducts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { CircleForm } from "@/components/pro/circle-form";
import { ProductForm } from "@/components/pro/product-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/pro/seller/products/${id}`);

  const [product] = await db.select().from(souqProducts).where(eq(souqProducts.id, id)).limit(1);
  if (!product) notFound();
  if (user.role !== "admin" && product.sellerId !== user.userId) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState icon="souq" title="Not your product" body="You can only edit products you own." />
      </div>
    );
  }

  const productCircles = await db
    .select()
    .from(groupBuyCircles)
    .where(eq(groupBuyCircles.productId, product.id));

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title={product.title}
        description="Edit the listing details, manage its status and launch group buys."
        nav="seller"
        current="/pro/seller/products"
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <StatusBadge state={product.status} withIcon={false} />
          <DberMoney amountMinor={product.basePriceMinor} currency={product.currency} size="md" />
        </div>
        <ListingStatusActions
          transitionPath={`/api/v1/souq/products/${product.id}/transition`}
          status={product.status}
        />
      </Card>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Listing details</h2>
        <Card className="p-6">
          <ProductForm
            productId={product.id}
            initial={{
              title: product.title,
              description: product.description,
              category: product.category,
              subcategory: product.subcategory,
              sku: product.sku ?? "",
              basePriceMinor: product.basePriceMinor,
              unit: product.unit,
              maxAvailableQuantity: product.maxAvailableQuantity,
              deliveryMethod: product.deliveryMethod,
              deliveryFeeMinor: product.deliveryFeeMinor,
              fulfillmentHours: product.fulfillmentHours,
              location: product.location,
              images: product.images,
            }}
          />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Group buys for this product</h2>
        {productCircles.length > 0 ? (
          <Card className="divide-y divide-line">
            {productCircles.map((circle) => (
              <div key={circle.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="tnum text-[13.5px] font-medium">
                    {circle.currentQuantity} / {circle.targetQuantity} units · deadline{" "}
                    {new Date(circle.deadlineAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                  <Link href={`/souq/${circle.id}`} className="text-[12px] text-green-dark hover:underline">
                    View public page →
                  </Link>
                </div>
                <StatusBadge state={circle.state} withIcon={false} />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="souq"
            title="No group buys yet"
            body="Launch a group buy to let customers unlock the group price together."
          />
        )}
        <div className="mt-4">
          <Card className="p-6">
            <h3 className="mb-3 text-[15px] font-semibold">Launch a group buy</h3>
            <CircleForm productId={product.id} listPriceMinor={product.basePriceMinor} />
          </Card>
        </div>
      </section>
    </div>
  );
}
