import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './config.ts';
import { LruTtlCache } from './cache.ts';
import { notFound } from './errors.ts';
import { strongEtag, writeBuffer } from './http.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

interface CachedFile {
  body: Buffer;
  etag: string;
  contentType: string;
  mtimeMs: number;
}

export class StaticFiles {
  private readonly cache: LruTtlCache<string, CachedFile>;

  constructor(private readonly config: Config) {
    this.cache = new LruTtlCache(128, config.nodeEnv === 'development' ? 1000 : 60_000);
  }

  private resolve(pathname: string): string {
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { throw notFound('Invalid path.'); }
    if (decoded.includes('\0')) throw notFound('Invalid path.');
    const relative = decoded.replace(/^\/+/, '') || 'index.html';
    if (relative.split(/[\\/]/).some((segment) => segment.startsWith('.'))) throw notFound('Hidden files are not served.');
    const absolute = path.resolve(this.config.publicDir, relative);
    const root = path.resolve(this.config.publicDir);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw notFound('Path is outside the public directory.');
    const extension = path.extname(absolute).toLowerCase();
    if (!TYPES[extension]) throw notFound('Unsupported file type.');
    return absolute;
  }

  private cacheControl(relative: string): string {
    if (relative.endsWith('sw.js') || relative.endsWith('index.html')) return 'no-cache';
    if (relative.startsWith('assets/')) return 'public, max-age=31536000, immutable';
    return this.config.nodeEnv === 'development' ? 'no-cache' : 'public, max-age=3600, must-revalidate';
  }

  private async load(absolute: string): Promise<CachedFile> {
    const info = await stat(absolute);
    if (!info.isFile()) throw notFound();
    const cached = this.cache.get(absolute);
    if (cached && cached.mtimeMs === info.mtimeMs) return cached;
    const body = await readFile(absolute);
    const contentType = TYPES[path.extname(absolute).toLowerCase()];
    const value = { body, etag: strongEtag(body), contentType, mtimeMs: info.mtimeMs };
    this.cache.set(absolute, value);
    return value;
  }

  async serve(req: IncomingMessage, res: ServerResponse, pathname: string, fallbackToIndex = false): Promise<boolean> {
    let absolute: string;
    try {
      absolute = this.resolve(pathname);
    } catch (error) {
      if (!fallbackToIndex) throw error;
      absolute = path.resolve(this.config.publicDir, 'index.html');
    }
    try {
      const file = await this.load(absolute);
      const relative = path.relative(this.config.publicDir, absolute).split(path.sep).join('/');
      writeBuffer(req, res, 200, file.body, {
        contentType: file.contentType,
        etag: file.etag,
        cacheControl: this.cacheControl(relative),
        headers: relative.endsWith('index.html') ? { 'X-Content-Type-Options': 'nosniff' } : undefined,
        compress: !/\.(png|jpg|jpeg|webp|ttf|woff2)$/i.test(relative)
      });
      return true;
    } catch (error) {
      if (fallbackToIndex && !pathname.includes('.')) {
        const index = path.resolve(this.config.publicDir, 'index.html');
        const file = await this.load(index);
        writeBuffer(req, res, 200, file.body, {
          contentType: file.contentType,
          etag: file.etag,
          cacheControl: 'no-cache'
        });
        return true;
      }
      throw notFound('File not found.');
    }
  }

  stats(): { size: number; hits: number; misses: number; evictions: number } {
    const result = this.cache.stats();
    return { size: result.size, hits: result.hits, misses: result.misses, evictions: result.evictions };
  }

  clear(): void { this.cache.clear(); }
}
