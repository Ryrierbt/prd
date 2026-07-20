import { TaskForm } from "@/components/task-form";
import { DeepSeekSettings } from "@/components/deepseek-settings";
import { SocialBrowserLauncher } from "@/components/social-browser-launcher";
import { SiteShell } from "@/components/site-shell";

export default function HomePage() {
  return (
    <SiteShell activeNav="home">
      <div className="home-layout">
        <section className="home-hero">
          <p className="home-badge">第一版可运行产品</p>
          <h1>
            输入海外 App，
            <br />
            创建可追溯的竞品调研任务
          </h1>
          <p>采集官网、定价页和 App Store 公开数据，生成可追溯的竞品调研报告。</p>
          <img className="home-globe" src="/home-globe.png" alt="全球 App 调研" />
        </section>
        <aside className="home-configs">
          <DeepSeekSettings />
          <SocialBrowserLauncher />
        </aside>
      </div>
      <TaskForm />
    </SiteShell>
  );
}
