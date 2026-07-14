import { statusLabels, type TaskStatus } from "@/lib/research/status";

export function TaskProgress({
  status,
  progress,
  currentStep
}: {
  status: string;
  progress: number;
  currentStep: string;
}) {
  const label = statusLabels[status as TaskStatus] ?? currentStep;

  return (
    <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-moss">当前状态</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">{label}</h2>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-sm text-moss">{progress}%</span>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-mint">
        <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-4 text-sm text-moss">{currentStep}</p>
    </section>
  );
}

