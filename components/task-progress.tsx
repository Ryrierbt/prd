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
    <section className="workspace-progress-card">
      <div className="workspace-progress-header">
        <div>
          <p>当前状态</p>
          <h2>{label}</h2>
        </div>
        <span>{progress}%</span>
      </div>
      <div className="workspace-progress-track">
        <div className="workspace-progress-value" style={{ width: `${progress}%` }} />
      </div>
      <p className="workspace-progress-caption">{currentStep}</p>
    </section>
  );
}
