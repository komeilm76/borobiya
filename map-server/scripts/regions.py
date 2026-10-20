#!/usr/bin/env python3
"""Region catalog resolver for the Borobiya map pipeline.

Single source of truth for *where* map data comes from. The catalog
(map-server/regions.json) pins every Geofabrik source extract to one dated,
MD5-verified snapshot and describes selectable areas: whole countries and
city crops. Shell scripts call this module to

  * validate the catalog itself            (validate-catalog)
  * render selection menus                   (menu-countries, menu-areas, list)
  * canonicalize a user selection            (resolve)
  * enumerate downloads / crops to build     (sources, areas)
  * fetch per-area acceptance-test data      (verify-point)
  * write and verify the merged-PBF provenance manifest
                                             (write-manifest, verify-manifest)
  * convert a Tehran-only v1 manifest from the pre-catalog pipeline
                                             (migrate-manifest-v1)

Selection rules (enforced by resolve):
  * area IDs are `<country>` (whole country) or `<country>-<city>`;
  * duplicates collapse, input order is preserved (first area is primary);
  * a whole-country area supersedes that country's cities;
  * bounding boxes may overlap (including adjacent whole countries): every
    input comes from the same pinned snapshot, and `osmium merge` writes an
    object that appears in multiple inputs only once.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CATALOG_PATH = SCRIPT_DIR.parent / "regions.json"

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MD5_RE = re.compile(r"^[0-9a-f]{32}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
GEOFABRIK_PREFIX = "https://download.geofabrik.de/"
# The pre-catalog VM runbook temporarily recorded this mutable alias for the
# exact 2026-10-18 Iran bytes. Migration accepts it only when every pinned
# snapshot field below proves that byte identity.
LEGACY_IRAN_LATEST_URL = "https://download.geofabrik.de/asia/iran-latest.osm.pbf"
EPSILON = 1e-9


def fail(message: str) -> None:
    print(f"regions: {message}", file=sys.stderr)
    raise SystemExit(1)


def note(message: str) -> None:
    print(f"regions: {message}", file=sys.stderr)


def load_catalog(path: Path = CATALOG_PATH) -> dict:
    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read catalog {path}: {error}")
    if not isinstance(catalog, dict):
        fail(f"catalog {path} must be a JSON object")
    return catalog


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def format_number(value: float) -> str:
    """Stable compact rendering shared by shell output and manifests."""
    return f"{value:.10g}"


def format_bbox(bbox: list[float]) -> str:
    return ",".join(format_number(value) for value in bbox)


def bbox_problem(bbox: object) -> str | None:
    if (
        not isinstance(bbox, list)
        or len(bbox) != 4
        or any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in bbox)
        or not all(math.isfinite(value) for value in bbox)
    ):
        return "must be [west, south, east, north] finite numbers"
    west, south, east, north = (float(value) for value in bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        return "must satisfy -180<=west<east<=180 and -90<=south<north<=90"
    return None


def point_in_bbox(point: object, bbox: list[float]) -> bool:
    if (
        not isinstance(point, list)
        or len(point) != 2
        or any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in point)
    ):
        return False
    lon, lat = (float(value) for value in point)
    west, south, east, north = bbox
    return west <= lon <= east and south <= lat <= north



def validate_catalog(catalog: dict) -> list[str]:
    problems: list[str] = []
    if catalog.get("version") != 1:
        problems.append("catalog version must be 1")
    snapshot = catalog.get("snapshot")
    if not isinstance(snapshot, dict) or snapshot.get("provider") != "Geofabrik" or snapshot.get("license") != "ODbL-1.0":
        problems.append("snapshot must identify Geofabrik and the ODbL-1.0 license")

    sources = catalog.get("sources")
    if not isinstance(sources, dict) or not sources:
        problems.append("sources must be a non-empty object")
        sources = {}
    for source_id, source in sources.items():
        if not SLUG_RE.match(source_id):
            problems.append(f"source id {source_id!r} must be a lowercase slug")
        if not isinstance(source, dict):
            problems.append(f"source {source_id!r} must be an object")
            continue
        url = source.get("url", "")
        if not (isinstance(url, str) and url.startswith(GEOFABRIK_PREFIX) and url.endswith(".osm.pbf")):
            problems.append(f"source {source_id!r} url must be an HTTPS Geofabrik .osm.pbf URL")
        if not MD5_RE.match(str(source.get("md5", ""))):
            problems.append(f"source {source_id!r} md5 must be 32 lowercase hex characters")
        size = source.get("bytes")
        if size is not None and (isinstance(size, bool) or not isinstance(size, int) or size <= 0):
            problems.append(f"source {source_id!r} bytes must be null or a positive integer")

    countries = catalog.get("countries")
    if not isinstance(countries, list) or not countries:
        problems.append("countries must be a non-empty list")
        countries = []
    seen_areas: set[str] = set()
    for country in countries:
        if not isinstance(country, dict):
            problems.append("every country must be an object")
            continue
        country_id = country.get("id", "")
        label = f"country {country_id!r}"
        if not SLUG_RE.match(str(country_id)):
            problems.append(f"{label} id must be a lowercase slug")
        if country_id in seen_areas:
            problems.append(f"duplicate area id {country_id!r}")
        seen_areas.add(str(country_id))
        if country.get("source") not in sources:
            problems.append(f"{label} references unknown source {country.get('source')!r}")
        if not re.match(r"^[a-z]{2}$", str(country.get("language", ""))):
            problems.append(f"{label} language must be a two-letter code")
        problem = bbox_problem(country.get("bbox"))
        if problem:
            problems.append(f"{label} bbox {problem}")
            continue
        cities = country.get("cities")
        if not isinstance(cities, list) or not cities:
            problems.append(f"{label} must list at least one city")
            continue
        for city in cities:
            if not isinstance(city, dict):
                problems.append(f"{label} has a non-object city entry")
                continue
            area_id = f"{country_id}-{city.get('id', '')}"
            city_label = f"area {area_id!r}"
            if not SLUG_RE.match(area_id):
                problems.append(f"{city_label} id must be a lowercase slug")
            if area_id in seen_areas:
                problems.append(f"duplicate area id {area_id!r}")
            seen_areas.add(area_id)
            source_id = city.get("source", country.get("source"))
            if source_id not in sources:
                problems.append(f"{city_label} references unknown source {source_id!r}")
            problem = bbox_problem(city.get("bbox"))
            if problem:
                problems.append(f"{city_label} bbox {problem}")
                continue
            bbox = [float(value) for value in city["bbox"]]
            if not point_in_bbox(city.get("center"), bbox):
                problems.append(f"{city_label} center must be a [lon, lat] point inside its bbox")
            verify = city.get("verify")
            if not isinstance(verify, dict):
                problems.append(f"{city_label} must define verify data")
                continue
            for key in ("routeFrom", "routeTo"):
                if not point_in_bbox(verify.get(key), bbox):
                    problems.append(f"{city_label} verify.{key} must be inside its bbox")
            if not str(verify.get("geocodeQuery", "")).strip():
                problems.append(f"{city_label} verify.geocodeQuery must be non-empty")
    return problems


def area_index(catalog: dict) -> dict[str, dict]:
    """All selectable areas keyed by ID, with country context attached."""
    index: dict[str, dict] = {}
    for country in catalog["countries"]:
        country_id = country["id"]
        index[country_id] = {
            "id": country_id,
            "countryId": country_id,
            "kind": "country",
            "name": country["name"],
            "localName": country.get("localName", country["name"]),
            "source": country["source"],
            "bbox": [float(value) for value in country["bbox"]],
            "heavy": bool(country.get("wholeCountryHeavy")),
            "country": country,
            "verifyCity": country["cities"][0],
        }
        for city in country["cities"]:
            area_id = f"{country_id}-{city['id']}"
            index[area_id] = {
                "id": area_id,
                "countryId": country_id,
                "kind": "city",
                "name": city["name"],
                "localName": city.get("localName", city["name"]),
                "source": city.get("source", country["source"]),
                "bbox": [float(value) for value in city["bbox"]],
                "center": [float(value) for value in city["center"]],
                "heavy": False,
                "country": country,
                "verifyCity": city,
            }
    return index


def resolve_selection(catalog: dict, selection_text: str) -> dict:
    index = area_index(catalog)
    tokens = [token.strip().lower() for token in selection_text.split(",")]
    if not tokens or any(not token for token in tokens):
        fail("selection must be a comma-separated list of area IDs (see --list-regions)")
    unknown = [token for token in tokens if token not in index]
    if unknown:
        fail(
            f"unknown area id(s): {', '.join(unknown)}; "
            f"valid IDs: {', '.join(index)}"
        )

    ordered: list[str] = []
    for token in tokens:
        if token not in ordered:
            ordered.append(token)

    whole_countries = {token for token in ordered if index[token]["kind"] == "country"}
    canonical: list[str] = []
    for token in ordered:
        area = index[token]
        if area["kind"] == "city" and area["countryId"] in whole_countries:
            note(f"{token} is already covered by whole country {area['countryId']}; dropping it")
            continue
        canonical.append(token)

    areas = [index[token] for token in canonical]
    union = [
        min(area["bbox"][0] for area in areas),
        min(area["bbox"][1] for area in areas),
        max(area["bbox"][2] for area in areas),
        max(area["bbox"][3] for area in areas),
    ]
    source_ids: list[str] = []
    for area in areas:
        if area["source"] not in source_ids:
            source_ids.append(area["source"])
    languages: list[str] = []
    for area in areas:
        language = area["country"]["language"]
        if language not in languages:
            languages.append(language)
    if "en" not in languages:
        languages.append("en")
    approx_mb = sum(int(catalog["sources"][source_id].get("approxSizeMb") or 0) for source_id in source_ids)

    return {
        "areas": areas,
        "ids": canonical,
        "primary": canonical[0],
        "bbox": union,
        "sourceIds": source_ids,
        "languages": languages,
        "defaultLanguage": areas[0]["country"]["language"],
        "approxDownloadMb": approx_mb,
        "heavy": any(area["heavy"] for area in areas),
    }


def shell_quote(value: object) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


def emit_shell(pairs: dict[str, object]) -> None:
    for key, value in pairs.items():
        print(f"{key}={shell_quote(value)}")


def tile_zxy(lon: float, lat: float, zoom: int = 12) -> str:
    scale = 2**zoom
    x = int((lon + 180.0) / 360.0 * scale)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * scale)
    x = min(max(x, 0), scale - 1)
    y = min(max(y, 0), scale - 1)
    return f"{zoom}/{x}/{y}"


# ---------------------------------------------------------------- commands


def command_validate_catalog(catalog: dict, _args: argparse.Namespace) -> None:
    problems = validate_catalog(catalog)
    if problems:
        for problem in problems:
            print(f"regions: catalog: {problem}", file=sys.stderr)
        raise SystemExit(1)
    index = area_index(catalog)
    print(f"OK: catalog valid ({len(catalog['countries'])} countries, {len(index)} selectable areas, {len(catalog['sources'])} pinned sources)")


def command_list(catalog: dict, _args: argparse.Namespace) -> None:
    snapshot = catalog["snapshot"]
    print(f"Borobiya map areas — Geofabrik snapshot {snapshot['dataDate']} (ODbL-1.0, MD5-pinned)")
    print("Select whole countries, individual cities, or any mix (including adjacent countries).\n")
    for country in catalog["countries"]:
        source = catalog["sources"][country["source"]]
        heavy = "  [HEAVY: multi-GB build]" if country.get("wholeCountryHeavy") else ""
        print(f"{country['name']} ({country['localName']})")
        print(f"  {country['id']:<24} entire country (source {country['source']}, ~{source.get('approxSizeMb', '?')} MB){heavy}")
        for city in country["cities"]:
            area_id = f"{country['id']}-{city['id']}"
            source_id = city.get("source", country["source"])
            print(f"  {area_id:<24} {city['name']} ({city['localName']}) — source {source_id}")
        print()


def command_menu_countries(catalog: dict, _args: argparse.Namespace) -> None:
    for country in catalog["countries"]:
        print(f"{country['id']}\t{country['name']}\t{country['localName']}\t{len(country['cities'])}")


def command_menu_areas(catalog: dict, args: argparse.Namespace) -> None:
    country = next((entry for entry in catalog["countries"] if entry["id"] == args.country.lower()), None)
    if country is None:
        fail(f"unknown country {args.country!r}; valid: {', '.join(entry['id'] for entry in catalog['countries'])}")
    source = catalog["sources"][country["source"]]
    heavy = " [HEAVY: multi-GB download and build]" if country.get("wholeCountryHeavy") else ""
    print(f"{country['id']}\tEntire country (~{source.get('approxSizeMb', '?')} MB download){heavy}")
    for city in country["cities"]:
        print(f"{country['id']}-{city['id']}\t{city['name']} ({city['localName']})")


def command_resolve(catalog: dict, args: argparse.Namespace) -> None:
    resolved = resolve_selection(catalog, args.selection)
    if args.json:
        print(json.dumps({
            "areas": resolved["ids"],
            "primary": resolved["primary"],
            "bbox": resolved["bbox"],
            "sourceIds": resolved["sourceIds"],
            "languages": resolved["languages"],
            "defaultLanguage": resolved["defaultLanguage"],
            "approxDownloadMb": resolved["approxDownloadMb"],
            "heavy": resolved["heavy"],
        }, ensure_ascii=False))
        return
    emit_shell({
        "REGION_IDS": ",".join(resolved["ids"]),
        "PRIMARY_AREA": resolved["primary"],
        "UNION_BBOX": format_bbox(resolved["bbox"]),
        "SOURCE_IDS": ",".join(resolved["sourceIds"]),
        "PHOTON_LANGUAGES": ",".join(resolved["languages"]),
        "PHOTON_DEFAULT_LANGUAGE": resolved["defaultLanguage"],
        "APPROX_DOWNLOAD_MB": resolved["approxDownloadMb"],
        "SELECTION_HEAVY": "1" if resolved["heavy"] else "0",
    })


def command_sources(catalog: dict, args: argparse.Namespace) -> None:
    resolved = resolve_selection(catalog, args.selection)
    for source_id in resolved["sourceIds"]:
        source = catalog["sources"][source_id]
        file_name = source["url"].rsplit("/", 1)[-1]
        size = source.get("bytes")
        print(f"{source_id}\t{source['url']}\t{file_name}\t{source['md5']}\t{size if size is not None else ''}\t{source.get('approxSizeMb', '')}")


def command_areas(catalog: dict, args: argparse.Namespace) -> None:
    resolved = resolve_selection(catalog, args.selection)
    for area in resolved["areas"]:
        bbox = "ALL" if area["kind"] == "country" else format_bbox(area["bbox"])
        print(f"{area['id']}\t{area['countryId']}\t{area['source']}\t{bbox}\t{area['name']}")


def command_verify_point(catalog: dict, args: argparse.Namespace) -> None:
    index = area_index(catalog)
    area = index.get(args.area.lower())
    if area is None:
        fail(f"unknown area id {args.area!r}; valid IDs: {', '.join(index)}")
    city = area["verifyCity"]
    if area["kind"] == "country":
        note(f"{area['id']} is a whole country; verifying against {city['name']}")
    verify = city["verify"]
    route_from = verify["routeFrom"]
    route_to = verify["routeTo"]
    center = city["center"]
    emit_shell({
        "AREA_ID": area["id"],
        "AREA_NAME": area["name"],
        "AREA_BBOX": format_bbox([float(value) for value in city["bbox"]]),
        "TILE_ZXY": tile_zxy(float(center[0]), float(center[1])),
        "ROUTE_FROM_LON": format_number(float(route_from[0])),
        "ROUTE_FROM_LAT": format_number(float(route_from[1])),
        "ROUTE_TO_LON": format_number(float(route_to[0])),
        "ROUTE_TO_LAT": format_number(float(route_to[1])),
        "GEOCODE_QUERY": verify["geocodeQuery"],
        "REVERSE_LON": format_number(float(route_to[0])),
        "REVERSE_LAT": format_number(float(route_to[1])),
    })


def source_file(data_dir: Path, catalog: dict, source_id: str) -> Path:
    return data_dir / "source" / catalog["sources"][source_id]["url"].rsplit("/", 1)[-1]


def command_write_crop_meta(catalog: dict, args: argparse.Namespace) -> None:
    index = area_index(catalog)
    area = index.get(args.area.lower())
    if area is None or area["kind"] != "city":
        fail(f"crop metadata requires a city area id, got {args.area!r}")
    crop_path = Path(args.crop)
    if not crop_path.is_file() or crop_path.stat().st_size == 0:
        fail(f"crop PBF is missing or empty: {crop_path}")
    if not SHA256_RE.match(args.source_sha256):
        fail("--source-sha256 must be 64 lowercase hex characters")
    meta = {
        "area": area["id"],
        "source": area["source"],
        "sourceSha256": args.source_sha256,
        "bbox": area["bbox"],
        "strategy": "smart",
        "osmiumToolVersion": args.osmium_version,
        "sha256": sha256_file(crop_path),
    }
    Path(args.meta).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote crop metadata: {args.meta}")


def command_verify_crop(catalog: dict, args: argparse.Namespace) -> None:
    """Exit 0 only when an existing crop provably matches the catalog + source."""
    index = area_index(catalog)
    area = index.get(args.area.lower())
    if area is None or area["kind"] != "city":
        fail(f"crop verification requires a city area id, got {args.area!r}")
    try:
        meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise SystemExit(1)
    crop_path = Path(args.crop)
    if not crop_path.is_file() or crop_path.stat().st_size == 0:
        raise SystemExit(1)
    if (
        meta.get("area") != area["id"]
        or meta.get("source") != area["source"]
        or meta.get("sourceSha256") != args.source_sha256
        or meta.get("strategy") != "smart"
        or [float(value) for value in meta.get("bbox", [])] != area["bbox"]
        or meta.get("sha256") != sha256_file(crop_path)
    ):
        raise SystemExit(1)
    print(f"OK: reusing verified crop for {area['id']}")


def command_write_manifest(catalog: dict, args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir).resolve()
    merged = Path(args.merged).resolve()
    if not merged.is_file() or merged.stat().st_size == 0:
        fail(f"merged PBF is missing or empty: {merged}")
    resolved = resolve_selection(catalog, args.selection)
    snapshot = catalog["snapshot"]

    sources: list[dict] = []
    source_sha: dict[str, str] = {}
    for source_id in resolved["sourceIds"]:
        source = catalog["sources"][source_id]
        path = source_file(data_dir, catalog, source_id)
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"source PBF is missing or empty: {path}")
        actual_md5 = md5_file(path)
        if actual_md5 != source["md5"]:
            fail(f"source {source_id} MD5 mismatch: expected {source['md5']}, got {actual_md5}")
        expected_bytes = source.get("bytes")
        actual_bytes = path.stat().st_size
        if expected_bytes is not None and actual_bytes != expected_bytes:
            fail(f"source {source_id} size mismatch: expected {expected_bytes}, got {actual_bytes}")
        source_sha[source_id] = sha256_file(path)
        sources.append({
            "id": source_id,
            "provider": snapshot["provider"],
            "url": source["url"],
            "dataDate": snapshot["dataDate"],
            "dataTimestamp": snapshot["dataTimestamp"],
            "file": path.name,
            "bytes": actual_bytes,
            "md5": actual_md5,
            "sha256": source_sha[source_id],
            "license": snapshot["license"],
        })

    crops: list[dict] = []
    for area in resolved["areas"]:
        if area["kind"] == "country":
            crops.append({
                "area": area["id"],
                "file": str(source_file(data_dir, catalog, area["source"])),
                "bbox": None,
                "strategy": "whole-source",
                "sha256": source_sha[area["source"]],
            })
        else:
            crop_path = data_dir / "crops" / f"{area['id']}.osm.pbf"
            if not crop_path.is_file() or crop_path.stat().st_size == 0:
                fail(f"crop PBF is missing or empty: {crop_path}")
            crops.append({
                "area": area["id"],
                "file": str(crop_path),
                "bbox": area["bbox"],
                "strategy": "smart",
                "sha256": sha256_file(crop_path),
            })

    manifest = {
        "version": 2,
        "dataset": args.dataset,
        "areas": resolved["ids"],
        "bbox": resolved["bbox"],
        "sources": sources,
        "crops": crops,
        "merged": {
            "file": str(merged),
            "sha256": sha256_file(merged),
            "osmiumToolVersion": args.osmium_version,
        },
        "attribution": "© OpenStreetMap contributors",
        "attributionUrl": "https://www.openstreetmap.org/copyright",
    }
    output = data_dir / f"{args.dataset}.source.json"
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"Wrote provenance manifest: {output}")


def command_verify_manifest(catalog: dict, args: argparse.Namespace) -> None:
    manifest_path = Path(args.manifest)
    pbf_path = Path(args.pbf)
    if not pbf_path.is_file() or pbf_path.stat().st_size == 0:
        fail(f"cropped/merged PBF is missing or empty: {pbf_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"invalid provenance manifest {manifest_path}: {error}")
    if manifest.get("version") != 2:
        fail(
            f"{manifest_path} is not a version-2 (multi-area) manifest. "
            "Rebuild the dataset with prepare-regions-pbf.sh, or let "
            "scripts/setup-ubuntu-vm.sh migrate a Tehran-only install."
        )

    resolved = resolve_selection(catalog, args.selection)
    if sorted(manifest.get("areas", [])) != sorted(resolved["ids"]):
        fail(
            f"manifest areas {manifest.get('areas')!r} do not match selected areas "
            f"{resolved['ids']!r}; rebuild with prepare-regions-pbf.sh"
        )

    def bbox_matches(candidate: object, expected: list[float]) -> bool:
        return (
            isinstance(candidate, list)
            and len(candidate) == 4
            and all(abs(float(value) - float(want)) <= EPSILON for value, want in zip(candidate, expected))
        )

    if not bbox_matches(manifest.get("bbox"), resolved["bbox"]):
        fail(f"manifest bbox {manifest.get('bbox')!r} does not match selection union {resolved['bbox']!r}")
    if args.bbox:
        try:
            expected_bbox = [float(value.strip()) for value in args.bbox.split(",")]
        except ValueError:
            fail(f"--bbox must be west,south,east,north numbers, got {args.bbox!r}")
        if bbox_problem(expected_bbox):
            fail(f"--bbox {bbox_problem(expected_bbox)}")
        if not bbox_matches(manifest.get("bbox"), expected_bbox):
            fail(f"manifest bbox {manifest.get('bbox')!r} does not match MAP_BBOX {expected_bbox!r}")

    snapshot = catalog["snapshot"]
    manifest_sources = manifest.get("sources")
    if not isinstance(manifest_sources, list):
        fail("manifest sources must be a list")
    by_id = {entry.get("id"): entry for entry in manifest_sources if isinstance(entry, dict)}
    if sorted(by_id) != sorted(resolved["sourceIds"]):
        fail(f"manifest sources {sorted(by_id)!r} do not match selection sources {sorted(resolved['sourceIds'])!r}")
    for source_id, entry in by_id.items():
        pinned = catalog["sources"][source_id]
        if entry.get("provider") != snapshot["provider"] or entry.get("license") != snapshot["license"]:
            fail(f"manifest source {source_id} must identify Geofabrik and the ODbL-1.0 license")
        if entry.get("url") != pinned["url"] or entry.get("md5") != pinned["md5"] or entry.get("dataDate") != snapshot["dataDate"]:
            fail(f"manifest source {source_id} does not match the pinned catalog snapshot")
        if not SHA256_RE.match(str(entry.get("sha256", ""))):
            fail(f"manifest source {source_id} has an invalid sha256")

    index = area_index(catalog)
    crops = manifest.get("crops")
    if not isinstance(crops, list) or sorted(entry.get("area") for entry in crops if isinstance(entry, dict)) != sorted(resolved["ids"]):
        fail("manifest crops do not match the selected areas")
    for crop in crops:
        area = index[crop["area"]]
        expected_strategy = "whole-source" if area["kind"] == "country" else "smart"
        if crop.get("strategy") != expected_strategy:
            fail(f"manifest crop {crop['area']} strategy must be {expected_strategy}")
        if area["kind"] == "city" and not bbox_matches(crop.get("bbox"), area["bbox"]):
            fail(f"manifest crop {crop['area']} bbox does not match the catalog")
        if not SHA256_RE.match(str(crop.get("sha256", ""))):
            fail(f"manifest crop {crop['area']} has an invalid sha256")

    merged = manifest.get("merged", {})
    if not SHA256_RE.match(str(merged.get("sha256", ""))) or not merged.get("osmiumToolVersion"):
        fail("manifest merged block must carry a sha256 and the osmium-tool version")
    actual_sha256 = sha256_file(pbf_path)
    if actual_sha256 != merged["sha256"]:
        fail(f"merged PBF SHA-256 {actual_sha256} does not match manifest {merged['sha256']!r}")
    print(
        f"OK: {pbf_path} matches areas {','.join(resolved['ids'])} "
        f"bbox {resolved['bbox']!r} (SHA-256 {actual_sha256})"
    )


def command_migrate_manifest_v1(catalog: dict, args: argparse.Namespace) -> None:
    """Convert the pre-catalog Tehran-only manifest to version 2 in place.

    Only the exact previously-pinned Iran snapshot + Tehran bbox can migrate;
    anything else must be rebuilt so provenance stays honest. The historical
    `iran-latest` URL is accepted only when provider, license, MD5, byte
    count, data date, and data timestamp all prove it recorded that snapshot.
    """
    try:
        old = json.loads(Path(args.input).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read v1 manifest {args.input}: {error}")
    if not isinstance(old, dict):
        fail("v1 manifest must be a JSON object; rebuild instead")
    if old.get("region") != "tehran":
        fail("v1 migration supports only the Tehran dataset; rebuild anything else")
    index = area_index(catalog)
    tehran = index["ir-tehran"]
    pinned = catalog["sources"]["iran"]
    snapshot = catalog["snapshot"]
    source = old.get("source")
    crop = old.get("crop")
    if not isinstance(source, dict) or not isinstance(crop, dict):
        fail("v1 manifest source/crop blocks are missing or invalid; rebuild instead")
    try:
        source_bytes = int(source.get("bytes"))
    except (TypeError, ValueError):
        source_bytes = None
    source_matches_pinned_snapshot = (
        source.get("provider") == snapshot["provider"]
        and source.get("license") == snapshot["license"]
        and source.get("url") in {pinned["url"], LEGACY_IRAN_LATEST_URL}
        and source.get("md5") == pinned["md5"]
        and source.get("dataDate") == snapshot["dataDate"]
        and source.get("dataTimestamp") == snapshot["dataTimestamp"]
        and source_bytes == pinned.get("bytes")
        and SHA256_RE.match(str(source.get("sha256", ""))) is not None
    )
    if not source_matches_pinned_snapshot:
        fail("v1 manifest source does not match the pinned catalog Iran snapshot; rebuild instead")
    try:
        crop_bbox = [float(value) for value in crop.get("bbox", [])]
    except (TypeError, ValueError):
        crop_bbox = []
    if crop_bbox != tehran["bbox"] or crop.get("strategy") != "smart":
        fail("v1 manifest crop does not match the catalog Tehran bbox; rebuild instead")
    pbf_path = Path(args.pbf)
    if not pbf_path.is_file() or pbf_path.stat().st_size == 0:
        fail(f"dataset PBF is missing or empty: {pbf_path}; rebuild instead")
    actual_sha256 = sha256_file(pbf_path)
    if actual_sha256 != crop.get("sha256"):
        fail("dataset PBF does not match the v1 manifest crop SHA-256; rebuild instead")
    manifest = {
        "version": 2,
        "dataset": args.dataset,
        "areas": ["ir-tehran"],
        "bbox": tehran["bbox"],
        "sources": [{
            "id": "iran",
            "provider": snapshot["provider"],
            "url": pinned["url"],
            "dataDate": snapshot["dataDate"],
            "dataTimestamp": snapshot["dataTimestamp"],
            "file": pinned["url"].rsplit("/", 1)[-1],
            "bytes": source_bytes,
            "md5": pinned["md5"],
            "sha256": source["sha256"],
            "license": snapshot["license"],
        }],
        "crops": [{
            "area": "ir-tehran",
            "file": str(pbf_path.resolve()),
            "bbox": tehran["bbox"],
            "strategy": "smart",
            "sha256": crop["sha256"],
        }],
        "merged": {
            "file": str(pbf_path.resolve()),
            "sha256": actual_sha256,
            "osmiumToolVersion": crop.get("osmiumToolVersion", "unknown"),
        },
        "attribution": "© OpenStreetMap contributors",
        "attributionUrl": "https://www.openstreetmap.org/copyright",
    }
    if source["url"] != pinned["url"]:
        manifest["sources"][0]["migratedFromUrl"] = source["url"]
    output = Path(args.output)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"Migrated v1 Tehran manifest to version 2: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH, help="catalog path (default: map-server/regions.json)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate-catalog")
    subparsers.add_parser("list")
    subparsers.add_parser("menu-countries")
    menu_areas = subparsers.add_parser("menu-areas")
    menu_areas.add_argument("country")

    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("selection")
    resolve.add_argument("--json", action="store_true")

    sources = subparsers.add_parser("sources")
    sources.add_argument("selection")
    areas = subparsers.add_parser("areas")
    areas.add_argument("selection")

    verify_point = subparsers.add_parser("verify-point")
    verify_point.add_argument("area")

    write_crop_meta = subparsers.add_parser("write-crop-meta")
    write_crop_meta.add_argument("--meta", required=True)
    write_crop_meta.add_argument("--crop", required=True)
    write_crop_meta.add_argument("--area", required=True)
    write_crop_meta.add_argument("--source-sha256", required=True)
    write_crop_meta.add_argument("--osmium-version", required=True)

    verify_crop = subparsers.add_parser("verify-crop")
    verify_crop.add_argument("--meta", required=True)
    verify_crop.add_argument("--crop", required=True)
    verify_crop.add_argument("--area", required=True)
    verify_crop.add_argument("--source-sha256", required=True)

    write_manifest = subparsers.add_parser("write-manifest")
    write_manifest.add_argument("--data-dir", required=True)
    write_manifest.add_argument("--dataset", required=True)
    write_manifest.add_argument("--selection", required=True)
    write_manifest.add_argument("--merged", required=True)
    write_manifest.add_argument("--osmium-version", required=True)

    verify_manifest = subparsers.add_parser("verify-manifest")
    verify_manifest.add_argument("--manifest", required=True)
    verify_manifest.add_argument("--pbf", required=True)
    verify_manifest.add_argument("--selection", required=True)
    verify_manifest.add_argument("--bbox")

    migrate = subparsers.add_parser("migrate-manifest-v1")
    migrate.add_argument("--input", required=True)
    migrate.add_argument("--output", required=True)
    migrate.add_argument("--pbf", required=True)
    migrate.add_argument("--dataset", default="borobiya")

    args = parser.parse_args()
    catalog = load_catalog(args.catalog)
    handlers = {
        "validate-catalog": command_validate_catalog,
        "list": command_list,
        "menu-countries": command_menu_countries,
        "menu-areas": command_menu_areas,
        "resolve": command_resolve,
        "sources": command_sources,
        "areas": command_areas,
        "verify-point": command_verify_point,
        "write-crop-meta": command_write_crop_meta,
        "verify-crop": command_verify_crop,
        "write-manifest": command_write_manifest,
        "verify-manifest": command_verify_manifest,
        "migrate-manifest-v1": command_migrate_manifest_v1,
    }
    handlers[args.command](catalog, args)


if __name__ == "__main__":
    main()
