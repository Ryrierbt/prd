#!/usr/bin/env python3
"""Bridge Google Ads Transparency MCP library output to JSON for the Next.js app."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import warnings
from mimetypes import guess_extension
from pathlib import Path
from urllib.parse import urljoin

warnings.filterwarnings("ignore", category=Warning, module=r"urllib3\..*")


def load_client_class():
    project_root = Path(__file__).resolve().parents[1]
    local_packages = project_root / ".python-packages"
    if local_packages.exists():
        sys.path.insert(0, str(local_packages))

    try:
        from google_ads_transparency_mcp import GoogleAdsTransparency
    except ModuleNotFoundError as exc:
        if exc.name == "requests":
            raise RuntimeError('Missing dependency requests. Run: python3 -m pip install --target .python-packages "requests>=2.31.0"') from exc
        raise RuntimeError(
            "google-ads-transparency-mcp is not installed. Run: "
            "python3 -m pip install --target .python-packages --no-deps "
            "--ignore-requires-python git+https://github.com/block-town/google-ads-transparency-mcp.git"
        ) from exc

    return GoogleAdsTransparency


def resolve_advertiser(client, app_name: str, domain: str | None):
    advertiser = None

    if domain:
        advertiser = client.search_advertiser_by_domain(domain)
        if advertiser and advertiser.get("advertiser_id"):
            return advertiser

    advertisers = client.search_advertisers(app_name)
    if advertisers:
        exact = next(
            (item for item in advertisers if item.get("name", "").lower() == app_name.lower()),
            None,
        )
        advertiser = exact or advertisers[0]

    return advertiser


def has_image_content(ad) -> bool:
    content = ad.get("content") or {}
    image_url = str(content.get("image_url") or "").strip()
    return ad.get("format") == "image" and bool(image_url)


def get_ads(client, app_name: str, domain: str | None, limit: int, ad_format: str):
    advertiser = resolve_advertiser(client, app_name, domain)
    ads = []

    if advertiser and advertiser.get("advertiser_id"):
        scan_limit = min(max(limit * 5, 40), 120)
        creative_ids = client.get_creative_ids(advertiser["advertiser_id"], scan_limit)
        for creative_id in creative_ids:
            detail = client.get_ad_detail(advertiser["advertiser_id"], creative_id)
            detail["advertiser_name"] = advertiser.get("name") or app_name
            if ad_format == "image" and not has_image_content(detail):
                continue
            ads.append(detail)
            if len(ads) >= limit:
                break

    if not ads and ad_format == "all":
        ads = client.get_ads(app_name, limit)

    return advertiser, ads


def load_easyocr_reader():
    try:
        import easyocr
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "EasyOCR is not installed. Run: "
            "python3 -m pip install --target .python-packages git+https://github.com/JaidedAI/EasyOCR.git"
        ) from exc

    try:
        return easyocr.Reader(["en"], gpu=False, download_enabled=False, verbose=False)
    except TypeError:
        return easyocr.Reader(["en"], gpu=False)


def enrich_ads_with_assets(client, ads, asset_dir: str | None, asset_url_prefix: str, use_ocr: bool):
    if not asset_dir:
        return ads

    output_dir = Path(asset_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    reader = None
    ocr_error = ""

    if use_ocr:
        try:
            reader = load_easyocr_reader()
        except Exception as exc:
            ocr_error = str(exc)

    for ad in ads:
        content = ad.setdefault("content", {})
        image_url = str(content.get("image_url") or "").strip()
        if not image_url:
            continue

        try:
            downloaded = download_image_asset(client.session, image_url, output_dir, asset_url_prefix, ad.get("creative_id", "creative"))
            content.update(downloaded)
            image_path = downloaded.get("local_image_path")
            if reader and image_path:
                text = reader.readtext(image_path, detail=0, paragraph=True)
                content["ocr_text"] = " ".join(str(item).strip() for item in text if str(item).strip())
            elif ocr_error:
                content["ocr_error"] = ocr_error
        except Exception as exc:
            content["asset_error"] = str(exc)

    return ads


def download_image_asset(session, image_url: str, output_dir: Path, asset_url_prefix: str, creative_id: str):
    response = session.get(image_url, timeout=20)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    safe_id = re.sub(r"[^A-Za-z0-9_-]+", "-", creative_id or "creative").strip("-") or "creative"

    if content_type.startswith("text/html"):
        html_path = output_dir / f"{safe_id}.html"
        html_path.write_bytes(response.content)
        image_candidate = first_image_candidate(response.text, image_url)
        if image_candidate:
            nested = download_image_asset(session, image_candidate, output_dir, asset_url_prefix, f"{safe_id}-asset")
            nested["local_html_url"] = f"{asset_url_prefix}/{html_path.name}"
            nested["local_html_path"] = str(html_path)
            return nested
        return {
            "local_html_url": f"{asset_url_prefix}/{html_path.name}",
            "local_html_path": str(html_path),
        }

    extension = extension_for_content_type(content_type, image_url)
    image_path = output_dir / f"{safe_id}{extension}"
    image_path.write_bytes(response.content)
    return {
        "local_image_url": f"{asset_url_prefix}/{image_path.name}",
        "local_image_path": str(image_path),
    }


def first_image_candidate(html_text: str, base_url: str):
    text = html.unescape(html_text)
    values = re.findall(r"""(?:src|href)=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)""", text)
    for left, right in values:
        candidate = left or right
        if not candidate or candidate.startswith("data:"):
            continue
        if re.search(r"\.(?:png|jpe?g|gif|webp)(?:[?#]|$)", candidate, re.I) or "simgad" in candidate:
            return urljoin(base_url, candidate)
    return None


def extension_for_content_type(content_type: str, image_url: str):
    extension = guess_extension(content_type) if content_type else None
    if extension in {".jpe", ".jpeg"}:
        return ".jpg"
    if extension:
        return extension
    match = re.search(r"\.(png|jpe?g|gif|webp)(?:[?#]|$)", image_url, re.I)
    return f".{match.group(1).lower()}" if match else ".jpg"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-name", required=True)
    parser.add_argument("--domain")
    parser.add_argument("--region", default="anywhere")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--format", choices=["all", "image"], default="image")
    parser.add_argument("--asset-dir")
    parser.add_argument("--asset-url-prefix", default="")
    parser.add_argument("--ocr", action="store_true")
    args = parser.parse_args()

    limit = max(1, min(args.limit, 50))

    try:
        GoogleAdsTransparency = load_client_class()
        client = GoogleAdsTransparency(region=args.region)
        advertiser, ads = get_ads(client, args.app_name, args.domain, limit, args.format)
        ads = enrich_ads_with_assets(client, ads, args.asset_dir, args.asset_url_prefix.rstrip("/"), args.ocr)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "advertiser": advertiser,
                "format": args.format,
                "ads": ads[:limit],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
