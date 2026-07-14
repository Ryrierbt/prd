import { statusLabels, type TaskStatus } from "@/lib/research/status";

const toneByStatus: Record<string, string> = {
  COMPLETED: "completed",
  PARTIAL_COMPLETED: "partial",
  FAILED: "failed",
  WAITING: "waiting"
};

export function StatusBadge({ status }: { status: string }) {
  const label = statusLabels[status as TaskStatus] ?? status;
  const tone = toneByStatus[status] ?? "running";

  return <span className={`workspace-status-badge ${tone}`}>{label}</span>;
}
