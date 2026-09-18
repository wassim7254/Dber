export type StatusTone = "success" | "progress" | "muted" | "warn" | "danger" | "attention";

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

/**
 * Single source for presenting any domain state in the UI (§24/§35/§15):
 * derived from the same state unions the backend machines use, so the
 * interface can never present an action or label the state machine forbids.
 */
const STATES: Record<string, StatusPresentation> = {
  // SOUQ circle
  draft: { label: "Draft", tone: "muted" },
  open: { label: "Group forming", tone: "progress" },
  locked: { label: "Group locked", tone: "attention" },
  supplier_confirmed: { label: "Supplier confirmed", tone: "attention" },
  fulfilling: { label: "Fulfilling", tone: "progress" },
  delivered: { label: "Delivered", tone: "progress" },
  completed: { label: "Completed", tone: "success" },
  expired: { label: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "danger" },
  failed_closed: { label: "Failed", tone: "danger" },

  // KHIDMA / KRAYA bookings
  requested: { label: "Requested", tone: "muted" },
  quoted: { label: "Quoted", tone: "progress" },
  booked: { label: "Booked", tone: "progress" },
  payment_pending: { label: "Payment pending", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "attention" },
  in_progress: { label: "In progress", tone: "progress" },
  active: { label: "Active", tone: "progress" },
  disputed: { label: "Disputed", tone: "attention" },
  refunded: { label: "Refunded", tone: "muted" },

  // Payments
  created: { label: "Preparing", tone: "muted" },
  authorization_pending: { label: "Authorizing", tone: "progress" },
  authorized: { label: "Authorized", tone: "progress" },
  capture_pending: { label: "Capturing", tone: "progress" },
  captured: { label: "Paid", tone: "success" },
  void_pending: { label: "Releasing", tone: "progress" },
  voided: { label: "Released", tone: "muted" },
  refund_pending: { label: "Refunding", tone: "progress" },
  refunded_payment: { label: "Refunded", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },

  // Refunds
  provider_pending: { label: "Processing", tone: "progress" },

  // Cancellations & disputes
  pending: { label: "Pending review", tone: "warn" },
  approved: { label: "Approved", tone: "success" },
  executed: { label: "Executed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "muted" },
  opened: { label: "Opened", tone: "attention" },
  under_review: { label: "Under review", tone: "attention" },
  resolved: { label: "Resolved", tone: "success" },

  // Participant payments
  none: { label: "—", tone: "muted" },
  authorized_participant: { label: "Authorized", tone: "progress" },
};

export function statusPresentation(state: string): StatusPresentation {
  return STATES[state] ?? { label: state.replace(/_/g, " "), tone: "muted" };
}
