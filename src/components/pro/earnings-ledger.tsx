import { Card, DberMoney, StatusBadge } from "@/components/dber/ui";
import { formatTimestamp } from "@/components/dber/ui";
import type { payouts } from "@/db/schema";

type Payout = typeof payouts.$inferSelect;

const ENTITY_LABEL: Record<string, string> = {
  souq_circle: "SOUQ group",
  khidma_booking: "KHIDMA booking",
  kraya_booking: "KRAYA rental",
};

/**
 * Provider earnings ledger (§22/§23): every row derives from a completed
 * transaction. Pending → processing → paid states are set by the settlement
 * worker — the UI never claims money was sent before the provider confirms.
 */
export function EarningsLedger({ rows, title = "Earnings" }: { rows: Payout[]; title?: string }) {
  const totals = {
    paid: rows.filter((row) => row.state === "paid").reduce((sum, row) => sum + row.amountMinor, 0),
    pending: rows.filter((row) => ["pending", "processing"].includes(row.state)).reduce((sum, row) => sum + row.amountMinor, 0),
    failed: rows.filter((row) => row.state === "failed").reduce((sum, row) => sum + row.amountMinor, 0),
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Paid out</p>
          <DberMoney amountMinor={totals.paid} currency="MAD" size="lg" />
        </Card>
        <Card className="p-5">
          <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Awaiting settlement</p>
          <DberMoney amountMinor={totals.pending} currency="MAD" size="lg" />
        </Card>
        <Card className="p-5">
          <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Failed (retrying)</p>
          <DberMoney amountMinor={totals.failed} currency="MAD" size="lg" />
        </Card>
      </div>

      <Card>
        <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">{title}</h2>
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">
            No earnings yet — completed transactions create payout records automatically.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium">
                    {ENTITY_LABEL[row.entityType] ?? row.entityType}
                    <span className="tnum ml-2 font-mono text-[11px] text-muted">{row.entityId.slice(0, 8)}…</span>
                  </p>
                  <p className="tnum text-[12px] text-muted">
                    Gross {(row.grossMinor / 100).toFixed(2)} MAD · fee {(row.feeMinor / 100).toFixed(2)} MAD · {formatTimestamp(row.createdAt.toISOString())}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <DberMoney amountMinor={row.amountMinor} currency={row.currency} size="md" />
                  <StatusBadge state={row.state} withIcon={false} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[12px] leading-relaxed text-muted">
        Settlement runs through the payment provider. “Awaiting settlement” means the
        transaction is complete and the payout is queued; the status changes to paid only
        after the provider confirms the transfer.
      </p>
    </div>
  );
}
