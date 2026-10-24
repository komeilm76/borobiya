import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory
} from "vue-router";
import { pinia } from "../stores";
import { useAuthStore } from "../stores/auth";
import { createAuthGuard, type AuthGuardState } from "./guards";

export const routeRecords: RouteRecordRaw[] = [
  { path: "/", redirect: "/_public/landing" },
  {
    path: "/_public/landing",
    name: "public-landing",
    component: () => import("@client/views/_public/PlaceholderView.vue"),
    props: {
      title: "خانه",
      description: "بوروبیا پیوندی امن میان مردم و گروه‌های امدادی محلی است؛ برای روزهایی که کنار هم بودن اهمیت دارد.",
      icon: "mdi-home-heart"
    }
  },
  {
    path: "/_public/health",
    name: "public-health",
    component: () => import("@client/views/_public/PlaceholderView.vue"),
    props: {
      title: "وضعیت سرویس",
      description: "نمایی ساده از در دسترس بودن سرویس‌های بوروبیا در این بخش قرار می‌گیرد.",
      icon: "mdi-heart-pulse"
    }
  },
  {
    path: "/_auth/login",
    name: "auth-login",
    component: () => import("@client/views/_auth/LoginView.vue")
  },
  {
    path: "/_auth/register",
    name: "auth-register",
    component: () => import("@client/views/_auth/RegisterView.vue")
  },
  {
    path: "/_auth/forgot-password",
    name: "auth-forgot-password",
    component: () => import("@client/views/_auth/ForgotPasswordView.vue")
  },
  {
    path: "/_user/complete-security-questions",
    name: "user-complete-security-questions",
    component: () => import("@client/views/_user/CompleteSecurityQuestionsView.vue")
  },
  {
    path: "/_user/dashboard",
    name: "user-dashboard",
    component: () => import("@client/views/_user/UserDashboardView.vue")
  },
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
  {
    path: "/_user/proposals",
    name: "user-proposals",
    component: () => import("@client/views/_user/UserProposalsView.vue")
  },
  {
    path: "/_user/sos-history",
    name: "user-sos-history",
    component: () => import("@client/views/_user/PlaceholderView.vue"),
    props: {
      title: "سوابق امداد",
      description: "درخواست‌ها و مأموریت‌های امدادی گذشته در این بخش مرور می‌شوند.",
      icon: "mdi-history"
    }
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
    component: () => import("@client/views/_public/PlaceholderView.vue"),
    props: {
      title: "صفحه پیدا نشد",
      description: "نشانی واردشده در برنامه وجود ندارد؛ می‌توانید از خانه دوباره شروع کنید.",
      icon: "mdi-map-marker-question-outline"
    }
  }
];

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
  auth: AuthGuardState = useAuthStore(pinia)
) {
  const router = createRouter({ history, routes: routeRecords });
  router.beforeEach(createAuthGuard(auth));
  return router;
}
