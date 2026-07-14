import { statusLabels, type TaskStatus } from "@/lib/research/status";

const toneByStatus: Record<string, string> = {
  COMPLETED: "border-green-200 bg-green-50 text-green-700",
  PARTIAL_COMPLETED: "border-amber-200 bg-amber-50 text-amber-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  WAITING: "border-line bg-white text-moss"
};

export function StatusBadge({ status }: { status: string }) {
  const label = statusLabels[status as TaskStatus] ?? status;
  const tone = toneByStatus[status] ?? "border-blue-200 bg-blue-50 text-blue-700";

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

