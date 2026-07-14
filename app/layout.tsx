import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "海外 App 竞品调研工具",
  description: "创建海外 App 调研任务，采集公开来源并生成可追溯 HTML 报告。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

