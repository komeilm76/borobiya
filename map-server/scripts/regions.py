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
import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

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
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SNAPSHOT_TOKEN_RE = re.compile(r"-\d{6}\.osm\.pbf$")
SOURCE_POLICIES = ("cache-first", "refresh", "offline")
CONTINENTS = {
    "africa",
    "antarctica",
    "asia",
    "europe",
    "north-america",
    "oceania",
    "south-america",
}


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
    ):
        return "must be [west, south, east, north] finite numbers"
    try:
        west, south, east, north = (float(value) for value in bbox)
    except (OverflowError, ValueError):
        return "must be [west, south, east, north] finite numbers"
    if not all(math.isfinite(value) for value in (west, south, east, north)):
        return "must be [west, south, east, north] finite numbers"
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



def catalog_snapshot_date(catalog: dict) -> date:
    raw = catalog.get("snapshot", {}).get("dataDate")
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        fail(f"catalog snapshot.dataDate must be YYYY-MM-DD, got {raw!r}")


def parse_snapshot_date(value: object, label: str = "snapshot date") -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if not DATE_RE.match(text):
        fail(f"{label} must use YYYY-MM-DD, got {value!r}")
    try:
        return date.fromisoformat(text)
    except ValueError:
        fail(f"{label} is not a valid calendar date: {value!r}")


def parse_snapshot_spec(spec: object, catalog: dict) -> tuple[str, date | None]:
    """Return (mode, concrete date) for pinned/latest/YYYY-MM-DD specs."""
    normalized = str(spec or "pinned").strip().lower()
    if normalized == "pinned":
        return "pinned", catalog_snapshot_date(catalog)
    if normalized == "latest":
        return "latest", None
    return "date", parse_snapshot_date(normalized, "snapshot")


def validate_source_policy(policy: object) -> str:
    normalized = str(policy or "cache-first").strip().lower()
    if normalized not in SOURCE_POLICIES:
        fail(
            "source policy must be one of "
            + ", ".join(SOURCE_POLICIES)
            + f"; got {policy!r}"
        )
    return normalized


def dated_source_url(url: str, snapshot_date: date) -> str:
    token = snapshot_date.strftime("%y%m%d")
    updated, replacements = SNAPSHOT_TOKEN_RE.subn(f"-{token}.osm.pbf", url)
    if replacements != 1:
        fail(f"catalog source URL does not end with a dated Geofabrik token: {url}")
    return updated


def fetch_text(url: str) -> str | None:
    """Fetch a tiny text resource (an MD5 sidecar); return None on failure."""
    request = Request(url, headers={"User-Agent": "Borobiya-Map-Library/1.0"})
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - pinned HTTPS host
            return response.read().decode("utf-8")
    except (URLError, TimeoutError, UnicodeDecodeError, ValueError):
        return None


def parse_md5_sidecar(text: str | None, expected_filename: str) -> str | None:
    if not text:
        return None
    fields = text.strip().split()
    if len(fields) < 2:
        return None
    checksum = fields[0].lower()
    filename = fields[1].lstrip("*")
    if filename != expected_filename or not MD5_RE.match(checksum):
        return None
    return checksum


def fetch_source_md5(url: str, fetcher=fetch_text) -> str | None:
    filename = url.rsplit("/", 1)[-1]
    return parse_md5_sidecar(fetcher(f"{url}.md5"), filename)


def source_country_index(catalog: dict) -> dict[str, dict]:
    """Map every source ID to the one catalog country that owns it."""
    result: dict[str, dict] = {}
    for country in catalog.get("countries", []):
        if not isinstance(country, dict):
            continue
        source_ids = {country.get("source")}
        for city in country.get("cities", []):
            if isinstance(city, dict):
                source_ids.add(city.get("source", country.get("source")))
        for source_id in source_ids:
            if not source_id:
                continue
            existing = result.get(str(source_id))
            if existing is not None and existing.get("id") != country.get("id"):
                fail(f"source {source_id!r} is assigned to multiple countries")
            result[str(source_id)] = country
    return result


def resolve_library_root(library_root: object) -> Path:
    """Resolve an external library path and forbid project-local map storage."""
    root = Path(str(library_root)).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    root = root.resolve()
    if root == Path(root.anchor):
        fail(f"map library root must not be a filesystem root: {root}")
    repository_root = SCRIPT_DIR.parent.parent.resolve()
    try:
        root.relative_to(repository_root)
    except ValueError:
        return root
    fail(f"map library must be outside the repository checkout: {root}")


def library_path(library_root: object, relative_path: object) -> Path:
    """Return a standardized library path without traversing internal symlinks."""
    root = resolve_library_root(library_root)
    relative = Path(str(relative_path))
    if relative.is_absolute() or ".." in relative.parts:
        fail(f"unsafe map library relative path: {relative_path!r}")
    current = root
    for part in relative.parts:
        if part in ("", "."):
            continue
        current = current / part
        if current.is_symlink():
            fail(f"refusing to use a symlink inside the map library: {current}")
    return current


def library_member_path(library_root: object, path: object) -> Path:
    """Validate an absolute candidate against the library without symlink traversal."""
    root = resolve_library_root(library_root)
    candidate = Path(os.path.abspath(Path(path).expanduser()))
    try:
        relative = candidate.relative_to(root)
    except ValueError:
        fail(f"map library path is outside the library root: {candidate}")
    return library_path(root, relative)


def source_relative_path(catalog: dict, source_id: str, snapshot_date: date) -> Path:
    country = source_country_index(catalog).get(source_id)
    if country is None:
        fail(f"source {source_id!r} is not assigned to a catalog country")
    filename = dated_source_url(catalog["sources"][source_id]["url"], snapshot_date).rsplit("/", 1)[-1]
    return (
        Path("sources")
        / str(country["continent"])
        / str(country["id"])
        / source_id
        / snapshot_date.isoformat()
        / filename
    )


def crop_relative_path(area: dict, snapshot_date: date) -> Path:
    if area.get("kind") != "city":
        fail(f"crop path requires a city area, got {area.get('id')!r}")
    return (
        Path("crops")
        / str(area["continent"])
        / str(area["countryId"])
        / str(area["cityId"])
        / snapshot_date.isoformat()
        / f"{area['id']}.osm.pbf"
    )


def dataset_fingerprint(snapshot_date: date, area_ids: list[str]) -> str:
    payload = json.dumps(
        {"snapshotDate": snapshot_date.isoformat(), "areas": area_ids},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def dataset_relative_path(snapshot_date: date, area_ids: list[str]) -> Path:
    return Path("datasets") / snapshot_date.isoformat() / dataset_fingerprint(snapshot_date, area_ids)


def library_paths(
    library_root: object,
    snapshot_date: date,
    area_ids: list[str],
    dataset: str = "borobiya",
) -> dict[str, Path]:
    root = resolve_library_root(library_root)
    dataset_relative = dataset_relative_path(snapshot_date, area_ids)
    dataset_dir = library_path(root, dataset_relative)
    return {
        "libraryDir": root,
        "datasetDir": dataset_dir,
        "dataDir": dataset_dir,
        "pbf": library_path(root, dataset_relative / f"{dataset}.osm.pbf"),
        "manifest": library_path(root, dataset_relative / f"{dataset}.source.json"),
        "pmtiles": library_path(root, dataset_relative / f"{dataset}.pmtiles"),
        "tilesMetadata": library_path(root, dataset_relative / f"{dataset}.metadata.json"),
        "osrmDataDir": library_path(root, dataset_relative / "routing"),
        "photonDataDir": library_path(root, dataset_relative / "geocoding"),
        "photonStamp": library_path(
            root, dataset_relative / "geocoding" / ".borobiya-pbf.sha256"
        ),
    }


def source_metadata_path(target: Path) -> Path:
    return target.with_name("source.json")


def source_sidecar_path(target: Path) -> Path:
    return Path(f"{target}.md5")


def read_json_object(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def read_source_metadata(target: Path, library_root: object | None = None) -> dict:
    path = source_metadata_path(target)
    if library_root is not None:
        path = library_member_path(library_root, path)
    return read_json_object(path)


def write_json_atomically(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        # NamedTemporaryFile uses mode 0600; restore normal umask-governed
        # data-file permissions before atomically replacing the destination.
        mask = os.umask(0)
        os.umask(mask)
        os.chmod(temporary, 0o666 & ~mask)
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def effective_source(
    catalog: dict,
    source_id: str,
    snapshot_date: date,
    library_root: object | None = None,
    policy: str = "cache-first",
    fetcher=fetch_text,
) -> dict:
    """Resolve one source for a concrete snapshot date.

    The repository-pinned date always uses the catalog MD5. Other dates use
    trusted library metadata/sidecars first (except in refresh mode) and then
    Geofabrik's official sidecar. In offline mode an unknown MD5 remains
    None so the caller can fail without touching the network.
    """
    policy = validate_source_policy(policy)
    pinned = catalog["sources"][source_id]
    pinned_date = catalog_snapshot_date(catalog)
    url = dated_source_url(pinned["url"], snapshot_date)
    filename = url.rsplit("/", 1)[-1]
    relative = source_relative_path(catalog, source_id, snapshot_date)
    target = None
    metadata_path = None
    sidecar_path = None
    if library_root is not None:
        target = library_path(library_root, relative)
        metadata_path = library_member_path(
            library_root, source_metadata_path(target)
        )
        sidecar_path = library_member_path(
            library_root, source_sidecar_path(target)
        )

    md5: str | None = None
    byte_count: int | None = None
    if snapshot_date == pinned_date:
        md5 = str(pinned["md5"]).lower()
        byte_count = pinned.get("bytes")
    else:
        metadata = read_json_object(metadata_path) if metadata_path is not None else {}
        if policy != "refresh" and metadata.get("url") == url:
            candidate = str(metadata.get("md5", "")).lower()
            if MD5_RE.match(candidate):
                md5 = candidate
                candidate_bytes = metadata.get("bytes")
                if (
                    isinstance(candidate_bytes, int)
                    and not isinstance(candidate_bytes, bool)
                    and candidate_bytes > 0
                ):
                    byte_count = candidate_bytes
        if md5 is None and policy != "refresh" and sidecar_path is not None:
            if sidecar_path.is_file():
                md5 = parse_md5_sidecar(
                    sidecar_path.read_text(encoding="utf-8"), filename
                )
        if md5 is None and policy != "offline":
            md5 = fetch_source_md5(url, fetcher)
            if md5 is None:
                fail(
                    f"snapshot {snapshot_date.isoformat()} is unavailable for source "
                    f"{source_id}: official MD5 sidecar not found at {url}.md5"
                )

    country = source_country_index(catalog)[source_id]
    return {
        "id": source_id,
        "url": url,
        "file": filename,
        "md5": md5,
        "bytes": byte_count,
        "approxSizeMb": pinned.get("approxSizeMb"),
        "continent": country["continent"],
        "countryId": country["id"],
        "relativePath": relative,
        "path": target,
        "snapshotDate": snapshot_date,
    }


def effective_sources(
    catalog: dict,
    source_ids: list[str],
    snapshot_date: date,
    library_root: object | None = None,
    policy: str = "cache-first",
    fetcher=fetch_text,
) -> list[dict]:
    return [
        effective_source(catalog, source_id, snapshot_date, library_root, policy, fetcher)
        for source_id in source_ids
    ]


def snapshot_date_for_spec(
    catalog: dict,
    spec: object,
    source_ids: list[str],
    policy: str = "cache-first",
    fetcher=fetch_text,
    today: date | None = None,
) -> tuple[str, date]:
    mode, requested = parse_snapshot_spec(spec, catalog)
    current_day = today or datetime.now(timezone.utc).date()
    if mode == "pinned":
        return mode, catalog_snapshot_date(catalog)
    if mode == "date":
        assert requested is not None
        if requested > current_day:
            fail(f"snapshot date {requested.isoformat()} is in the future")
        return mode, requested

    policy = validate_source_policy(policy)
    if policy == "offline":
        fail("snapshot 'latest' requires an online check; choose pinned or a specific date in offline mode")
    for offset in range(32):
        candidate = current_day - timedelta(days=offset)
        available = True
        for source_id in source_ids:
            url = dated_source_url(catalog["sources"][source_id]["url"], candidate)
            if fetch_source_md5(url, fetcher) is None:
                available = False
                break
        if available:
            return mode, candidate
    fail("could not find a common Geofabrik snapshot for all selected sources in the last 32 days")


def write_source_metadata(
    catalog: dict,
    library_root: object,
    source_id: str,
    snapshot_date: date,
    *,
    md5: str | None = None,
    sha256: str | None = None,
    data_timestamp: str | None = None,
) -> dict:
    descriptor = effective_source(
        catalog, source_id, snapshot_date, library_root, policy="offline"
    )
    target = descriptor["path"]
    assert target is not None
    if not target.is_file() or target.stat().st_size == 0:
        fail(f"source PBF is missing or empty: {target}")
    actual_md5 = (md5 or md5_file(target)).lower()
    if not MD5_RE.match(actual_md5):
        fail(f"invalid MD5 for source {source_id}: {actual_md5!r}")
    expected_md5 = descriptor.get("md5")
    if expected_md5 and actual_md5 != expected_md5:
        fail(
            f"source {source_id} MD5 mismatch: expected {expected_md5}, got {actual_md5}"
        )
    actual_sha256 = (sha256 or sha256_file(target)).lower()
    if not SHA256_RE.match(actual_sha256):
        fail(f"invalid SHA-256 for source {source_id}: {actual_sha256!r}")
    existing = read_source_metadata(target, library_root)
    timestamp = data_timestamp or existing.get("dataTimestamp")
    if timestamp is None and snapshot_date == catalog_snapshot_date(catalog):
        timestamp = catalog["snapshot"].get("dataTimestamp")
    metadata = {
        "version": 1,
        "id": source_id,
        "provider": catalog["snapshot"]["provider"],
        "license": catalog["snapshot"]["license"],
        "continent": descriptor["continent"],
        "countryId": descriptor["countryId"],
        "snapshotDate": snapshot_date.isoformat(),
        "dataTimestamp": timestamp,
        "url": descriptor["url"],
        "file": descriptor["file"],
        "bytes": target.stat().st_size,
        "md5": actual_md5,
        "sha256": actual_sha256,
        "libraryRelativePath": descriptor["relativePath"].as_posix(),
    }
    metadata_path = library_member_path(
        library_root, source_metadata_path(target)
    )
    write_json_atomically(metadata_path, metadata)
    return metadata


def validate_catalog(catalog: dict) -> list[str]:
    problems: list[str] = []
    if catalog.get("version") != 1:
        problems.append("catalog version must be 1")
    snapshot = catalog.get("snapshot")
    if not isinstance(snapshot, dict) or snapshot.get("provider") != "Geofabrik" or snapshot.get("license") != "ODbL-1.0":
        problems.append("snapshot must identify Geofabrik and the ODbL-1.0 license")
    snapshot_date: date | None = None
    if isinstance(snapshot, dict):
        try:
            snapshot_date = date.fromisoformat(str(snapshot.get("dataDate")))
        except ValueError:
            problems.append("snapshot.dataDate must be a valid YYYY-MM-DD date")

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
        if snapshot_date is not None and not str(url).endswith(
            f"-{snapshot_date.strftime('%y%m%d')}.osm.pbf"
        ):
            problems.append(f"source {source_id!r} url must use the pinned snapshot date token")
        size = source.get("bytes")
        if size is not None and (isinstance(size, bool) or not isinstance(size, int) or size <= 0):
            problems.append(f"source {source_id!r} bytes must be null or a positive integer")

    countries = catalog.get("countries")
    if not isinstance(countries, list) or not countries:
        problems.append("countries must be a non-empty list")
        countries = []
    seen_areas: set[str] = set()
    source_assignments: dict[str, set[str]] = {}
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
        elif isinstance(country.get("source"), str):
            source_assignments.setdefault(country["source"], set()).add(str(country_id))
        if country.get("continent") not in CONTINENTS:
            problems.append(f"{label} continent must be one of: {', '.join(sorted(CONTINENTS))}")
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
            elif isinstance(source_id, str):
                source_assignments.setdefault(source_id, set()).add(str(country_id))
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
    for source_id in sources:
        owners = source_assignments.get(source_id, set())
        if len(owners) != 1:
            problems.append(
                f"source {source_id!r} must be assigned to exactly one country; got {sorted(owners)!r}"
            )
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
            "continent": country["continent"],
            "cityId": None,
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
                "continent": country["continent"],
                "cityId": city["id"],
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
    snapshot_spec = getattr(args, "snapshot", "pinned")
    policy = validate_source_policy(getattr(args, "source_policy", "cache-first"))
    snapshot_mode, snapshot_date = snapshot_date_for_spec(
        catalog,
        snapshot_spec,
        resolved["sourceIds"],
        policy=policy,
    )
    payload = {
        "areas": resolved["ids"],
        "primary": resolved["primary"],
        "bbox": resolved["bbox"],
        "sourceIds": resolved["sourceIds"],
        "languages": resolved["languages"],
        "defaultLanguage": resolved["defaultLanguage"],
        "approxDownloadMb": resolved["approxDownloadMb"],
        "heavy": resolved["heavy"],
        "snapshotMode": snapshot_mode,
        "snapshotDate": snapshot_date.isoformat(),
        "sourcePolicy": policy,
    }
    paths = None
    if getattr(args, "library", None):
        paths = library_paths(
            args.library,
            snapshot_date,
            resolved["ids"],
            dataset=getattr(args, "dataset", "borobiya"),
        )
        payload["library"] = {
            "root": str(paths["libraryDir"]),
            "datasetDir": str(paths["datasetDir"]),
            "datasetRelativePath": dataset_relative_path(snapshot_date, resolved["ids"]).as_posix(),
            "datasetFingerprint": dataset_fingerprint(snapshot_date, resolved["ids"]),
            "pbf": str(paths["pbf"]),
            "manifest": str(paths["manifest"]),
            "pmtiles": str(paths["pmtiles"]),
            "tilesMetadata": str(paths["tilesMetadata"]),
            "osrmDataDir": str(paths["osrmDataDir"]),
            "photonDataDir": str(paths["photonDataDir"]),
            "photonStamp": str(paths["photonStamp"]),
        }
    if getattr(args, "json", False):
        print(json.dumps(payload, ensure_ascii=False))
        return

    pairs: dict[str, object] = {
        "REGION_IDS": ",".join(resolved["ids"]),
        "PRIMARY_AREA": resolved["primary"],
        "UNION_BBOX": format_bbox(resolved["bbox"]),
        "SOURCE_IDS": ",".join(resolved["sourceIds"]),
        "PHOTON_LANGUAGES": ",".join(resolved["languages"]),
        "PHOTON_DEFAULT_LANGUAGE": resolved["defaultLanguage"],
        "APPROX_DOWNLOAD_MB": resolved["approxDownloadMb"],
        "SELECTION_HEAVY": "1" if resolved["heavy"] else "0",
        "SNAPSHOT_MODE": snapshot_mode,
        "SNAPSHOT_DATE": snapshot_date.isoformat(),
        "SOURCE_POLICY": policy,
    }
    if paths is not None:
        pairs.update({
            "MAP_LIBRARY_DIR": paths["libraryDir"],
            "MAP_DATASET_DIR": paths["datasetDir"],
            "MAP_DATA_DIR": paths["dataDir"],
            "MAP_PBF": paths["pbf"],
            "MAP_PBF_MANIFEST": paths["manifest"],
            "MAP_OSRM_DATA_DIR": paths["osrmDataDir"],
            "MAP_PHOTON_DATA_DIR": paths["photonDataDir"],
            "PHOTON_STAMP": paths["photonStamp"],
            "DATASET_FINGERPRINT": dataset_fingerprint(snapshot_date, resolved["ids"]),
        })
    emit_shell(pairs)


def command_sources(catalog: dict, args: argparse.Namespace) -> None:
    resolved = resolve_selection(catalog, args.selection)
    policy = validate_source_policy(getattr(args, "source_policy", "cache-first"))
    _mode, snapshot_date = snapshot_date_for_spec(
        catalog,
        getattr(args, "snapshot", "pinned"),
        resolved["sourceIds"],
        policy=policy,
    )
    descriptors = effective_sources(
        catalog,
        resolved["sourceIds"],
        snapshot_date,
        getattr(args, "library", None),
        policy,
    )
    for descriptor in descriptors:
        target = descriptor["path"]
        print(
            f"{descriptor['id']}\t{descriptor['url']}\t{descriptor['file']}\t"
            # Use a non-empty marker for optional columns. Bash treats tab as
            # IFS whitespace and would collapse adjacent empty fields, shifting
            # every later value in prepare-regions-pbf.sh's `read` loop.
            f"{descriptor['md5'] or '-'}\t"
            f"{descriptor['bytes'] if descriptor['bytes'] is not None else '-'}\t"
            f"{descriptor['approxSizeMb'] if descriptor['approxSizeMb'] is not None else '-'}\t"
            f"{descriptor['continent']}\t{descriptor['countryId']}\t"
            f"{descriptor['relativePath'].as_posix()}\t"
            f"{target if target is not None else '-'}\t{snapshot_date.isoformat()}"
        )


def command_areas(catalog: dict, args: argparse.Namespace) -> None:
    resolved = resolve_selection(catalog, args.selection)
    policy = validate_source_policy(getattr(args, "source_policy", "cache-first"))
    _mode, snapshot_date = snapshot_date_for_spec(
        catalog,
        getattr(args, "snapshot", "pinned"),
        resolved["sourceIds"],
        policy=policy,
    )
    library_root = None
    if getattr(args, "library", None):
        library_root = library_paths(args.library, snapshot_date, resolved["ids"])["libraryDir"]
    for area in resolved["areas"]:
        bbox = "ALL" if area["kind"] == "country" else format_bbox(area["bbox"])
        if area["kind"] == "city":
            relative = crop_relative_path(area, snapshot_date)
            crop_path = library_path(library_root, relative) if library_root is not None else ""
        else:
            relative = Path()
            crop_path = ""
        print(
            f"{area['id']}\t{area['countryId']}\t{area['source']}\t{bbox}\t{area['name']}\t"
            f"{area['continent']}\t{area['cityId'] or ''}\t"
            f"{relative.as_posix() if str(relative) != '.' else ''}\t{crop_path}"
        )


def command_pinned_snapshot(catalog: dict, _args: argparse.Namespace) -> None:
    print(catalog_snapshot_date(catalog).isoformat())


def command_manifest_library_ready(catalog: dict, args: argparse.Namespace) -> None:
    """Check that every source/crop in a v3 manifest exists and still hashes correctly."""
    manifest = read_json_object(Path(args.manifest))
    if manifest.get("version") != 3:
        raise SystemExit(1)
    root = resolve_library_root(args.library)
    index = area_index(catalog)
    checked = 0
    sha256_cache: dict[Path, str] = {}
    md5_cache: dict[Path, str] = {}

    def verify_library_file(relative_value: object, expected_sha: object, label: str) -> Path:
        if not isinstance(relative_value, str) or not relative_value:
            fail(f"{label} has no library-relative path")
        relative = Path(relative_value)
        if relative.is_absolute() or ".." in relative.parts:
            fail(f"{label} has an unsafe library-relative path: {relative_value!r}")
        path = library_path(root, relative).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            fail(f"{label} resolves outside the map library: {relative_value!r}")
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"map library is incomplete; missing {relative_value}")
        if not SHA256_RE.match(str(expected_sha or "")):
            fail(f"{label} has an invalid expected SHA-256")
        actual_sha = sha256_cache.get(path)
        if actual_sha is None:
            actual_sha = sha256_file(path)
            sha256_cache[path] = actual_sha
        if actual_sha != expected_sha:
            fail(f"map library file {relative_value} SHA-256 mismatch: expected {expected_sha}, got {actual_sha}")
        return path

    sources = manifest.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("version-3 manifest sources must be a non-empty list")
    source_entries_by_id: dict[str, dict] = {}
    for entry in sources:
        if not isinstance(entry, dict):
            fail("every version-3 manifest source entry must be an object")
        source_id = entry.get("id")
        if not isinstance(source_id, str) or source_id not in catalog.get("sources", {}):
            fail(f"manifest source has an unknown or invalid id: {source_id!r}")
        if source_id in source_entries_by_id:
            fail(f"manifest contains duplicate source entry {source_id!r}")
        source_entries_by_id[source_id] = entry
        label = f"manifest source {source_id!r}"
        source_path = verify_library_file(
            entry.get("libraryRelativePath"), entry.get("sha256"), label
        )
        expected_md5 = entry.get("md5")
        if not MD5_RE.match(str(expected_md5 or "")):
            fail(f"{label} has an invalid expected MD5")
        actual_md5 = md5_cache.get(source_path)
        if actual_md5 is None:
            actual_md5 = md5_file(source_path)
            md5_cache[source_path] = actual_md5
        if actual_md5 != expected_md5:
            fail(f"map library source {source_id} MD5 mismatch: expected {expected_md5}, got {actual_md5}")
        expected_bytes = entry.get("bytes")
        if (
            not isinstance(expected_bytes, int)
            or isinstance(expected_bytes, bool)
            or source_path.stat().st_size != expected_bytes
        ):
            fail(f"map library source {source_id} byte count does not match its manifest")
        metadata_path = library_path(
            root, source_metadata_path(source_path).relative_to(root)
        )
        metadata = read_json_object(metadata_path)
        metadata_expectations = {
            "version": 1,
            "id": source_id,
            "provider": entry.get("provider"),
            "license": entry.get("license"),
            "snapshotDate": entry.get("dataDate"),
            "url": entry.get("url"),
            "file": entry.get("file"),
            "bytes": expected_bytes,
            "md5": expected_md5,
            "sha256": entry.get("sha256"),
            "libraryRelativePath": entry.get("libraryRelativePath"),
        }
        if any(metadata.get(key) != value for key, value in metadata_expectations.items()):
            fail(f"map library source metadata is missing or inconsistent for {source_id}")
        checked += 1

    crops = manifest.get("crops")
    if not isinstance(crops, list) or not crops:
        fail("version-3 manifest crops must be a non-empty list")
    seen_areas: set[str] = set()
    snapshot = manifest.get("snapshot")
    snapshot_date = snapshot.get("date") if isinstance(snapshot, dict) else None
    for entry in crops:
        if not isinstance(entry, dict):
            fail("every version-3 manifest crop entry must be an object")
        area_id = entry.get("area")
        if not isinstance(area_id, str) or area_id not in index:
            fail(f"manifest crop has an unknown or invalid area: {area_id!r}")
        if area_id in seen_areas:
            fail(f"manifest contains duplicate crop entry {area_id!r}")
        seen_areas.add(area_id)
        area = index[area_id]
        label = f"manifest crop {area_id!r}"
        crop_path = verify_library_file(
            entry.get("libraryRelativePath"), entry.get("sha256"), label
        )
        if area["kind"] == "city":
            source_entry = source_entries_by_id.get(area["source"])
            if source_entry is None:
                fail(f"{label} has no matching manifest source")
            crop_metadata_path = library_path(
                root,
                crop_path.with_name(f"{area_id}.source.json").relative_to(root),
            )
            crop_metadata = read_json_object(crop_metadata_path)
            metadata_bbox = crop_metadata.get("bbox")
            if (
                crop_metadata.get("area") != area_id
                or crop_metadata.get("source") != area["source"]
                or crop_metadata.get("sourceSha256") != source_entry.get("sha256")
                or bbox_problem(metadata_bbox)
                or [float(value) for value in metadata_bbox] != area["bbox"]
                or crop_metadata.get("strategy") != "smart"
                or crop_metadata.get("snapshotDate") != snapshot_date
                or crop_metadata.get("sha256") != entry.get("sha256")
                or crop_metadata.get("libraryRelativePath") != entry.get("libraryRelativePath")
                or not isinstance(crop_metadata.get("osmiumToolVersion"), str)
                or not crop_metadata["osmiumToolVersion"]
                or (
                    getattr(args, "osmium_version", None) is not None
                    and crop_metadata["osmiumToolVersion"] != args.osmium_version
                )
            ):
                fail(f"map library crop metadata is missing or inconsistent for {area_id}")
        elif entry.get("strategy") != "whole-source":
            fail(f"{label} must identify a whole-source input")
        checked += 1

    print(f"OK: map library contains all {checked} verified source/crop inputs for {args.manifest}")


def command_manifest_summary(catalog: dict, args: argparse.Namespace) -> None:
    manifest = read_json_object(Path(args.manifest))
    if not manifest:
        fail(f"invalid or missing manifest: {args.manifest}")
    version = manifest.get("version")
    if version in (2, 3):
        areas = manifest.get("areas")
        snapshot = manifest.get("snapshot", {}) if isinstance(manifest.get("snapshot"), dict) else {}
        snapshot_date = snapshot.get("date")
        if not snapshot_date:
            sources = manifest.get("sources", [])
            if sources and isinstance(sources[0], dict):
                snapshot_date = sources[0].get("dataDate")
    elif manifest.get("region") == "tehran":
        version = 1
        areas = ["ir-tehran"]
        source = manifest.get("source", {}) if isinstance(manifest.get("source"), dict) else {}
        snapshot_date = source.get("dataDate")
    else:
        fail(f"unsupported manifest format: {args.manifest}")
    if not isinstance(areas, list) or not areas:
        fail(f"manifest has no areas: {args.manifest}")
    emit_shell({
        "MANIFEST_VERSION": version,
        "MANIFEST_REGION_IDS": ",".join(str(area) for area in areas),
        "MANIFEST_SNAPSHOT_DATE": snapshot_date or "",
    })


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


def source_file(
    library_root: object | None,
    catalog: dict,
    source_id: str,
    snapshot_date: date,
) -> Path:
    relative = source_relative_path(catalog, source_id, snapshot_date)
    if library_root is None:
        return relative
    return library_path(library_root, relative)


def write_crop_metadata(
    catalog: dict,
    meta_path: Path,
    crop_path: Path,
    area_id: str,
    source_sha256: str,
    osmium_version: str,
    snapshot_date: date | None = None,
    library_root: object | None = None,
) -> dict:
    index = area_index(catalog)
    area = index.get(area_id.lower())
    if area is None or area["kind"] != "city":
        fail(f"crop metadata requires a city area id, got {area_id!r}")
    library_relative: Path | None = None
    if library_root is not None:
        root = resolve_library_root(library_root)
        crop_candidate = Path(os.path.abspath(crop_path.expanduser()))
        try:
            library_relative = crop_candidate.relative_to(root)
        except ValueError:
            fail(f"crop PBF is outside the map library: {crop_candidate}")
        crop_path = library_path(root, library_relative)
        if snapshot_date is not None and library_relative != crop_relative_path(area, snapshot_date):
            fail(f"crop PBF path does not match the standardized library layout: {crop_path}")
        expected_meta_path = crop_path.with_name(f"{area['id']}.source.json")
        meta_candidate = Path(os.path.abspath(meta_path.expanduser()))
        if meta_candidate != expected_meta_path:
            fail(f"crop metadata path does not match the crop library location: {meta_candidate}")
        meta_path = library_path(
            root, expected_meta_path.relative_to(root)
        )
    if not crop_path.is_file() or crop_path.stat().st_size == 0:
        fail(f"crop PBF is missing or empty: {crop_path}")
    if not SHA256_RE.match(source_sha256):
        fail("--source-sha256 must be 64 lowercase hex characters")
    meta = {
        "area": area["id"],
        "source": area["source"],
        "sourceSha256": source_sha256,
        "bbox": area["bbox"],
        "strategy": "smart",
        "osmiumToolVersion": osmium_version,
        "sha256": sha256_file(crop_path),
    }
    if snapshot_date is not None:
        meta["snapshotDate"] = snapshot_date.isoformat()
    if library_relative is not None:
        meta["libraryRelativePath"] = library_relative.as_posix()
    write_json_atomically(meta_path, meta)
    return meta


def command_write_crop_meta(catalog: dict, args: argparse.Namespace) -> None:
    snapshot_date = (
        parse_snapshot_date(args.snapshot_date, "--snapshot-date")
        if getattr(args, "snapshot_date", None)
        else None
    )
    write_crop_metadata(
        catalog,
        Path(args.meta),
        Path(args.crop),
        args.area,
        args.source_sha256,
        args.osmium_version,
        snapshot_date,
        getattr(args, "library", None),
    )
    print(f"Wrote crop metadata: {args.meta}")


def command_verify_crop(catalog: dict, args: argparse.Namespace) -> None:
    """Exit 0 only when an existing crop provably matches the catalog + source."""
    index = area_index(catalog)
    area = index.get(args.area.lower())
    if area is None or area["kind"] != "city":
        fail(f"crop verification requires a city area id, got {args.area!r}")
    crop_path = Path(args.crop).expanduser()
    meta_path = Path(args.meta).expanduser()
    snapshot_arg = getattr(args, "snapshot_date", None)
    if getattr(args, "library", None):
        library_root = resolve_library_root(args.library)
        crop_snapshot = (
            parse_snapshot_date(snapshot_arg, "--snapshot-date")
            if snapshot_arg
            else catalog_snapshot_date(catalog)
        )
        expected_crop = library_path(
            library_root, crop_relative_path(area, crop_snapshot)
        )
        crop_candidate = Path(os.path.abspath(crop_path))
        if crop_candidate != expected_crop:
            raise SystemExit(1)
        expected_meta = expected_crop.with_name(f"{area['id']}.source.json")
        meta_candidate = Path(os.path.abspath(meta_path))
        if meta_candidate != expected_meta:
            raise SystemExit(1)
        crop_path = expected_crop
        meta_path = library_path(
            library_root, expected_meta.relative_to(library_root)
        )
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise SystemExit(1)
    if not isinstance(meta, dict):
        raise SystemExit(1)
    if not crop_path.is_file() or crop_path.stat().st_size == 0:
        raise SystemExit(1)
    if snapshot_arg:
        expected_snapshot = parse_snapshot_date(snapshot_arg, "--snapshot-date").isoformat()
        meta_snapshot = meta.get("snapshotDate")
        legacy_pinned_meta = (
            meta_snapshot is None
            and expected_snapshot == catalog_snapshot_date(catalog).isoformat()
        )
        if meta_snapshot != expected_snapshot and not legacy_pinned_meta:
            raise SystemExit(1)
    metadata_bbox = meta.get("bbox")
    if bbox_problem(metadata_bbox):
        raise SystemExit(1)
    metadata_osmium = meta.get("osmiumToolVersion")
    expected_osmium = getattr(args, "osmium_version", None)
    if (
        meta.get("area") != area["id"]
        or meta.get("source") != area["source"]
        or meta.get("sourceSha256") != args.source_sha256
        or meta.get("strategy") != "smart"
        or [float(value) for value in metadata_bbox] != area["bbox"]
        or not isinstance(metadata_osmium, str)
        or not metadata_osmium
        or (expected_osmium is not None and metadata_osmium != expected_osmium)
        or meta.get("sha256") != sha256_file(crop_path)
    ):
        raise SystemExit(1)
    print(f"OK: reusing verified crop for {area['id']}")


def command_write_source_meta(catalog: dict, args: argparse.Namespace) -> None:
    snapshot_date = parse_snapshot_date(args.snapshot_date, "--snapshot-date")
    metadata = write_source_metadata(
        catalog,
        args.library,
        args.source,
        snapshot_date,
        md5=getattr(args, "md5", None),
        sha256=getattr(args, "sha256", None),
        data_timestamp=getattr(args, "data_timestamp", None),
    )
    target = source_file(args.library, catalog, args.source, snapshot_date)
    print(f"Wrote source metadata: {source_metadata_path(target)} ({metadata['sha256']})")


def command_write_manifest(catalog: dict, args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir).resolve()
    merged = Path(args.merged).resolve()
    if not merged.is_file() or merged.stat().st_size == 0:
        fail(f"merged PBF is missing or empty: {merged}")
    resolved = resolve_selection(catalog, args.selection)
    snapshot = catalog["snapshot"]
    snapshot_spec = getattr(args, "snapshot", "pinned")
    policy = validate_source_policy(getattr(args, "source_policy", "cache-first"))
    if getattr(args, "snapshot_date", None):
        snapshot_date = parse_snapshot_date(args.snapshot_date, "--snapshot-date")
        snapshot_mode, _requested = parse_snapshot_spec(snapshot_spec, catalog)
    else:
        snapshot_mode, snapshot_date = snapshot_date_for_spec(
            catalog, snapshot_spec, resolved["sourceIds"], policy=policy
        )

    library_arg = getattr(args, "library", None)
    if library_arg:
        paths = library_paths(library_arg, snapshot_date, resolved["ids"], args.dataset)
        library_root = paths["libraryDir"]
    elif len(data_dir.parts) >= 3 and data_dir.parts[-3] == "datasets":
        library_root = data_dir.parents[2]
        paths = library_paths(library_root, snapshot_date, resolved["ids"], args.dataset)
    else:
        fail("--library is required when --data-dir is not a library dataset directory")
    if data_dir != paths["datasetDir"]:
        fail(
            f"--data-dir {data_dir} does not match the standardized library dataset "
            f"directory {paths['datasetDir']}"
        )
    if merged != paths["pbf"]:
        fail(
            f"--merged {merged} does not match the standardized dataset PBF "
            f"path {paths['pbf']}"
        )

    descriptors = {
        descriptor["id"]: descriptor
        for descriptor in effective_sources(
            catalog,
            resolved["sourceIds"],
            snapshot_date,
            library_root,
            policy,
        )
    }
    sources: list[dict] = []
    source_sha: dict[str, str] = {}
    source_timestamps: list[str] = []
    for source_id in resolved["sourceIds"]:
        descriptor = descriptors[source_id]
        path = descriptor["path"]
        assert path is not None
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"source PBF is missing or empty: {path}")
        actual_md5 = md5_file(path)
        expected_md5 = descriptor.get("md5")
        if not expected_md5:
            fail(
                f"no trusted MD5 metadata for source {source_id} on "
                f"{snapshot_date.isoformat()}; run online once or restore its source metadata"
            )
        if actual_md5 != expected_md5:
            fail(f"source {source_id} MD5 mismatch: expected {expected_md5}, got {actual_md5}")
        expected_bytes = descriptor.get("bytes")
        actual_bytes = path.stat().st_size
        if expected_bytes is not None and actual_bytes != expected_bytes:
            fail(f"source {source_id} size mismatch: expected {expected_bytes}, got {actual_bytes}")
        source_sha[source_id] = sha256_file(path)
        source_meta = read_source_metadata(path, library_root)
        data_timestamp = source_meta.get("dataTimestamp")
        if data_timestamp is None and snapshot_date == catalog_snapshot_date(catalog):
            data_timestamp = snapshot.get("dataTimestamp")
        if isinstance(data_timestamp, str) and data_timestamp:
            source_timestamps.append(data_timestamp)
        sources.append({
            "id": source_id,
            "provider": snapshot["provider"],
            "url": descriptor["url"],
            "dataDate": snapshot_date.isoformat(),
            "dataTimestamp": data_timestamp,
            "file": path.name,
            "bytes": actual_bytes,
            "md5": actual_md5,
            "sha256": source_sha[source_id],
            "license": snapshot["license"],
            "libraryRelativePath": descriptor["relativePath"].as_posix(),
        })

    crops: list[dict] = []
    for area in resolved["areas"]:
        descriptor = descriptors[area["source"]]
        if area["kind"] == "country":
            path = descriptor["path"]
            assert path is not None
            crops.append({
                "area": area["id"],
                "file": str(path),
                "bbox": None,
                "strategy": "whole-source",
                "sha256": source_sha[area["source"]],
                "libraryRelativePath": descriptor["relativePath"].as_posix(),
            })
        else:
            relative = crop_relative_path(area, snapshot_date)
            crop_path = library_path(library_root, relative)
            if not crop_path.is_file() or crop_path.stat().st_size == 0:
                fail(f"crop PBF is missing or empty: {crop_path}")
            crops.append({
                "area": area["id"],
                "file": str(crop_path),
                "bbox": area["bbox"],
                "strategy": "smart",
                "sha256": sha256_file(crop_path),
                "libraryRelativePath": relative.as_posix(),
            })

    common_timestamp = (
        source_timestamps[0]
        if source_timestamps and len(set(source_timestamps)) == 1
        else None
    )
    manifest = {
        "version": 3,
        "dataset": args.dataset,
        "snapshot": {
            "provider": snapshot["provider"],
            "license": snapshot["license"],
            "mode": snapshot_mode,
            "date": snapshot_date.isoformat(),
            "dataTimestamp": common_timestamp,
        },
        "storage": {
            "librarySchemaVersion": 1,
            "datasetFingerprint": dataset_fingerprint(snapshot_date, resolved["ids"]),
            "datasetRelativePath": dataset_relative_path(snapshot_date, resolved["ids"]).as_posix(),
        },
        "areas": resolved["ids"],
        "bbox": resolved["bbox"],
        "sources": sources,
        "crops": crops,
        "merged": {
            "file": str(merged),
            "sha256": sha256_file(merged),
            "osmiumToolVersion": args.osmium_version,
            "libraryRelativePath": (
                dataset_relative_path(snapshot_date, resolved["ids"]) / merged.name
            ).as_posix(),
        },
        "attribution": "© OpenStreetMap contributors",
        "attributionUrl": "https://www.openstreetmap.org/copyright",
    }
    output = data_dir / f"{args.dataset}.source.json"
    write_json_atomically(output, manifest)
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
    if not isinstance(manifest, dict):
        fail(f"invalid provenance manifest {manifest_path}: expected a JSON object")
    version = manifest.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version not in (2, 3):
        fail(
            f"{manifest_path} is not a version-2 or version-3 (multi-area) manifest. "
            "Rebuild the dataset with prepare-regions-pbf.sh, or let "
            "scripts/setup-ubuntu-vm.sh migrate a Tehran-only install."
        )

    resolved = resolve_selection(catalog, args.selection)
    pinned_date = catalog_snapshot_date(catalog)
    snapshot_spec = getattr(args, "snapshot", None)
    if getattr(args, "snapshot_date", None):
        expected_snapshot_date = parse_snapshot_date(args.snapshot_date, "--snapshot-date")
    elif snapshot_spec:
        spec_mode, spec_date = parse_snapshot_spec(snapshot_spec, catalog)
        if spec_mode == "latest":
            manifest_snapshot = manifest.get("snapshot", {}) if version == 3 else {}
            raw_date = manifest_snapshot.get("date") if isinstance(manifest_snapshot, dict) else None
            expected_snapshot_date = (
                parse_snapshot_date(raw_date, "manifest snapshot date") if raw_date else pinned_date
            )
        else:
            expected_snapshot_date = spec_date or pinned_date
    elif version == 3:
        manifest_snapshot = manifest.get("snapshot", {})
        raw_date = manifest_snapshot.get("date") if isinstance(manifest_snapshot, dict) else None
        if not raw_date:
            fail("version-3 manifest snapshot block must carry a date")
        expected_snapshot_date = parse_snapshot_date(raw_date, "manifest snapshot date")
    else:
        expected_snapshot_date = pinned_date
    if version == 2 and expected_snapshot_date != pinned_date:
        fail("version-2 manifests only describe the repository-pinned snapshot; rebuild for another date")
    if version == 3:
        manifest_snapshot = manifest.get("snapshot")
        if not isinstance(manifest_snapshot, dict):
            fail("version-3 manifest must carry a snapshot block")
        if manifest_snapshot.get("provider") != catalog["snapshot"]["provider"] or manifest_snapshot.get("license") != catalog["snapshot"]["license"]:
            fail("version-3 manifest snapshot must identify Geofabrik and the ODbL-1.0 license")
        if manifest_snapshot.get("date") != expected_snapshot_date.isoformat():
            fail(
                f"manifest snapshot date {manifest_snapshot.get('date')!r} does not match "
                f"expected {expected_snapshot_date.isoformat()!r}"
            )
        storage = manifest.get("storage")
        expected_fingerprint = dataset_fingerprint(expected_snapshot_date, resolved["ids"])
        expected_dataset_path = dataset_relative_path(
            expected_snapshot_date, resolved["ids"]
        ).as_posix()
        if (
            not isinstance(storage, dict)
            or isinstance(storage.get("librarySchemaVersion"), bool)
            or not isinstance(storage.get("librarySchemaVersion"), int)
            or storage.get("librarySchemaVersion") != 1
            or storage.get("datasetFingerprint") != expected_fingerprint
            or storage.get("datasetRelativePath") != expected_dataset_path
        ):
            fail("manifest storage metadata does not match its standardized snapshot/selection path")

    manifest_areas = manifest.get("areas")
    if (
        not isinstance(manifest_areas, list)
        or any(not isinstance(area_id, str) for area_id in manifest_areas)
        or sorted(manifest_areas) != sorted(resolved["ids"])
    ):
        fail(
            f"manifest areas {manifest_areas!r} do not match selected areas "
            f"{resolved['ids']!r}; rebuild with prepare-regions-pbf.sh"
        )

    def bbox_matches(candidate: object, expected: list[float]) -> bool:
        if (
            not isinstance(candidate, list)
            or len(candidate) != 4
            or any(
                isinstance(value, bool) or not isinstance(value, (int, float))
                for value in candidate
            )
        ):
            return False
        try:
            numeric = [float(value) for value in candidate]
        except (OverflowError, ValueError):
            return False
        return all(math.isfinite(value) for value in numeric) and all(
            abs(value - float(want)) <= EPSILON
            for value, want in zip(numeric, expected)
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
    by_id: dict[str, dict] = {}
    for entry in manifest_sources:
        if not isinstance(entry, dict):
            fail("every manifest source entry must be an object")
        source_id = entry.get("id")
        if not isinstance(source_id, str) or source_id not in catalog["sources"]:
            fail(f"manifest source has an unknown or invalid id: {source_id!r}")
        if source_id in by_id:
            fail(f"manifest contains duplicate source entry {source_id!r}")
        by_id[source_id] = entry
    if set(by_id) != set(resolved["sourceIds"]):
        fail(
            f"manifest sources {sorted(by_id)!r} do not match "
            f"selection sources {sorted(resolved['sourceIds'])!r}"
        )
    for source_id, entry in by_id.items():
        pinned = catalog["sources"][source_id]
        if entry.get("provider") != snapshot["provider"] or entry.get("license") != snapshot["license"]:
            fail(f"manifest source {source_id} must identify Geofabrik and the ODbL-1.0 license")
        expected_url = dated_source_url(pinned["url"], expected_snapshot_date)
        if entry.get("url") != expected_url or entry.get("dataDate") != expected_snapshot_date.isoformat():
            fail(f"manifest source {source_id} does not match the expected snapshot {expected_snapshot_date.isoformat()}")
        if expected_snapshot_date == pinned_date:
            if entry.get("md5") != pinned["md5"]:
                fail(f"manifest source {source_id} does not match the pinned catalog MD5")
            pinned_bytes = pinned.get("bytes")
            if pinned_bytes is not None and entry.get("bytes") != pinned_bytes:
                fail(f"manifest source {source_id} does not match the pinned catalog byte count")
        if not MD5_RE.match(str(entry.get("md5", ""))):
            fail(f"manifest source {source_id} has an invalid md5")
        if not isinstance(entry.get("bytes"), int) or isinstance(entry.get("bytes"), bool) or entry["bytes"] <= 0:
            fail(f"manifest source {source_id} has an invalid byte count")
        if version == 3:
            expected_relative = source_relative_path(
                catalog, source_id, expected_snapshot_date
            ).as_posix()
            if entry.get("libraryRelativePath") != expected_relative:
                fail(f"manifest source {source_id} library path does not match the standardized layout")
        if not SHA256_RE.match(str(entry.get("sha256", ""))):
            fail(f"manifest source {source_id} has an invalid sha256")

    index = area_index(catalog)
    crops = manifest.get("crops")
    if not isinstance(crops, list):
        fail("manifest crops must be a list")
    crops_by_area: dict[str, dict] = {}
    for crop in crops:
        if not isinstance(crop, dict):
            fail("every manifest crop entry must be an object")
        area_id = crop.get("area")
        if not isinstance(area_id, str) or area_id not in index:
            fail(f"manifest crop has an unknown or invalid area: {area_id!r}")
        if area_id in crops_by_area:
            fail(f"manifest contains duplicate crop entry {area_id!r}")
        crops_by_area[area_id] = crop
    if set(crops_by_area) != set(resolved["ids"]):
        fail("manifest crops do not match the selected areas")
    for area_id, crop in crops_by_area.items():
        area = index[area_id]
        expected_strategy = "whole-source" if area["kind"] == "country" else "smart"
        if crop.get("strategy") != expected_strategy:
            fail(f"manifest crop {area_id} strategy must be {expected_strategy}")
        if area["kind"] == "city" and not bbox_matches(crop.get("bbox"), area["bbox"]):
            fail(f"manifest crop {area_id} bbox does not match the catalog")
        if version == 3:
            expected_relative = (
                source_relative_path(catalog, area["source"], expected_snapshot_date)
                if area["kind"] == "country"
                else crop_relative_path(area, expected_snapshot_date)
            ).as_posix()
            if crop.get("libraryRelativePath") != expected_relative:
                fail(f"manifest crop {area_id} library path does not match the standardized layout")
        if not SHA256_RE.match(str(crop.get("sha256", ""))):
            fail(f"manifest crop {area_id} has an invalid sha256")

    merged = manifest.get("merged")
    if not isinstance(merged, dict):
        fail("manifest merged block must be an object")
    if version == 3:
        expected_merged_path = (
            dataset_relative_path(expected_snapshot_date, resolved["ids"])
            / pbf_path.name
        ).as_posix()
        if merged.get("libraryRelativePath") != expected_merged_path:
            fail("manifest merged PBF path does not match the standardized dataset location")
        library_arg = getattr(args, "library", None)
        if library_arg:
            library_root = resolve_library_root(library_arg)
            expected_pbf_path = library_path(library_root, expected_merged_path)
            expected_dataset_name = pbf_path.name.removesuffix(".osm.pbf")
            if not expected_dataset_name:
                fail("version-3 manifest PBF must use the <dataset>.osm.pbf filename")
            expected_manifest_path = library_path(
                library_root,
                dataset_relative_path(expected_snapshot_date, resolved["ids"])
                / f"{expected_dataset_name}.source.json",
            )
            if library_member_path(library_root, pbf_path) != expected_pbf_path:
                fail("verified PBF is not the standardized dataset file in the map library")
            if library_member_path(library_root, manifest_path) != expected_manifest_path:
                fail("verified manifest is not the standardized manifest in the map library")
        try:
            recorded_merged_file = Path(str(merged.get("file", ""))).resolve()
        except (OSError, RuntimeError, ValueError):
            fail("manifest merged PBF file path is invalid")
        if recorded_merged_file != pbf_path.resolve():
            fail("manifest merged PBF file path does not match the verified dataset")
    if not SHA256_RE.match(str(merged.get("sha256", ""))) or not merged.get("osmiumToolVersion"):
        fail("manifest merged block must carry a sha256 and the osmium-tool version")
    actual_sha256 = sha256_file(pbf_path)
    if actual_sha256 != merged["sha256"]:
        fail(f"merged PBF SHA-256 {actual_sha256} does not match manifest {merged['sha256']!r}")
    print(
        f"OK: {pbf_path} matches areas {','.join(resolved['ids'])} "
        f"bbox {resolved['bbox']!r} snapshot {expected_snapshot_date.isoformat()} "
        f"(SHA-256 {actual_sha256})"
    )


def validate_legacy_v1_manifest(catalog: dict, old: dict, pbf_path: Path) -> dict:
    """Return verified Tehran v1 provenance, or fail closed before migration."""
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
        and source.get("url") in (pinned["url"], LEGACY_IRAN_LATEST_URL)
        and source.get("md5") == pinned["md5"]
        and source.get("dataDate") == snapshot["dataDate"]
        and source.get("dataTimestamp") == snapshot["dataTimestamp"]
        and source_bytes == pinned.get("bytes")
        and SHA256_RE.match(str(source.get("sha256", ""))) is not None
    )
    if not source_matches_pinned_snapshot:
        fail("v1 manifest source does not match the pinned catalog Iran snapshot; rebuild instead")
    raw_crop_bbox = crop.get("bbox")
    if bbox_problem(raw_crop_bbox):
        fail("v1 manifest crop bbox is invalid; rebuild instead")
    try:
        crop_bbox = [float(value) for value in raw_crop_bbox]
    except (OverflowError, TypeError, ValueError):
        crop_bbox = []
    if crop_bbox != tehran["bbox"] or crop.get("strategy") != "smart":
        fail("v1 manifest crop does not match the catalog Tehran bbox; rebuild instead")
    if not pbf_path.is_file() or pbf_path.stat().st_size == 0:
        fail(f"dataset PBF is missing or empty: {pbf_path}; rebuild instead")
    actual_sha256 = sha256_file(pbf_path)
    if actual_sha256 != crop.get("sha256"):
        fail("dataset PBF does not match the v1 manifest crop SHA-256; rebuild instead")
    return {
        "source": source,
        "crop": crop,
        "sourceBytes": source_bytes,
        "tehran": tehran,
        "actualSha256": actual_sha256,
    }


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
    pbf_path = Path(args.pbf)
    verified = validate_legacy_v1_manifest(catalog, old, pbf_path)
    tehran = verified["tehran"]
    pinned = catalog["sources"]["iran"]
    snapshot = catalog["snapshot"]
    source = verified["source"]
    crop = verified["crop"]
    source_bytes = verified["sourceBytes"]
    actual_sha256 = verified["actualSha256"]
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
    library_arg = getattr(args, "library", None)
    if library_arg:
        snapshot_date = (
            parse_snapshot_date(args.snapshot_date, "--snapshot-date")
            if getattr(args, "snapshot_date", None)
            else catalog_snapshot_date(catalog)
        )
        if snapshot_date != catalog_snapshot_date(catalog):
            fail("v1 Tehran migration only describes the repository-pinned snapshot")
        paths = library_paths(library_arg, snapshot_date, ["ir-tehran"], args.dataset)
        manifest["version"] = 3
        manifest["snapshot"] = {
            "provider": snapshot["provider"],
            "license": snapshot["license"],
            "mode": "pinned",
            "date": snapshot_date.isoformat(),
            "dataTimestamp": snapshot["dataTimestamp"],
        }
        manifest["storage"] = {
            "librarySchemaVersion": 1,
            "datasetFingerprint": dataset_fingerprint(snapshot_date, ["ir-tehran"]),
            "datasetRelativePath": dataset_relative_path(snapshot_date, ["ir-tehran"]).as_posix(),
        }
        manifest["sources"][0]["libraryRelativePath"] = source_relative_path(
            catalog, "iran", snapshot_date
        ).as_posix()
        crop_relative = crop_relative_path(tehran, snapshot_date)
        manifest["crops"][0]["file"] = str(paths["libraryDir"] / crop_relative)
        manifest["crops"][0]["libraryRelativePath"] = crop_relative.as_posix()
        manifest["merged"]["libraryRelativePath"] = (
            dataset_relative_path(snapshot_date, ["ir-tehran"]) / pbf_path.name
        ).as_posix()
    output = Path(args.output)
    write_json_atomically(output, manifest)
    print(f"Migrated v1 Tehran manifest to version {manifest['version']}: {output}")


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
    resolve.add_argument("--snapshot", default="pinned")
    resolve.add_argument("--source-policy", default="cache-first")
    resolve.add_argument("--library")
    resolve.add_argument("--dataset", default="borobiya")

    sources = subparsers.add_parser("sources")
    sources.add_argument("selection")
    sources.add_argument("--snapshot", default="pinned")
    sources.add_argument("--source-policy", default="cache-first")
    sources.add_argument("--library")
    areas = subparsers.add_parser("areas")
    areas.add_argument("selection")
    areas.add_argument("--snapshot", default="pinned")
    areas.add_argument("--source-policy", default="cache-first")
    areas.add_argument("--library")

    subparsers.add_parser("pinned-snapshot")
    manifest_summary = subparsers.add_parser("manifest-summary")
    manifest_summary.add_argument("--manifest", required=True)
    manifest_library_ready = subparsers.add_parser("manifest-library-ready")
    manifest_library_ready.add_argument("--manifest", required=True)
    manifest_library_ready.add_argument("--library", required=True)
    manifest_library_ready.add_argument("--osmium-version", required=True)

    verify_point = subparsers.add_parser("verify-point")
    verify_point.add_argument("area")

    write_crop_meta = subparsers.add_parser("write-crop-meta")
    write_crop_meta.add_argument("--meta", required=True)
    write_crop_meta.add_argument("--crop", required=True)
    write_crop_meta.add_argument("--area", required=True)
    write_crop_meta.add_argument("--source-sha256", required=True)
    write_crop_meta.add_argument("--osmium-version", required=True)
    write_crop_meta.add_argument("--snapshot-date")
    write_crop_meta.add_argument("--library")

    verify_crop = subparsers.add_parser("verify-crop")
    verify_crop.add_argument("--meta", required=True)
    verify_crop.add_argument("--crop", required=True)
    verify_crop.add_argument("--area", required=True)
    verify_crop.add_argument("--source-sha256", required=True)
    verify_crop.add_argument("--osmium-version", required=True)
    verify_crop.add_argument("--snapshot-date")
    verify_crop.add_argument("--library")

    write_source_meta = subparsers.add_parser("write-source-meta")
    write_source_meta.add_argument("--library", required=True)
    write_source_meta.add_argument("--source", required=True)
    write_source_meta.add_argument("--snapshot-date", required=True)
    write_source_meta.add_argument("--md5")
    write_source_meta.add_argument("--sha256")
    write_source_meta.add_argument("--data-timestamp")

    write_manifest = subparsers.add_parser("write-manifest")
    write_manifest.add_argument("--data-dir", required=True)
    write_manifest.add_argument("--dataset", required=True)
    write_manifest.add_argument("--selection", required=True)
    write_manifest.add_argument("--merged", required=True)
    write_manifest.add_argument("--osmium-version", required=True)
    write_manifest.add_argument("--library")
    write_manifest.add_argument("--snapshot", default="pinned")
    write_manifest.add_argument("--snapshot-date")
    write_manifest.add_argument("--source-policy", default="cache-first")

    verify_manifest = subparsers.add_parser("verify-manifest")
    verify_manifest.add_argument("--manifest", required=True)
    verify_manifest.add_argument("--pbf", required=True)
    verify_manifest.add_argument("--selection", required=True)
    verify_manifest.add_argument("--bbox")
    verify_manifest.add_argument("--snapshot")
    verify_manifest.add_argument("--snapshot-date")
    verify_manifest.add_argument("--library")

    migrate = subparsers.add_parser("migrate-manifest-v1")
    migrate.add_argument("--input", required=True)
    migrate.add_argument("--output", required=True)
    migrate.add_argument("--pbf", required=True)
    migrate.add_argument("--dataset", default="borobiya")
    migrate.add_argument("--library")
    migrate.add_argument("--snapshot-date")

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
        "pinned-snapshot": command_pinned_snapshot,
        "manifest-summary": command_manifest_summary,
        "manifest-library-ready": command_manifest_library_ready,
        "verify-point": command_verify_point,
        "write-crop-meta": command_write_crop_meta,
        "verify-crop": command_verify_crop,
        "write-source-meta": command_write_source_meta,
        "write-manifest": command_write_manifest,
        "verify-manifest": command_verify_manifest,
        "migrate-manifest-v1": command_migrate_manifest_v1,
    }
    handlers[args.command](catalog, args)


if __name__ == "__main__":
    main()
