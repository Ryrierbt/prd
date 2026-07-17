#!/usr/bin/env python3
"""Collect public YouTube comments for a research task."""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_PACKAGES = PROJECT_ROOT / ".python-packages"
if LOCAL_PACKAGES.exists():
    sys.path.insert(0, str(LOCAL_PACKAGES))

try:
    import requests
except ImportError as exc:
    raise RuntimeError("Missing requests. Install requirements-community.txt into .python-packages.") from exc


YOUTUBE_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-name", required=True)
    parser.add_argument("--queries-json", required=True)
    parser.add_argument("--youtube-video-limit", type=int, default=20)
    parser.add_argument("--youtube-videos-per-query", type=int, default=5)
    parser.add_argument("--youtube-comments-per-video", type=int, default=20)
    return parser.parse_args()


def compact_text(value: Any, limit: int = 1000) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def score_to_int(value: Any) -> int:
    text = str(value or "0").strip().lower().replace(",", "")
    match = re.match(r"([0-9.]+)\s*([km])?", text)
    if not match:
        return 0
    amount = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        amount *= 1000
    if suffix == "m":
        amount *= 1000000
    return int(amount)


def iso_from_timestamp(value: Any) -> Optional[str]:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def search_youtube_video_ids(query: str, limit: int) -> List[str]:
    response = requests.get(
        "https://www.youtube.com/results",
        params={"search_query": query},
        headers=YOUTUBE_HEADERS,
        timeout=20,
    )
    response.raise_for_status()
    video_ids: List[str] = []
    for video_id in re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', response.text):
        if video_id not in video_ids:
            video_ids.append(video_id)
        if len(video_ids) >= limit:
            break
    return video_ids


def youtube_title(url: str) -> str:
    try:
        response = requests.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=12)
        if response.ok:
            return compact_text(response.json().get("title"), 180)
    except (requests.RequestException, ValueError):
        pass
    return "YouTube 视频"


def collect_youtube(queries: List[str], video_limit: int, videos_per_query: int, comments_per_video: int) -> Dict[str, Any]:
    try:
        from youtube_comment_downloader import SORT_BY_POPULAR, YoutubeCommentDownloader
    except ImportError as exc:
        return {"status": "FAILED", "error": f"Missing youtube-comment-downloader: {exc}", "items": []}

    videos: List[Dict[str, Any]] = []
    seen_video_ids = set()
    query_map: Dict[str, List[str]] = {}
    errors: List[str] = []
    per_query_limit = max(videos_per_query, 1)

    for query in queries:
        try:
            for video_id in search_youtube_video_ids(query, per_query_limit):
                query_map.setdefault(video_id, []).append(query)
                if video_id not in seen_video_ids and len(seen_video_ids) < video_limit:
                    seen_video_ids.add(video_id)
        except requests.RequestException as exc:
            errors.append(f"{query}: {compact_text(exc, 120)}")

    downloader = YoutubeCommentDownloader()
    for video_id in seen_video_ids:
        url = f"https://www.youtube.com/watch?v={video_id}"
        title = youtube_title(url)
        videos.append(
            {
                "platform": "YouTube",
                "itemType": "VIDEO",
                "title": title,
                "content": f"公开视频：{title}",
                "author": None,
                "score": None,
                "commentCount": None,
                "publishedAt": None,
                "sourceUrl": url,
                "searchQuery": " | ".join(query_map.get(video_id, [])),
                "relatedProducts": None,
            }
        )
        try:
            comments = downloader.get_comments_from_url(url, sort_by=SORT_BY_POPULAR)
            for comment in islice(comments, max(comments_per_video, 1)):
                text = compact_text(comment.get("text"), 1200)
                if not text:
                    continue
                videos.append(
                    {
                        "platform": "YouTube",
                        "itemType": "COMMENT",
                        "title": title,
                        "content": text,
                        "author": compact_text(comment.get("author"), 160) or None,
                        "score": score_to_int(comment.get("votes")),
                        "commentCount": score_to_int(comment.get("replies")),
                        "publishedAt": iso_from_timestamp(comment.get("time_parsed")),
                        "sourceUrl": f"{url}&lc={comment.get('cid')}" if comment.get("cid") else url,
                        "searchQuery": " | ".join(query_map.get(video_id, [])),
                        "relatedProducts": None,
                    }
                )
        except Exception as exc:  # The library surfaces platform-specific parsing errors.
            errors.append(f"{video_id}: {compact_text(exc, 120)}")

    if not videos:
        return {"status": "FAILED", "error": "; ".join(errors) or "YouTube 未返回可用公开视频或评论。", "items": []}
    return {"status": "SUCCESS", "error": "; ".join(errors) if errors else None, "items": videos}


def main() -> None:
    args = parse_args()
    try:
        queries = [compact_text(item, 180) for item in json.loads(args.queries_json) if compact_text(item, 180)]
    except (TypeError, ValueError):
        queries = []
    if not queries:
        queries = [f"{args.app_name} review", f"{args.app_name} alternative", f"{args.app_name} vs"]

    videos_per_query = max(args.youtube_videos_per_query, 1)
    video_limit = max(args.youtube_video_limit, len(queries) * videos_per_query, 1)
    youtube = collect_youtube(queries, video_limit, videos_per_query, max(args.youtube_comments_per_video, 1))
    items = youtube.get("items", [])
    print(json.dumps({"queries": queries, "youtube": youtube, "items": items}, ensure_ascii=False))


if __name__ == "__main__":
    main()
