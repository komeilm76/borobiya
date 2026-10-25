#!/usr/bin/env python3
"""Stage Mapzen/Tilezen Skadi HGT for a reviewed WGS84 bbox, outside the checkout.

No elevation is fetched at request time. Run before enabling the routing gateway's
read-only mount; re-run to refresh checksums after changing the bbox. Python stdlib only.
"""
import argparse
import gzip
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path
from urllib.request import urlopen

SOURCE = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"
MAX_BYTES = 3601 * 3601 * 2


def name_for(lat, lon):
    return f"{'S' if lat < 0 else 'N'}{abs(lat):02d}{'W' if lon < 0 else 'E'}{abs(lon):03d}"


def tiles_for(bbox):
    west, south, east, north = bbox
    if not (-180 <= west < east < 180 and -90 <= south < north < 90):
        raise ValueError("bbox must be west,south,east,north in WGS84")
    tiles = [name_for(y, x) for y in range(math.floor(south), math.floor(north) + 1)
             for x in range(math.floor(west), math.floor(east) + 1)]
    if len(tiles) > 200:
        raise ValueError("bbox spans more than 200 tiles; stage smaller areas separately")
    return tiles


def stage(bbox, destination, source_dir=None):
    destination.mkdir(parents=True, exist_ok=True)
    entries = {}
    for name in tiles_for(bbox):
        url = f"{SOURCE}/{name[:3]}/{name}.hgt.gz"
        print(f"Staging {name} from {'local test fixture' if source_dir else url}", flush=True)
        # Only the explicitly supplied local test source overrides the public data source.
        compressed = open(source_dir / f"{name}.hgt.gz", "rb") if source_dir else urlopen(url, timeout=90)
        temp_path = None
        try:
            with compressed, gzip.GzipFile(fileobj=compressed) as stream, tempfile.NamedTemporaryFile(
                dir=destination, prefix=f".{name}-", delete=False
            ) as out:
                temp_path = Path(out.name)
                digest = hashlib.sha256()
                size = 0
                while chunk := stream.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError(f"{name} exceeds the largest supported HGT tile")
                    digest.update(chunk)
                    out.write(chunk)
            if size not in (1201 * 1201 * 2, MAX_BYTES):
                raise ValueError(f"{name} has unexpected raster size {size}")
            os.replace(temp_path, destination / f"{name}.hgt")
            temp_path = None
            entries[name] = {"samples": math.isqrt(size // 2), "sha256": digest.hexdigest(),
                             "url": url if source_dir is None else f"fixture:{name}.hgt.gz"}
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
    manifest = {
        "format": "skadi-hgt-v1", "source": "fixture" if source_dir else "mapzen-skadi", "bbox": bbox,
        "attribution": ("Synthetic test fixture; not terrain data" if source_dir else
                        "Terrain Tiles by Mapzen/Tilezen; underlying data sources and required credits: https://github.com/tilezen/joerd/blob/master/docs/attribution.md"),
        "tiles": entries
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=destination, prefix=".manifest-", delete=False) as out:
        temp_path = Path(out.name)
        json.dump(manifest, out, ensure_ascii=False, indent=2, sort_keys=True)
        out.write("\n")
    os.replace(temp_path, destination / "manifest.json")
    print(f"Staged {len(entries)} tiles; manifest: {destination / 'manifest.json'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", required=True, help="west,south,east,north (MAP_BBOX)")
    parser.add_argument("--dir", type=Path, required=True, help="external output directory (MAP_ELEVATION_DIR)")
    parser.add_argument("--source-dir", type=Path, help="offline .hgt.gz fixtures, for testing only; output is NOT accepted as real DEM")
    args = parser.parse_args()
    bbox = [float(value) for value in args.bbox.split(",")]
    if len(bbox) != 4 or not all(math.isfinite(value) for value in bbox):
        parser.error("bbox must have four finite numbers")
    stage(bbox, args.dir, args.source_dir)


if __name__ == "__main__":
    main()
