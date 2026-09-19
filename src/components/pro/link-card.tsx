import Link from "next/link";

import { Card } from "@/components/dber/ui";

/** Small stat card that links to its section. */
export function LinkCard({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href}>
      <Card className="px-4 py-4 transition-colors hover:border-clay">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="tnum mt-1 font-mono text-[22px] font-semibold">{value}</p>
      </Card>
    </Link>
  );
}
