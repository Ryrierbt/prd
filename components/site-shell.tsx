import Link from "next/link";

export function SiteShell({ children, activeNav = "home" }: { children: React.ReactNode; activeNav?: "home" | "tasks" | "compare" }) {
  return (
    <div className="home-page-shell">
      <header className="home-header">
        <div className="home-header-inner">
          <Link href="/" className="home-brand">
            <img src="/icon/icon_01.png" alt="" />
            <span>海外 App 竞品调研工具</span>
          </Link>
          <nav className="home-nav">
            <Link href="/" className={`home-nav-link ${activeNav === "home" ? "active" : ""}`}>
              创建任务
            </Link>
            <Link href="/tasks" className={`home-nav-link ${activeNav === "tasks" ? "active" : ""}`}>
              历史任务
            </Link>
            <Link href="/compare" className={`home-nav-link ${activeNav === "compare" ? "active" : ""}`}>
              横向对比
            </Link>
          </nav>
        </div>
      </header>
      <main className="home-main">{children}</main>
    </div>
  );
}
