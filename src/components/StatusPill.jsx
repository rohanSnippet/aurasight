import { SYNC } from "@/lib/db";

const styles = {
  [SYNC.PENDING]:
    "bg-warning/15 text-warning border-warning/30",
  [SYNC.IN_PROGRESS]:
    "bg-accent/15 text-accent border-accent/40 animate-pulse",
  [SYNC.SYNCED]:
    "bg-success/15 text-success border-success/30",
};

const labels = {
  [SYNC.PENDING]: "Pending",
  [SYNC.IN_PROGRESS]: "Syncing",
  [SYNC.SYNCED]: "Synced",
};

const StatusPill = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${styles[status]}`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {labels[status]}
  </span>
);

export default StatusPill;