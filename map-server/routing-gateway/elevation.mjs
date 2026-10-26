// Skadi HGT tiles are 1° WGS84 rasters, north-to-south, signed big-endian metres.
// Data is staged outside the repository; a missing/void/corrupt tile never becomes a made-up elevation.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TILE_NAME = /^[NS](?:0\d\d|[0-8]\d|90)[EW](?:0\d\d|1[0-7]\d|180)$/;
const SOURCE = "mapzen-skadi";
const MAX_SAMPLES = 12_000;
// Match the browser route decoder: a long valid route remains navigable even
// when its optional DEM sampling exceeds the smaller altitude work budget.
const MAX_POLYLINE_POINTS = 30_000;
const SAMPLE_SPACING_M = 90;
const MAX_PROFILE_POINTS = 96;

// Keep first/last plus each distance bucket's extrema in traversal order. Uniform
// subsampling can erase a short steep climb; the chart still stays bounded on long routes.
function compactProfile(samples) {
  const buckets = Array.from({ length: (MAX_PROFILE_POINTS - 2) / 2 }, () => ({ min: null, max: null }));
  const total = samples.at(-1).distance_m;
  for (let i = 1; i < samples.length - 1; i++) {
    const bucket = buckets[Math.min(buckets.length - 1, Math.floor(samples[i].distance_m / (total || 1) * buckets.length))];
    if (bucket.min === null || samples[i].elevation_m < samples[bucket.min].elevation_m) bucket.min = i;
    if (bucket.max === null || samples[i].elevation_m > samples[bucket.max].elevation_m) bucket.max = i;
  }
  const retained = [samples[0]];
  for (const bucket of buckets) {
    for (const i of [bucket.min, bucket.max].filter((index) => index !== null).sort((a, b) => a - b)) {
      if (retained.at(-1) !== samples[i]) retained.push(samples[i]);
    }
  }
  retained.push(samples.at(-1));
  return retained.map(({ distance_m, elevation_m }) => ({
    distance_m: Math.round(distance_m), elevation_m: Math.round(elevation_m)
  }));
}

export function tileName(lat, lon) {
  const y = Math.floor(lat);
  const x = Math.floor(lon);
  return `${y < 0 ? "S" : "N"}${String(Math.abs(y)).padStart(2, "0")}${x < 0 ? "W" : "E"}${String(Math.abs(x)).padStart(3, "0")}`;
}

// Decode OSRM's 1e-5 degree polyline, rejecting incomplete or implausible upstream data.
export function decodePolyline(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > 200_000) return null;
  const points = [];
  let lat = 0;
  let lon = 0;
  let index = 0;
  function read() {
    let result = 0;
    for (let shift = 0; shift <= 30; shift += 5) {
      if (index >= encoded.length) return null;
      const value = encoded.charCodeAt(index++) - 63;
      if (value < 0 || value > 63) return null;
      result += (value & 31) * 2 ** shift;
      if (value < 32) return result & 1 ? -(Math.floor(result / 2) + 1) : result / 2;
    }
    return null;
  }
  while (index < encoded.length) {
    const deltaLat = read();
    const deltaLon = read();
    if (deltaLat === null || deltaLon === null) return null;
    lat += deltaLat;
    lon += deltaLon;
    if (Math.abs(lat) > 9_000_000 || Math.abs(lon) > 18_000_000 ||
        points.length >= MAX_POLYLINE_POINTS) return null;
    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points.length >= 2 ? points : null;
}

function distance(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function elevationForRoute(polyline, provider) {
  if (!provider) return null;
  const points = decodePolyline(polyline);
  if (!points) return null;
  let previous = null;
  let gain = 0;
  let loss = 0;
  let start = null;
  let count = 0;
  let travelled = 0;
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segmentLength = distance(a, b);
    const steps = Math.max(1, Math.ceil(segmentLength / SAMPLE_SPACING_M));
    if (count + steps + 1 > MAX_SAMPLES) return null;
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const height = provider.sample(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);
      if (height === null || !Number.isFinite(height)) return null;
      if (start === null) start = height;
      if (previous !== null) {
        gain += Math.max(0, height - previous);
        loss += Math.max(0, previous - height);
      }
      samples.push({ distance_m: travelled + segmentLength * t, elevation_m: height });
      previous = height;
      count++;
    }
    travelled += segmentLength;
  }
  const end = provider.sample(points.at(-1).lat, points.at(-1).lon);
  if (end === null || !Number.isFinite(end)) return null;
  gain += Math.max(0, end - previous);
  loss += Math.max(0, previous - end);
  samples.push({ distance_m: travelled, elevation_m: end });
  return { gain_m: Math.round(gain), loss_m: Math.round(loss), start_m: Math.round(start), end_m: Math.round(end),
    source: SOURCE, profile: compactProfile(samples) };
}

export function createElevationProvider(directory, log = console.error) {
  if (!directory) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    if (manifest.format !== "skadi-hgt-v1" || manifest.source !== SOURCE ||
      !manifest.tiles || typeof manifest.tiles !== "object" || Array.isArray(manifest.tiles)) {
      throw new Error("invalid elevation manifest");
    }
    for (const [name, entry] of Object.entries(manifest.tiles)) {
      if (!TILE_NAME.test(name) || ![1201, 3601].includes(entry?.samples) ||
          !/^[a-f0-9]{64}$/.test(entry?.sha256) ||
          entry?.url !== `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${name.slice(0, 3)}/${name}.hgt.gz`) {
        throw new Error("invalid elevation tile entry");
      }
    }
  } catch (error) {
    log(`Elevation disabled: ${error.message}`);
    return null;
  }
  // A bounded cache avoids retaining every 26 MB tile on a long cross-region route.
  const cache = new Map();
  const broken = new Set();
  function load(name) {
    if (cache.has(name)) {
      const tile = cache.get(name);
      cache.delete(name);
      cache.set(name, tile);
      return tile;
    }
    const entry = manifest.tiles[name];
    if (!entry || broken.has(name)) return null;
    try {
      const data = readFileSync(join(directory, `${name}.hgt`));
      if (data.length !== entry.samples ** 2 * 2 ||
          createHash("sha256").update(data).digest("hex") !== entry.sha256) {
        throw new Error("size or SHA-256 mismatch");
      }
      const tile = { data, n: entry.samples };
      cache.set(name, tile);
      if (cache.size > 3) cache.delete(cache.keys().next().value);
      return tile;
    } catch (error) {
      broken.add(name);
      log(`Elevation tile ${name} unavailable: ${error.message}`);
      return null;
    }
  }
  return {
    sample(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) >= 90 || Math.abs(lon) >= 180) return null;
      const y = Math.floor(lat);
      const x = Math.floor(lon);
      const tile = load(tileName(lat, lon));
      if (!tile) return null;
      const col = (lon - x) * (tile.n - 1);
      const row = (y + 1 - lat) * (tile.n - 1);
      const left = Math.min(tile.n - 1, Math.floor(col));
      const top = Math.min(tile.n - 1, Math.floor(row));
      const right = Math.min(tile.n - 1, left + 1);
      const bottom = Math.min(tile.n - 1, top + 1);
      const value = (r, c) => tile.data.readInt16BE((r * tile.n + c) * 2);
      const corners = [value(top, left), value(top, right), value(bottom, left), value(bottom, right)];
      if (corners.includes(-32768)) return null; // HGT void: never interpolate across holes.
      const dx = col - left;
      const dy = row - top;
      return (corners[0] * (1 - dx) + corners[1] * dx) * (1 - dy) +
        (corners[2] * (1 - dx) + corners[3] * dx) * dy;
    }
  };
}
