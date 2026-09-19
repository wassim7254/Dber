import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { EmptyState } from "@/components/dber/ui";
import { ProductForm } from "@/components/pro/product-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/products/new");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to create products." /></div>;
  }
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="New SOUQ product"
        description="Everything a buyer needs to understand the deal: what it is, what it costs, how it arrives."
        nav="seller"
        current="/pro/seller/products"
      />
      <ProductForm />
    </div>
  );
}
