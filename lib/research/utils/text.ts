import * as cheerio from "cheerio";
import type { CollectedPage } from "@/lib/research/types";

export function parseHtmlPage(url: string, rawHtml: string): CollectedPage {
  const $ = cheerio.load(rawHtml);
  $("script, style, noscript, svg").remove();

  const title = normalizeWhitespace($("title").first().text());
  const description = normalizeWhitespace(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      ""
  );
  const text = normalizeWhitespace($("body").text());

  return {
    url,
    title,
    description,
    text,
    rawHtml,
    fetchedAt: new Date()
  };
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string | null | undefined, length = 12000) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export function escapeHtml(value: string | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char] ?? char;
  });
}

export function uniqueValues(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => normalizeWhitespace(value ?? ""))
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}

export function splitSentences(text: string, limit = 8) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function getOriginUrl(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function joinUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

