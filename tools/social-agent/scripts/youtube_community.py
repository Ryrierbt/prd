#!/usr/bin/env python3
"""PRD-style public YouTube search/detail/comment collector.

This script intentionally mirrors the approach used in git@github.com:Ryrierbt/prd.git:
requests fetches public YouTube pages/oEmbed, and youtube-comment-downloader reads
public comments. It does not use browser cookies, login state, private data, or APIs.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_PACKAGES = PROJECT_ROOT / ".python-packages"
if LOCAL_PACKAGES.exists():
    sys.path.insert(0, str(LOCAL_PACKAGES))

try:
    import requests
except ImportError as exc:
    raise RuntimeError("Missing requests. Install requirements-youtube.txt into .python-packages.") from exc


YOUTUBE_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["search", "detail"], required=True)
    parser.add_argument("--query", default="")
    parser.add_argument("--video-id", default="")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--comments-limit", type=int, default=50)
    return parser.parse_args()


def compact_text(value: Any, limit: int = 1000) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def score_to_int(value: Any) -> Optional[int]:
    text = str(value or "").strip().lower().replace(",", "")
    match = re.match(r"([0-9.]+)\s*([kmb])?", text)
    if not match:
        return None
    amount = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        amount *= 1000
    if suffix == "m":
        amount *= 1000000
    if suffix == "b":
        amount *= 1000000000
    return int(amount)


def iso_from_timestamp(value: Any) -> Optional[str]:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat().replace("+00:00", "Z")
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


def youtube_oembed(url: str) -> Dict[str, Any]:
    try:
        response = requests.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, headers=YOUTUBE_HEADERS, timeout=12)
        if response.ok:
            return response.json()
    except (requests.RequestException, ValueError):
        pass
    return {}


def collect_search(query: str, limit: int) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for index, video_id in enumerate(search_youtube_video_ids(query, max(limit, 1)), start=1):
        url = f"https://www.youtube.com/watch?v={video_id}"
        oembed = youtube_oembed(url)
        title = compact_text(oembed.get("title"), 240)
        items.append({
            "externalId": video_id,
            "title": title,
            "author": compact_text(oembed.get("author_name"), 160) or None,
            "publishedAt": None,
            "visibleEngagement": None,
            "viewCount": None,
            "likeCount": None,
            "commentCount": None,
            "duration": None,
            "snippet": f"Public YouTube video: {title}" if title else None,
            "sourceUrl": url,
            "thumbnailUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "searchPosition": index,
        })
    return {"status": "SUCCESS", "items": items, "error": None}


def collect_detail(video_id: str, comments_limit: int) -> Dict[str, Any]:
    try:
        from youtube_comment_downloader import SORT_BY_POPULAR, YoutubeCommentDownloader
    except ImportError as exc:
        return {"status": "FAILED", "error": f"Missing youtube-comment-downloader: {exc}", "item": None, "comments": []}

    url = f"https://www.youtube.com/watch?v={video_id}"
    oembed = youtube_oembed(url)
    title = compact_text(oembed.get("title"), 240) or "YouTube video"
    item = {
        "title": title,
        "author": compact_text(oembed.get("author_name"), 160) or None,
        "publishedAt": None,
        "description": f"Public YouTube video: {title}",
        "viewCount": None,
        "likeCount": None,
        "commentCount": None,
        "duration": None,
        "tags": [],
        "sourceUrl": url,
        "thumbnailUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "relatedLinks": [],
        "subreddit": None,
        "postScore": None,
        "flair": None,
        "body": None,
    }
    comments: List[Dict[str, Any]] = []
    errors: List[str] = []
    try:
        downloader = YoutubeCommentDownloader()
        for comment in islice(downloader.get_comments_from_url(url, sort_by=SORT_BY_POPULAR), max(comments_limit, 1)):
            text = compact_text(comment.get("text"), 1200)
            if not text:
                continue
            cid = compact_text(comment.get("cid"), 160)
            comments.append({
                "commentId": cid or "",
                "author": compact_text(comment.get("author"), 160) or None,
                "content": text,
                "publishedAt": iso_from_timestamp(comment.get("time_parsed")),
                "likeCount": score_to_int(comment.get("votes")),
                "replyCount": score_to_int(comment.get("replies")),
                "commentUrl": f"{url}&lc={cid}" if cid else None,
                "parentCommentId": None,
            })
    except Exception as exc:
        errors.append(compact_text(exc, 160))
    return {"status": "SUCCESS" if item else "FAILED", "error": "; ".join(errors) if errors else None, "item": item, "comments": comments}


def main() -> None:
    args = parse_args()
    if args.mode == "search":
        if not compact_text(args.query, 200):
            raise ValueError("--query is required for search mode")
        result = collect_search(compact_text(args.query, 200), args.limit)
    else:
        if not re.match(r"^[A-Za-z0-9_-]{11}$", args.video_id):
            raise ValueError("--video-id must be a YouTube video id")
        result = collect_detail(args.video_id, args.comments_limit)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
