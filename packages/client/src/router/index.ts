import { watch } from "vue";
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory
} from "vue-router";
import { checkPostLoginAssignment } from "./post-login";
import { pinia } from "../stores";
import { useAuthStore } from "../stores/auth";
import { createAuthGuard, isGuestOnlyPath, resolvePostLoginDestinationAfterMissionCheck, type AssignmentStatus, type AuthGuardState } from "./guards";

export const routeRecords: RouteRecordRaw[] = [
  { path: "/", redirect: "/_public/landing" },
  {
    path: "/_public/landing",
    name: "public-landing",
    component: () => import("@client/views/_public/PublicLandingView.vue")
  },
  {
    path: "/_public/health",
    name: "public-health",
    component: () => import("@client/views/_public/PublicHealthView.vue")
  },
  {
    path: "/_auth/login",
    alias: "/auth/login",
    name: "auth-login",
    component: () => import("@client/views/_auth/LoginView.vue")
  },
  {
    path: "/_auth/register",
    alias: "/auth/register",
    name: "auth-register",
    component: () => import("@client/views/_auth/RegisterView.vue")
  },
  {
    path: "/_auth/forgot-password",
    alias: "/auth/forgot-password",
    name: "auth-forgot-password",
    component: () => import("@client/views/_auth/ForgotPasswordView.vue")
  },
  {
    path: "/_user/complete-security-questions",
    name: "user-complete-security-questions",
    component: () => import("@client/views/_user/CompleteSecurityQuestionsView.vue")
  },
  // Old bookmarks remain safe but no longer load separate dashboard/proposals pages.
  { path: "/_user/dashboard", redirect: "/_user/map" },
  { path: "/_user/proposals", redirect: (to) => ({
    path: "/_user/map",
    query: typeof to.query.offer === "string" ? { offer: to.query.offer } : {}
  }) },
  {
    path: "/_user/map",
    name: "user-map",
    component: () => import("@client/views/_user/UserMapView.vue")
  },
  {
    path: "/_user/location-shares",
    name: "user-location-shares",
    component: () => import("@client/views/_user/UserLocationSharesView.vue")
  },
  // Bookmarks now enter the mission mode of the one persistent map workspace.
  { path: "/_user/mission", redirect: (to) => ({ path: "/_user/map", query: { ...to.query, tab: "missions" } }) },
  {
    path: "/_user/sos-history",
    name: "user-sos-history",
    component: () => import("@client/views/_user/UserSosHistoryView.vue")
  },
  {
    path: "/_user/mission-history",
    name: "user-mission-history",
    component: () => import("@client/views/_user/UserRescuerHistoryView.vue")
  },
  {
    path: "/_user/settings",
    name: "user-settings",
    component: () => import("@client/views/_user/PlaceholderView.vue"),
    props: {
      title: "تنظیمات",
      description: "تنظیمات حساب، دسترس‌پذیری و ترجیحات برنامه در این صفحه جمع می‌شوند.",
      icon: "mdi-cog-outline"
    }
  },
  {
    path: "/_user/devices",
    name: "user-devices",
    component: () => import("@client/views/_user/UserDevicesView.vue")
  },
  {
    path: "/_admin/dashboard",
    name: "admin-dashboard",
    component: () => import("@client/views/_admin/PlaceholderView.vue"),
    props: {
      title: "پیشخوان مدیریت",
      description: "نمای کلی کاربران، درخواست‌ها و وضعیت سامانه برای مدیران در این صفحه قرار می‌گیرد.",
      icon: "mdi-view-dashboard"
    }
  },
  {
    path: "/_admin/users",
    name: "admin-users",
    component: () => import("@client/views/_admin/AdminUsersView.vue")
  },
  {
    path: "/_admin/categories",
    name: "admin-categories",
    component: () => import("@client/views/_admin/AdminCategoriesView.vue")
  },
  {
    path: "/_admin/incidents",
    name: "admin-incidents",
    // T3.1.5 replaced this placeholder; the copy here used to call the incident-type catalog
    // "گزارش‌های امدادی" (rescue reports), which is a different thing and was wrong on the screen.
    component: () => import("@client/views/_admin/AdminIncidentsView.vue")
  },
  {
    path: "/_admin/dispatch",
    name: "admin-dispatch",
    component: () => import("@client/views/_admin/AdminDispatchView.vue")
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@client/views/_public/PublicNotFoundView.vue")
  }
];

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
  auth: AuthGuardState = useAuthStore(pinia),
  checkAssignment: () => Promise<AssignmentStatus> = checkPostLoginAssignment
) {
  const router = createRouter({ history, routes: routeRecords });
  router.beforeEach(createAuthGuard(auth, checkAssignment));
  // A guard runs only when navigation occurs. A session can also arrive while a guest
  // view is already open (e.g. a late cookie refresh); don't leave that view visible.
  watch(
    // Include the route: a fast refresh may finish before the first guest
    // navigation commits, so watching auth alone could leave login visible.
    () => [auth.isAuthenticated, auth.mustCompleteSecurityQuestions, auth.user?.role,
      router.currentRoute.value.fullPath] as const,
    ([authenticated, onboarding, role]) => {
      // A bearer can arrive before the /me profile on slow connections. Wait
      // for a verified role before leaving the guest screen; a later profile
      // recovery must trigger this watcher even if the bearer did not change.
      if (!authenticated || !role) return;
      const current = router.currentRoute.value;
      if (onboarding && current.path !== "/_user/complete-security-questions") {
        void router.replace("/_user/complete-security-questions");
      } else if (isGuestOnlyPath(current.path)) {
        const currentUser = auth.user;
        void resolvePostLoginDestinationAfterMissionCheck(current.query.redirect, auth, checkAssignment).then((destination) => {
          // Do not override a newer navigation or a logout while the lookup was in flight.
          if (router.currentRoute.value.fullPath === current.fullPath && auth.isAuthenticated && auth.user === currentUser &&
            !auth.mustCompleteSecurityQuestions) void router.replace(destination);
        });
      }
    },
    { flush: "post" }
  );
  return router;
}
