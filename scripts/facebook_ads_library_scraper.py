#!/usr/bin/env python3
"""Facebook Ads Library scraper adapter.

This local adapter follows the normalized output shape used by
domini-67/facebook-ads-library-scraper while keeping the app in control of
credentials and error handling.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect and normalize Facebook Ads Library ads.")
    parser.add_argument("--app-name", default="")
    parser.add_argument("--country", default="US")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--scroll-rounds", type=int, default=30)
    parser.add_argument("--browser-profile", default="")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument("--ads-json", default="", help="Existing normalized ads JSON to enrich from detail pages.")
    return parser.parse_args()


def facebook_ads_library_url(app_name: str, country: str) -> str:
    url = "https://www.facebook.com/ads/library/"
    params = {
        "active_status": "active",
        "ad_type": "all",
        "country": country,
        "q": app_name,
        "search_type": "keyword_unordered",
        "media_type": "all",
    }
    return f"{url}?{urllib.parse.urlencode(params, doseq=True)}"


def fetch_from_browser_page(app_name: str, country: str, limit: int, scroll_rounds: int, browser_profile: str, headless: bool) -> list[dict[str, Any]]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except Exception as error:
        raise RuntimeError("Python Playwright is not installed. Install it before using browser scraping.") from error

    keyword_url = facebook_ads_library_url(app_name, country)
    captured_ads: list[dict[str, Any]] = []
    captured_seen: set[str] = set()

    def remember(raw_ads: list[dict[str, Any]], target: list[dict[str, Any]], seen: set[str]) -> None:
        for raw in raw_ads:
            normalized = normalize_raw_html_ad(raw)
            ad_id = normalized.get("ad_archive_id") or normalized.get("adArchiveID") or normalized.get("id")
            if not ad_id:
                continue
            key = str(ad_id or json.dumps(normalized, sort_keys=True, ensure_ascii=False)[:200])
            if key in seen:
                continue
            seen.add(key)
            target.append(normalized)

    def handle_response(response: Any) -> None:
        if len(captured_ads) >= limit:
            return
        content_type = response.headers.get("content-type", "")
        if "json" not in content_type and "facebook.com" not in response.url:
            return
        try:
            if "json" in content_type:
                payload = response.json()
                remember(extract_ad_list_deep(payload), captured_ads, captured_seen)
        except Exception:
            return

    user_agent = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    )
    launch_args = ["--disable-blink-features=AutomationControlled"]
    with sync_playwright() as playwright:
        if browser_profile:
            context = playwright.chromium.launch_persistent_context(
                str(Path(browser_profile).expanduser()),
                headless=headless,
                args=launch_args,
                locale="en-US",
                viewport={"width": 1440, "height": 900},
                user_agent=user_agent,
            )
            owns_context = True
        else:
            browser = playwright.chromium.launch(headless=headless, args=launch_args)
            context = browser.new_context(
                locale="en-US",
                viewport={"width": 1440, "height": 900},
                user_agent=user_agent,
            )
            owns_context = False
        try:
            page = context.new_page()
            page.on("response", handle_response)
            try:
                page.goto(keyword_url, wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(4_000)
            except PlaywrightTimeoutError:
                pass
            keyword_content = safe_page_content(page)
            assert_not_challenge(keyword_content)
            remember(extract_ads_from_html(keyword_content), captured_ads, captured_seen)

            stalled_rounds = 0
            max_stalled_rounds = 5
            rounds = max(0, scroll_rounds)
            for _ in range(rounds):
                if len(captured_ads) >= limit:
                    break
                before = len(captured_ads)
                safe_scroll_to_bottom(page)
                page.wait_for_timeout(2_500)
                content = safe_page_content(page)
                assert_not_challenge(content)
                remember(extract_ads_from_html(content), captured_ads, captured_seen)
                after = len(captured_ads)
                if after <= before:
                    stalled_rounds += 1
                    if stalled_rounds >= max_stalled_rounds:
                        break
                else:
                    stalled_rounds = 0

        finally:
            if owns_context:
                context.close()
            else:
                context.close()
                browser.close()

    if not captured_ads:
        raise RuntimeError("Browser mode completed but no Facebook ads were extracted from page HTML or network responses.")
    return captured_ads[:limit]


def safe_page_content(page: Any) -> str:
    for _ in range(3):
        try:
            return page.content()
        except Exception:
            page.wait_for_timeout(800)
    return ""


def safe_scroll_to_bottom(page: Any) -> None:
    try:
        page.evaluate("() => { if (document.body) window.scrollTo(0, document.body.scrollHeight); }")
    except Exception:
        pass


def enrich_ads_with_browser_context(ads: list[dict[str, Any]], browser_profile: str, headless: bool) -> list[dict[str, Any]]:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:
        raise RuntimeError("Python Playwright is not installed. Install it before using browser scraping.") from error

    user_agent = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    )
    launch_args = ["--disable-blink-features=AutomationControlled"]
    with sync_playwright() as playwright:
        if browser_profile:
            context = playwright.chromium.launch_persistent_context(
                str(Path(browser_profile).expanduser()),
                headless=headless,
                args=launch_args,
                locale="en-US",
                viewport={"width": 1440, "height": 900},
                user_agent=user_agent,
            )
            owns_context = True
        else:
            browser = playwright.chromium.launch(headless=headless, args=launch_args)
            context = browser.new_context(
                locale="en-US",
                viewport={"width": 1440, "height": 900},
                user_agent=user_agent,
            )
            owns_context = False
        try:
            enrich_template_ads_from_detail_pages(context, ads)
        finally:
            if owns_context:
                context.close()
            else:
                context.close()
                browser.close()
    return ads


def enrich_template_ads_from_detail_pages(context: Any, ads: list[dict[str, Any]]) -> None:
    for ad in ads:
        if not needs_detail_enrichment(ad):
            continue
        ad_id = ad.get("ad_archive_id") or ad.get("adArchiveID") or ad.get("id") or ad.get("adid") or ad.get("ad_id")
        if not ad_id:
            continue
        detail_url = f"https://www.facebook.com/ads/library/?id={urllib.parse.quote(str(ad_id))}"
        for _ in range(2):
            page = context.new_page()
            try:
                page.goto(detail_url, wait_until="domcontentloaded", timeout=45_000)
                try:
                    page.wait_for_load_state("networkidle", timeout=10_000)
                except Exception:
                    pass
                page.wait_for_timeout(6_000)
                content = page.content()
                assert_not_challenge(content)
                visible_text = page.locator("body").inner_text(timeout=8_000)
                detail = parse_detail_visible_text(visible_text)
                if detail.get("body_text"):
                    snapshot = ad.get("snapshot")
                    if not isinstance(snapshot, dict):
                        snapshot = {}
                        ad["snapshot"] = snapshot
                    body = snapshot.get("body")
                    if not isinstance(body, dict):
                        body = {}
                        snapshot["body"] = body
                    body["text"] = detail["body_text"]
                if detail.get("link_title") and not ad.get("link_title"):
                    ad["link_title"] = detail["link_title"]
                if detail.get("link_description") and not ad.get("link_description"):
                    ad["link_description"] = detail["link_description"]
                if not needs_detail_enrichment(ad):
                    break
            except Exception:
                pass
            finally:
                page.close()


def needs_detail_enrichment(ad: dict[str, Any]) -> bool:
    snapshot = ad.get("snapshot")
    body_text = ""
    if isinstance(snapshot, dict):
        body = snapshot.get("body")
        if isinstance(body, dict):
            body_text = str(body.get("text") or "")
        elif isinstance(body, str):
            body_text = body
    if not body_text:
        return True
    return "{{" in body_text and "}}" in body_text


def parse_detail_visible_text(value: str) -> dict[str, str]:
    lines = [line.strip() for line in value.splitlines() if line.strip() and line.strip() != "\u200b"]
    if "Sponsored" not in lines:
        return {}
    start = lines.index("Sponsored") + 1
    body_lines: list[str] = []
    index = start
    while index < len(lines):
        line = lines[index]
        if is_detail_body_stop_line(line):
            break
        body_lines.append(line)
        index += 1

    while index < len(lines) and lines[index] not in ("Learn More", "Sign up", "Shop now", "Book now", "Download", "Subscribe"):
        index += 1

    link_title = ""
    link_description = ""
    for offset in range(max(start, index - 4), index):
        line = lines[offset]
        if is_domain_line(line) or is_media_time_line(line) or line in body_lines:
            continue
        if not link_title:
            link_title = line
        elif not link_description:
            link_description = line
            break

    return {
        "body_text": " ".join(body_lines).strip(),
        "link_title": link_title,
        "link_description": link_description,
    }


def is_detail_body_stop_line(line: str) -> bool:
    return is_media_time_line(line) or is_domain_line(line) or line in ("Learn More", "Sign up", "Shop now", "Book now", "Download", "Subscribe")


def is_media_time_line(line: str) -> bool:
    return bool(re.match(r"^\d+:\d{2}\s*/\s*\d+:\d{2}$", line))


def is_domain_line(line: str) -> bool:
    return bool(re.match(r"^[A-Z0-9.-]+\.[A-Z]{2,}$", line))


def assert_not_challenge(content: str) -> None:
    if is_verification_challenge(content):
        raise RuntimeError(
            "Facebook Ads Library returned a verification challenge in browser mode. "
            "Open the page manually with a reusable browser profile and pass --browser-profile after verification."
        )


def is_verification_challenge(content: str) -> bool:
    lowered = content.lower()
    return "__rd_verify" in lowered or "executechallenge" in lowered or "challenge=" in lowered


def extract_ad_list_deep(payload: Any) -> list[dict[str, Any]]:
    ads: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        if any(key in payload for key in ("ad_archive_id", "adArchiveID", "adid", "ad_id")):
            ads.append(payload)
        for value in payload.values():
            ads.extend(extract_ad_list_deep(value))
    elif isinstance(payload, list):
        for value in payload:
            ads.extend(extract_ad_list_deep(value))
    return ads


def extract_ads_from_html(content: str) -> list[dict[str, Any]]:
    decoded = html.unescape(content).replace("\\/", "/")
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for marker in ("ad_archive_id", "adArchiveID", "adid", "ad_id"):
        for match in re.finditer(marker, decoded):
            candidate = extract_json_object_around(decoded, match.start())
            if not candidate:
                continue
            normalized = normalize_raw_html_ad(candidate)
            ad_id = normalized.get("ad_archive_id")
            key = str(ad_id or json.dumps(normalized, sort_keys=True, ensure_ascii=False)[:200])
            if key in seen:
                continue
            seen.add(key)
            records.append(normalized)
    return records


def extract_json_object_around(content: str, index: int) -> dict[str, Any] | None:
    start = content.rfind("{", 0, index)
    while start != -1:
        raw = balanced_json_object(content, start)
        if raw:
            try:
                value = json.loads(raw)
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                pass
        start = content.rfind("{", 0, start)
    return None


def balanced_json_object(content: str, start: int) -> str | None:
    depth = 0
    in_string = False
    escaped = False
    for position in range(start, len(content)):
        char = content[position]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[start : position + 1]
    return None


def normalize_raw_html_ad(raw: dict[str, Any]) -> dict[str, Any]:
    nested = find_nested_ad(raw)
    merged = {**raw, **nested}
    return merged


def find_nested_ad(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        if any(key in value for key in ("ad_archive_id", "adArchiveID", "adid", "ad_id")):
            return value
        for child in value.values():
            found = find_nested_ad(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_nested_ad(child)
            if found:
                return found
    return {}


def first_text(raw: dict[str, Any], plural_key: str, singular_key: str) -> str:
    values = raw.get(plural_key)
    if isinstance(values, list):
        for value in values:
            if value:
                return str(value)
    value = raw.get(singular_key)
    return str(value) if value else ""


def normalize_platforms(raw: dict[str, Any]) -> list[str]:
    platforms = raw.get("publisher_platform") or raw.get("publisher_platforms")
    if isinstance(platforms, list):
        return [str(platform).upper() for platform in platforms if platform]
    if isinstance(platforms, str):
        return [platforms.upper()]
    placement = raw.get("placement")
    if isinstance(placement, dict):
        nested = placement.get("platforms") or placement.get("publisher_platform")
        if isinstance(nested, list):
            return [str(platform).upper() for platform in nested if platform]
        if isinstance(nested, str):
            return [nested.upper()]
    return []


def normalize_categories(raw: dict[str, Any]) -> list[str]:
    categories = raw.get("categories") or raw.get("ad_reached_countries") or []
    if isinstance(categories, list):
        return [str(category) for category in categories if category]
    if isinstance(categories, str):
        return [categories]
    return []


def normalize_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    snapshot = raw.get("snapshot")
    if not isinstance(snapshot, dict):
        snapshot = {}

    body = snapshot.get("body")
    body_text = ""
    if isinstance(body, dict):
        body_text = str(body.get("text") or body.get("message") or body.get("content") or "")
    elif isinstance(body, str):
        body_text = body
    if not body_text:
        body_text = first_text(raw, "ad_creative_bodies", "ad_creative_body") or str(raw.get("ad_text") or raw.get("message") or "")

    cta_text = snapshot.get("cta_text") or ""
    if not cta_text:
        cta = snapshot.get("cta") or raw.get("cta")
        if isinstance(cta, dict):
            cta_text = cta.get("title") or cta.get("text") or ""
        elif isinstance(cta, str):
            cta_text = cta

    images = []
    snapshot_images = snapshot.get("images")
    if isinstance(snapshot_images, list):
        for image in snapshot_images:
            if isinstance(image, dict):
                url = image.get("original_image_url") or image.get("url")
                if url:
                    images.append({"original_image_url": str(url)})

    creatives = raw.get("creatives")
    if not images and isinstance(creatives, list):
        for creative in creatives:
            if isinstance(creative, dict):
                url = creative.get("image_url") or creative.get("thumbnail_url") or creative.get("media_url")
                if url:
                    images.append({"original_image_url": str(url)})

    return {"body": {"text": body_text}, "cta_text": str(cta_text or ""), "images": images}


def first_url(raw: dict[str, Any]) -> str:
    snapshot = raw.get("snapshot")
    if not isinstance(snapshot, dict):
        snapshot = {}
    candidates = [
        raw.get("destination_url"),
        raw.get("link_url"),
        raw.get("url"),
        raw.get("website_url"),
        raw.get("ad_creative_link_url"),
        snapshot.get("link_url"),
        snapshot.get("url"),
    ]
    for value in candidates:
        if isinstance(value, str) and value:
            return value
    links = raw.get("links")
    if isinstance(links, list):
        for link in links:
            if isinstance(link, dict):
                value = link.get("url") or link.get("href")
                if value:
                    return str(value)
            elif isinstance(link, str) and link:
                return link
    return ""


def normalize_ad(raw: dict[str, Any]) -> dict[str, Any]:
    page = raw.get("page")
    if not isinstance(page, dict):
        page = {}
    return {
        "ad_archive_id": raw.get("ad_archive_id") or raw.get("adArchiveID") or raw.get("id") or raw.get("adid") or raw.get("ad_id"),
        "page_id": raw.get("page_id") or page.get("id"),
        "page_name": raw.get("page_name") or page.get("name"),
        "page_profile_uri": raw.get("page_profile_uri") or page.get("page_profile_uri") or page.get("url") or page.get("link"),
        "publisher_platform": normalize_platforms(raw),
        "snapshot": normalize_snapshot(raw),
        "page_like_count": raw.get("page_like_count") or page.get("like_count") or page.get("fan_count") or 0,
        "start_date": raw.get("start_date") or raw.get("ad_delivery_start_time"),
        "end_date": raw.get("end_date") or raw.get("ad_delivery_stop_time"),
        "categories": normalize_categories(raw),
        "ad_snapshot_url": raw.get("ad_snapshot_url"),
        "destination_url": first_url(raw),
        "link_title": first_text(raw, "ad_creative_link_titles", "ad_creative_link_title") or str(raw.get("link_title") or raw.get("title") or ""),
        "link_description": first_text(raw, "ad_creative_link_descriptions", "ad_creative_link_description")
        or str(raw.get("link_description") or raw.get("description") or ""),
    }


def main() -> int:
    args = parse_args()
    limit = max(1, min(args.limit, 50))
    scroll_rounds = max(0, min(args.scroll_rounds, 150))
    country = args.country.upper()

    try:
        if args.ads_json:
            loaded_ads = json.loads(args.ads_json)
            if not isinstance(loaded_ads, list):
                raise ValueError("--ads-json must be a JSON array.")
            ads = enrich_ads_with_browser_context(
                [ad for ad in loaded_ads if isinstance(ad, dict)][:limit],
                args.browser_profile,
                headless=not args.headful,
            )
        else:
            if not args.app_name:
                raise ValueError("--app-name is required when collecting ads.")
            raw_ads = fetch_from_browser_page(
                args.app_name,
                country,
                limit,
                scroll_rounds,
                args.browser_profile,
                headless=not args.headful,
            )
            ads = [normalize_ad(ad) for ad in raw_ads[:limit]]
        print(
            json.dumps(
                {
                    "source": "facebook_ads_library_browser",
                    "country": country,
                    "ads": ads,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
