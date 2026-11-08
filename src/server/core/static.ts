import type { Config } from './config.ts';
import { pathResolve } from './config.ts';
import { notFound } from './errors.ts';
import { bufferResponse, strongEtag } from './http.ts';
import { LruTtlCache } from './cache.ts';

/** Returns the lower-case extension of a path (including the dot) or an empty string. */
function extensionOf(value: string): string {
  const lastSegment = value.slice(value.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot <= 0 ? '' : lastSegment.slice(dot).toLowerCase();
}

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
  body: Uint8Array;
  etag: string;
  contentType: string;
  mtimeMs: number;
}

/**
 * Serves generated browser assets from `public/` with ETags, compression and SPA fallback.
 * Every path is resolved and confined to the public root; hidden segments and unknown
 * extensions are rejected before any disk access.
 */
export class StaticFiles {
  private readonly cache: LruTtlCache<string, CachedFile>;

  constructor(private readonly config: Config) {
    this.cache = new LruTtlCache(128, config.environment === 'development' ? 1000 : 60_000);
  }

  /** Resolves a URL path to an absolute file inside the public root. */
  private resolve(pathname: string): string {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw notFound('Invalid path.');
    }
    if (decoded.includes('\0')) throw notFound('Invalid path.');
    const relative = decoded.replace(/^\/+/, '') || 'index.html';
    if (relative.split(/[\\/]/).some((segment) => segment.startsWith('.'))) throw notFound('Hidden files are not served.');
    const absolute = pathResolve(this.config.publicDir, relative);
    const root = pathResolve(this.config.publicDir);
    if (absolute !== root && !absolute.startsWith(`${root}/`)) {
      throw notFound('Path is outside the public directory.');
    }
    const extension = extensionOf(absolute);
    if (!TYPES[extension]) throw notFound('Unsupported file type.');
    return absolute;
  }

  private cacheControl(relative: string): string {
    if (relative.endsWith('index.html') || relative.endsWith('sw.js') || relative.endsWith('cache-manifest.json')) return 'no-cache';
    if (relative.startsWith('assets/')) return 'public, max-age=31536000, immutable';
    return this.config.environment === 'development' ? 'no-cache' : 'public, max-age=3600, must-revalidate';
  }

  private async load(absolute: string): Promise<CachedFile> {
    const file = Bun.file(absolute);
    if (!(await file.exists())) throw notFound();
    const cached = this.cache.get(absolute);
    if (cached && cached.mtimeMs === file.lastModified) return cached;
    const body = new Uint8Array(await file.arrayBuffer());
    const value = {
      body,
      etag: strongEtag(body),
      contentType: TYPES[extensionOf(absolute)] ?? 'application/octet-stream',
      mtimeMs: file.lastModified
    };
    this.cache.set(absolute, value);
    return value;
  }

  /**
   * Serves a static file or the SPA shell.
   *
   * @param request Incoming request.
   * @param pathname Request path.
   * @param fallbackToIndex Whether unknown extension-less paths render the SPA shell.
   * @returns The response to send.
   * @throws HttpError 404 when the file is missing and no fallback applies.
   */
  async serve(request: Request, pathname: string, fallbackToIndex = false): Promise<Response> {
    let absolute: string;
    try {
      absolute = this.resolve(pathname);
    } catch (error) {
      if (!fallbackToIndex) throw error;
      absolute = pathResolve(this.config.publicDir, 'index.html');
    }
    try {
      const file = await this.load(absolute);
      const relative = absolute.startsWith(`${this.config.publicDir}/`) ? absolute.slice(this.config.publicDir.length + 1) : 'index.html';
      return bufferResponse(request, 200, file.body, {
        contentType: file.contentType,
        etag: file.etag,
        cacheControl: this.cacheControl(relative),
        headers: relative.endsWith('index.html') ? { 'X-Content-Type-Options': 'nosniff' } : undefined,
        compress: !/\.(png|jpg|jpeg|webp|ttf|woff2)$/i.test(relative)
      });
    } catch {
      if (fallbackToIndex && !pathname.includes('.')) {
        const index = await this.load(pathResolve(this.config.publicDir, 'index.html'));
        return bufferResponse(request, 200, index.body, {
          contentType: index.contentType,
          etag: index.etag,
          cacheControl: 'no-cache'
        });
      }
      throw notFound('File not found.');
    }
  }

  /** Cache statistics are surfaced by the administrator system-health screen. */
  stats(): { size: number; hits: number; misses: number; evictions: number } {
    const result = this.cache.stats();
    return { size: result.size, hits: result.hits, misses: result.misses, evictions: result.evictions };
  }

  /** Clears the file cache; used on shutdown and by tests. */
  clear(): void {
    this.cache.clear();
  }
}
