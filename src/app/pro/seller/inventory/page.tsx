import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { groupBuyCircles, souqProducts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, EmptyState } from "@/components/dber/ui";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

/**
 * Inventory view (§6): available = max_available − units committed to open
 * and locked circles. Committed quantity is derived from live circles, never
 * entered by hand, so the ledger cannot drift.
 */
export default async function SellerInventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/inventory");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to view inventory." /></div>;
  }

  const products = await db.select().from(souqProducts).where(eq(souqProducts.sellerId, user.userId));
  const circles = await db.select().from(groupBuyCircles).where(eq(groupBuyCircles.sellerId, user.userId));

  const rows = products.map((product) => {
    const committed = circles
      .filter((circle) => circle.productId === product.id && ["open", "locked", "supplier_confirmed", "fulfilling", "delivered"].includes(circle.state))
      .reduce((sum, circle) => sum + circle.currentQuantity, 0);
    const sold = circles
      .filter((circle) => circle.productId === product.id && ["completed", "expired", "cancelled", "failed_closed"].includes(circle.state))
      .reduce((sum, circle) => sum + circle.currentQuantity, 0);
    return {
      id: product.id,
      title: product.title,
      status: product.status,
      available: Math.max(0, product.maxAvailableQuantity - committed - sold),
      committed,
      sold,
      total: product.maxAvailableQuantity,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Inventory"
        description="Quantities committed to live groups are reserved automatically; completed and closed circles count as sold."
        nav="seller"
        current="/pro/seller/inventory"
      />
      {rows.length === 0 ? (
        <EmptyState icon="souq" title="Nothing to track yet" body="Inventory appears once you create products with available quantities." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Available</th>
                <th className="px-3 py-3 font-semibold">Committed</th>
                <th className="px-3 py-3 font-semibold">Sold</th>
                <th className="px-3 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-[280px] truncate px-5 py-3.5 font-medium">{row.title}</td>
                  <td className="tnum px-3 py-3.5 font-mono">{row.available}</td>
                  <td className="tnum px-3 py-3.5 font-mono">{row.committed}</td>
                  <td className="tnum px-3 py-3.5 font-mono">{row.sold}</td>
                  <td className="tnum px-3 py-3.5 font-mono">{row.total}</td>
                  <td className="px-5 py-3.5 capitalize text-muted">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
