import Link from "next/link";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-ink">
            海外 App 竞品调研工具
          </Link>
          <nav className="flex items-center gap-3 text-sm text-moss">
            <Link href="/" className="rounded-md px-3 py-2 hover:bg-mint">
              创建任务
            </Link>
            <Link href="/tasks" className="rounded-md px-3 py-2 hover:bg-mint">
              历史任务
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

