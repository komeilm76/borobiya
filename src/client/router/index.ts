import { createRouter, createWebHistory, type NavigationGuard, type RouteLocationNormalizedLoaded, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.ts';
import { ROLES } from '@shared/protocol.ts';

/** Layout a route renders into. */
type RouteLayout = 'auth' | 'map' | 'admin';

declare module 'vue-router' {
  interface RouteMeta {
    /** Layout shell used by the route. */
    layout: RouteLayout;
    /** Authentication requirement; `guest` routes redirect signed-in users away. */
    access: 'public' | 'guest' | 'user' | 'admin';
    /** Localised navigation label. */
    label?: string;
    /** MDI icon name for navigation entries. */
    icon?: string;
  }
}

/** Typed route names; every navigation in the application uses these constants. */
export const ROUTE_NAMES = Object.freeze({
  login: 'login',
  register: 'register',
  recovery: 'recovery',
  onboarding: 'onboarding',
  map: 'map',
  sos: 'sos',
  talk: 'talk',
  mission: 'mission',
  sharing: 'sharing',
  history: 'history',
  trips: 'trips',
  profile: 'profile',
  adminOverview: 'admin-overview',
  adminDispatch: 'admin-dispatch',
  adminSupportRequests: 'admin-support-requests',
  adminReports: 'admin-reports',
  adminUsers: 'admin-users',
  adminGroups: 'admin-groups',
  adminIncidents: 'admin-incidents',
  adminJobTypes: 'admin-job-types',
  adminAudit: 'admin-audit',
  adminAlerts: 'admin-alerts',
  adminSettings: 'admin-settings'
} as const);

type RouteName = (typeof ROUTE_NAMES)[keyof typeof ROUTE_NAMES];

/**
 * The route table. Views are lazily loaded so the initial shell stays small,
 * and each record declares its layout and access rule for the guard.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: ROUTE_NAMES.map }
  },
  {
    path: '/_auth/login',
    name: ROUTE_NAMES.login,
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { layout: 'auth', access: 'guest', label: 'ورود' }
  },
  {
    path: '/_auth/register',
    name: ROUTE_NAMES.register,
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { layout: 'auth', access: 'guest', label: 'ثبت‌نام' }
  },
  {
    path: '/_auth/recovery',
    name: ROUTE_NAMES.recovery,
    component: () => import('@/views/auth/RecoveryView.vue'),
    meta: { layout: 'auth', access: 'guest', label: 'بازیابی رمز' }
  },
  {
    path: '/_auth/onboarding',
    name: ROUTE_NAMES.onboarding,
    component: () => import('@/views/auth/OnboardingView.vue'),
    meta: { layout: 'auth', access: 'user', label: 'تکمیل پرسش‌های امنیتی' }
  },
  {
    path: '/_user/map',
    name: ROUTE_NAMES.map,
    component: () => import('@/views/map/MapView.vue'),
    meta: { layout: 'map', access: 'user', label: 'نقشه', icon: 'routes' }
  },
  {
    path: '/_user/sos',
    name: ROUTE_NAMES.sos,
    component: () => import('@/views/map/SosView.vue'),
    meta: { layout: 'map', access: 'user', label: 'درخواست امداد', icon: 'alarm-light' }
  },
  {
    path: '/_user/talk',
    name: ROUTE_NAMES.talk,
    component: () => import('@/views/map/TalkView.vue'),
    meta: { layout: 'map', access: 'user', label: 'گفت‌وگو', icon: 'microphone' }
  },
  {
    path: '/_user/mission',
    name: ROUTE_NAMES.mission,
    component: () => import('@/views/map/MissionView.vue'),
    meta: { layout: 'map', access: 'user', label: 'مأموریت', icon: 'web' }
  },
  {
    path: '/_user/sharing',
    name: ROUTE_NAMES.sharing,
    component: () => import('@/views/map/SharingCenterView.vue'),
    meta: { layout: 'map', access: 'user', label: 'اشتراک‌گذاری', icon: 'share-variant' }
  },
  {
    path: '/_user/history',
    name: ROUTE_NAMES.history,
    component: () => import('@/views/map/HistoryView.vue'),
    meta: { layout: 'map', access: 'user', label: 'تاریخچه', icon: 'history' }
  },
  {
    path: '/_user/trips',
    name: ROUTE_NAMES.trips,
    component: () => import('@/views/map/TripsView.vue'),
    meta: { layout: 'map', access: 'user', label: 'سفرها', icon: 'map-marker-path' }
  },
  {
    path: '/_user/profile',
    name: ROUTE_NAMES.profile,
    component: () => import('@/views/map/ProfileView.vue'),
    meta: { layout: 'map', access: 'user', label: 'نمایه', icon: 'account' }
  },
  {
    path: '/_admin/overview',
    name: ROUTE_NAMES.adminOverview,
    component: () => import('@/views/admin/OverviewView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'نمای کلی', icon: 'view-dashboard-outline' }
  },
  {
    path: '/_admin/dispatch',
    name: ROUTE_NAMES.adminDispatch,
    component: () => import('@/views/admin/DispatchView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'اعزام', icon: 'bullseye-arrow' }
  },
  {
    path: '/_admin/support-requests',
    name: ROUTE_NAMES.adminSupportRequests,
    component: () => import('@/views/admin/SupportRequestsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'درخواست‌های نیرو', icon: 'account-multiple-check-outline' }
  },
  {
    path: '/_admin/reports',
    name: ROUTE_NAMES.adminReports,
    component: () => import('@/views/admin/ReportsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'گزارش‌ها', icon: 'file-chart-outline' }
  },
  {
    path: '/_admin/users',
    name: ROUTE_NAMES.adminUsers,
    component: () => import('@/views/admin/UsersView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'کاربران', icon: 'account-multiple-outline' }
  },
  {
    path: '/_admin/groups',
    name: ROUTE_NAMES.adminGroups,
    component: () => import('@/views/admin/GroupsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'گروه‌ها', icon: 'account-group-outline' }
  },
  {
    path: '/_admin/incidents',
    name: ROUTE_NAMES.adminIncidents,
    component: () => import('@/views/admin/IncidentsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'نوع حادثه', icon: 'alert-circle-outline' }
  },
  {
    path: '/_admin/job-types',
    name: ROUTE_NAMES.adminJobTypes,
    component: () => import('@/views/admin/JobTypesView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'نوع شغل', icon: 'briefcase-account-outline' }
  },
  {
    path: '/_admin/audit',
    name: ROUTE_NAMES.adminAudit,
    component: () => import('@/views/admin/AuditView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'رویدادها', icon: 'clipboard-text-outline' }
  },
  {
    path: '/_admin/alerts',
    name: ROUTE_NAMES.adminAlerts,
    component: () => import('@/views/admin/AlertsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'هشدارها', icon: 'bell-alert-outline' }
  },
  {
    path: '/_admin/settings',
    name: ROUTE_NAMES.adminSettings,
    component: () => import('@/views/admin/SettingsView.vue'),
    meta: { layout: 'admin', access: 'admin', label: 'تنظیمات', icon: 'wrench-outline' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: ROUTE_NAMES.login }
  }
];

/** Application router instance. The preview bundle is mounted under `/app/`. */
const previewBase = import.meta.env.VITE_PREVIEW_DEMO === 'true' ? '/app/' : '/';
export const router = createRouter({
  history: createWebHistory(previewBase),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

/**
 * Resolves the landing route for a role, which keeps redirects consistent everywhere.
 *
 * @param role Account role, or undefined for anonymous visitors.
 * @param mustOnboard Whether the account still has to answer security questions.
 * @returns The route name to navigate to.
 */
export function landingRoute(role: string | undefined, mustOnboard: boolean): RouteName {
  if (mustOnboard) return ROUTE_NAMES.onboarding;
  if (role === ROLES.ADMIN) return ROUTE_NAMES.adminOverview;
  return ROUTE_NAMES.map;
}

/**
 * The navigation guard, exported so the role/onboarding matrix can be pinned down directly
 * instead of only through the mounted shell.
 *
 * @param to The target route.
 * @returns `true` to continue, or a redirect to a named route.
 */
export async function authGuard(
  to: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'>
): Promise<true | { name: RouteName }> {
  const auth = useAuthStore();
  let user = auth.user;
  if (!user && !auth.loading) user = await auth.refresh();
  const access = to.meta.access;
  if (access === 'guest' && user) {
    if (user.mustCompleteSecurityQuestions) return { name: ROUTE_NAMES.onboarding };
    return { name: landingRoute(user.role, false) };
  }
  if (access === 'user') {
    if (!user) return { name: ROUTE_NAMES.login };
    if (user.mustCompleteSecurityQuestions && to.name !== ROUTE_NAMES.onboarding) return { name: ROUTE_NAMES.onboarding };
    if (user.role === ROLES.ADMIN && to.meta.layout === 'map') return { name: ROUTE_NAMES.adminOverview };
  }
  if (access === 'admin') {
    if (!user) return { name: ROUTE_NAMES.login };
    if (user.role !== ROLES.ADMIN) return { name: ROUTE_NAMES.map };
  }
  return true;
}

router.beforeEach(authGuard as NavigationGuard);

/** Exported for tests that assert the guard table without mounting the app. */
export function routeTable(): Array<{ path: string; name: string; access: string; layout: string }> {
  return routes
    .filter((route): route is RouteRecordRaw & { name: string; meta: { access: string; layout: string } } => Boolean(route.name && route.meta))
    .map((route) => ({ path: route.path, name: route.name, access: route.meta.access, layout: route.meta.layout }));
}
