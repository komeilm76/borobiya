import type { AppContext } from './context.ts';
import { AuthService } from './auth.ts';
import { UserService } from './users.ts';
import { LocationService } from './location.ts';
import { SosService } from './sos.ts';
import { AdminService } from './admin.ts';
import { MapService } from './map.ts';
import { RealtimeService } from './realtime.ts';

export interface Services {
  auth: AuthService;
  users: UserService;
  location: LocationService;
  sos: SosService;
  admin: AdminService;
  map: MapService;
  realtime: RealtimeService;
}

/** Services are thin classes. All shared state lives in explicit caches, SQLite or the realtime hub. */
export function createServices(context: AppContext): Services {
  const auth = new AuthService(context);
  const location = new LocationService(context);
  const sos = new SosService(context);
  const users = new UserService(context);
  const admin = new AdminService(context);
  const map = new MapService(context);
  const realtime = new RealtimeService(context);
  return { auth, users, location, sos, admin, map, realtime };
}
