import type { DatabaseSync } from 'node:sqlite';
import type { Clock } from '../core/cache.ts';
import type { Config } from '../core/config.ts';
import type { RateLimiters } from '../core/rate-limit.ts';
import type { Router } from '../core/router.ts';
import type { StaticFiles } from '../core/static.ts';
import type { WebSocketHub } from '../core/websocket.ts';
import type { Repository } from '../db/repository.ts';
import type { UnitOfWork } from '../db/unit-of-work.ts';
import type { Services } from './index.ts';

export interface AppContext {
  config: Config;
  database: DatabaseSync;
  repo: Repository;
  uow: UnitOfWork;
  hub: WebSocketHub;
  router: Router<AppContext>;
  staticFiles: StaticFiles;
  limiters: RateLimiters;
  services: Services;
  clock: Clock;
  startedAt: number;
  jobs: NodeJS.Timeout[];
}
