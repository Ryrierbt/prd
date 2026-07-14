"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const activeStatuses = new Set([
  "WAITING",
  "IDENTIFYING",
  "COLLECTING_WEBSITE",
  "COLLECTING_PRICING",
  "COLLECTING_REVIEWS",
  "COLLECTING_PROMOTION",
  "ANALYZING",
  "GENERATING_REPORT"
]);

export function TaskAutoRefresh({ status }: { status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!activeStatuses.has(status)) return;

    const interval = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [router, status]);

  return null;
}
