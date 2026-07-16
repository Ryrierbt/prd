#!/usr/bin/env node
import gplay from "google-play-scraper";

const args = parseArgs(process.argv.slice(2));
const term = args.term || "Otter.ai";
const appId = args["app-id"] || "";
const country = (args.country || "us").toLowerCase();
const lang = (args.lang || "en").toLowerCase();
const num = clampNumber(Number(args.num || 20), 1, 150);

try {
  const targetAppId = appId || (await findAppId(term, country, lang));
  const [app, reviews] = await Promise.all([
    gplay.app({ appId: targetAppId, country, lang }),
    gplay.reviews({
      appId: targetAppId,
      country,
      lang,
      sort: gplay.sort.NEWEST,
      num
    })
  ]);

  const data = Array.isArray(reviews) ? reviews : reviews.data || [];
  const output = {
    query: { term, appId: targetAppId, country, lang, num },
    app: {
      title: app.title,
      appId: app.appId,
      developer: app.developer,
      score: app.score,
      ratings: app.ratings,
      reviews: app.reviews,
      histogram: app.histogram,
      url: app.url
    },
    reviewCount: data.length,
    nextPaginationToken: Array.isArray(reviews) ? null : reviews.nextPaginationToken || null,
    reviews: data.map((review) => ({
      id: review.id,
      userName: review.userName,
      score: review.score,
      thumbsUp: review.thumbsUp,
      date: review.date instanceof Date ? review.date.toISOString() : review.date,
      title: review.title,
      text: review.text,
      replyDate: review.replyDate instanceof Date ? review.replyDate.toISOString() : review.replyDate,
      replyText: review.replyText,
      appVersion: review.version
    }))
  };

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}

async function findAppId(term, country, lang) {
  const results = await gplay.search({ term, country, lang, num: 10 });
  const exactDeveloper = results.find((app) => app.developer?.toLowerCase() === term.toLowerCase());
  const exactTitle = results.find((app) => app.title?.toLowerCase().includes(term.toLowerCase()));
  const selected = exactDeveloper || exactTitle || results[0];
  if (!selected?.appId) {
    throw new Error(`No Google Play app found for term: ${term}`);
  }
  return selected.appId;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.trunc(value), max));
}
