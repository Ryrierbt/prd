import { TaskForm } from "@/components/task-form";
import { DeepSeekSettings } from "@/components/deepseek-settings";
import { SiteShell } from "@/components/site-shell";

export default function HomePage() {
  return (
    <SiteShell>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <p className="text-sm font-medium text-moss">第一版可运行产品</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-ink">
            输入海外 App，创建可追溯的竞品调研任务
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-moss">采集官网、定价页和 App Store 公开数据，生成可追溯的竞品调研报告。</p>
        </section>
        <DeepSeekSettings />
      </div>
      <div className="mt-8">
        <TaskForm />
      </div>
    </SiteShell>
  );
}
