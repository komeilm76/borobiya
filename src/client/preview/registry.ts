/**
 * The single source of truth for the visual preview catalog.
 *
 * Every entry is a real route of the application rendered by the real client bundle with
 * deterministic fake data. Nothing appears here because it "should" exist — each page was
 * confirmed to be implemented in this branch. Statuses:
 *
 * - `ready`:     page renders end to end; awaiting HUMAN visual review (never auto-approved).
 * - `partial`:   page renders but a real limitation is listed in `limitation` / `missing`.
 * - `not_ready`: page cannot be usefully reviewed yet; `missing` says why.
 *
 * Visual approval is recorded only by the owner after review — this registry never sets it.
 */

export type PreviewStatus = 'ready' | 'partial' | 'not_ready';
export type PreviewPersona = 'user' | 'admin' | 'onboarding' | 'anon';
export type PreviewSection = 'auth' | 'user' | 'admin';

export interface PreviewPage {
  /** Stable identifier used by the catalog and reports. */
  id: string;
  /** Persian page name. */
  name: string;
  /** Product section. */
  section: PreviewSection;
  /** Router path the preview opens (history base `/app/` is prepended by the catalog). */
  route: string;
  /** Which demo persona the catalog links should use. */
  persona: PreviewPersona;
  status: PreviewStatus;
  /** One line: what the reviewer can exercise here. */
  summary: string;
  /** Concrete review checklist for this screen. */
  testHints: string[];
  /** Honest limitations / what is missing; required for partial and not_ready pages. */
  limitation?: string;
  missing?: string[];
}

export const SECTION_LABELS: Record<PreviewSection, string> = {
  auth: 'ورود و عضویت',
  user: 'تجربهٔ کاربر',
  admin: 'کنسول مدیریت'
};

export const STATUS_LABELS: Record<PreviewStatus, string> = {
  ready: 'آمادهٔ بازبینی',
  partial: 'پیاده‌سازی ناقص',
  not_ready: 'آماده نیست'
};

export const PREVIEW_PAGES: PreviewPage[] = [
  /* ------------------------------------------------ ورود و عضویت */
  {
    id: 'login', name: 'ورود', section: 'auth', route: '/_auth/login', persona: 'anon', status: 'ready',
    summary: 'فرم ورود با حساب نمایشی؛ پذیرش هر رمز عبور و ورود واقعی به نقشه.',
    testHints: ['ورود با saeed.k', 'ورود با admin', 'پیام خطای فیلد خالی', 'حالت تاریک/روشن']
  },
  {
    id: 'register', name: 'ثبت‌نام', section: 'auth', route: '/_auth/register', persona: 'anon', status: 'ready',
    summary: 'فرم ثبت‌نام با پنج پاسخ امنیتی کاتالوگ محور.',
    testHints: ['تکمیل فرم کامل', 'عدم تطابق تکرار رمز', 'انتخاب پنج سؤال متمایز']
  },
  {
    id: 'recovery', name: 'بازیابی رمز عبور', section: 'auth', route: '/_auth/recovery', persona: 'anon', status: 'ready',
    summary: 'جریان سه‌مرحله‌ای بازیابی: شناسایی حساب، پاسخ به سؤالات، تعیین رمز جدید.',
    testHints: ['نام کاربری نمایشی leila.n', 'پاسخ هر سه سؤال', 'رمز جدید و تأیید آن']
  },
  {
    id: 'onboarding', name: 'تکمیل پرسش‌های امنیتی', section: 'auth', route: '/_auth/onboarding', persona: 'onboarding', status: 'ready',
    summary: 'فردی با سؤالات امنیتی ناقص وارد نقشه نمی‌شود و اینجا کامل می‌کند.',
    testHints: ['پر کردن پنج پاسخ', 'بازگشت خودکار به نقشه پس از تکمیل']
  },

  /* ------------------------------------------------ تجربهٔ کاربر */
  {
    id: 'map', name: 'نقشه', section: 'user', route: '/_user/map', persona: 'user', status: 'ready',
    summary: 'نقشهٔ آفلاین با کاشی‌های برداری ساختگی، نشانگر مکان‌های ذخیره‌شده و برگهٔ پایینی.',
    testHints: ['جابجایی و زوم نقشه', 'باز کردن برگهٔ پایینی', 'جست‌وجوی POI', 'افکت RTL و تراز فارسی'],
    limitation: 'موقعیت زندهٔ واقعی با GPS مرورگر کار می‌کند؛ در پیش‌نمایش هیچ fix واقعی وجود ندارد.'
  },
  {
    id: 'sos', name: 'درخواست امداد', section: 'user', route: '/_user/sos', persona: 'user', status: 'ready',
    summary: 'درخواست فعال در حال اعزام (رانندگی رضا) + فرم چهارمرحله‌ای ثبت درخواست جدید.',
    testHints: ['نمایش درخواست فعال', 'لغو درخواست فعال با دلیل کاتالوگ', 'ساخت درخواست آزمایشی چهارمرحله‌ای', 'آپلود عکس (اختیاری)']
  },
  {
    id: 'mission', name: 'مأموریت', section: 'user', route: '/_user/mission', persona: 'user', status: 'ready',
    summary: 'ماموریت فعال پذیرفته‌شده (پزشکی) + پیشنهاد اعزام آتش‌سوزی + تیم و درخواست نیرو.',
    testHints: ['پذیرش/رد پیشنهاد اعزام', 'دکمه‌های «رسیدم» و «شروع رسیدگی»', 'پنل تیم و درخواست نیروی کمکی', 'فرم ارزیابی مأموریت تکمیل‌شده']
  },
  {
    id: 'talk', name: 'گفت‌وگوی صوتی', section: 'user', route: '/_user/talk', persona: 'user', status: 'partial',
    summary: 'رابط Push-to-Talk با دکمهٔ فشاری و فهرست مخاطبان.',
    testHints: ['چیدمان رابط کاربری', 'حالت فشاری دکمه'],
    limitation: 'مسیر صدا و WebSocket در پیش‌نمایش وجود ندارد؛ گفت‌وگوی واقعی با سرور و هم‌رده نیاز دارد.',
    missing: ['اتصال WebSocket واقعی و تبادل فریم صوتی', 'آزمایش پایان‌به‌پایان با یک هم‌رده']
  },
  {
    id: 'sharing', name: 'مرکز اشتراک‌گذاری', section: 'user', route: '/_user/sharing', persona: 'user', status: 'ready',
    summary: 'اشتراک زندهٔ خروجی و دریافتی + اشتراک تاریخچه؛ جست‌وجوی هم‌رده و لغو اشتراک.',
    testHints: ['ساخت اشتراک زندهٔ جدید', 'لغو اشتراک فعال', 'زبانهٔ دریافتی/ارسالی و فیلتر جهت', 'اشتراک تاریخچهٔ منقضی‌شده']
  },
  {
    id: 'history', name: 'تاریخچه', section: 'user', route: '/_user/history', persona: 'user', status: 'ready',
    summary: 'سفرها / مأموریت‌ها / به‌اشتراک‌گذاشته‌ها با گروه‌بندی بر اساس روز و گسترش درون‌خط.',
    testHints: ['سه زبانه و شمارنده‌ها', 'گسترش یک درخواست امداد (timeline)', 'گسترش سفر تکمیل‌شده', 'ساخت اشتراک تاریخچه از یک رکورد', 'تکرار سفر از روی توقف‌ها'],
    limitation: 'پخش مسیر ثبت‌شده هنوز وجود ندارد؛ سفر نمونه بدون مسیر واقعی نمایش داده می‌شود. (بازهٔ جای‌گزینی برای کار تأییدشدهٔ «ثبت مسیر»)'
  },
  {
    id: 'trips', name: 'سفرها', section: 'user', route: '/_user/trips', persona: 'user', status: 'ready',
    summary: 'فهرست سفرها با توقف‌های روی نقشه، ساخت سفر جدید، دعوت و پذیرش عضویت.',
    testHints: ['باز کردن جزئیات سفر تکمیل‌شده', 'ساخت سفر آزمایشی', 'صندوق دعوت‌ها و پذیرش مانور', 'فیلتر «فقط ذخیره‌شده‌ها»']
  },
  {
    id: 'profile', name: 'نمایه', section: 'user', route: '/_user/profile', persona: 'user', status: 'ready',
    summary: 'وضعیت آمادگی، حساب، دستگاه‌ها و نشست‌های فعال، سوابق ورود و نمرهٔ میانگین.',
    testHints: ['تغییر نام کاربری (نمایشی)', 'لغو نشست گوشی اندروید', 'فهرست سوابق ورود', 'کلید آمادهٔ مأموریت']
  },

  /* ------------------------------------------------ کنسول مدیریت */
  {
    id: 'adminOverview', name: 'نمای کلی عملیات', section: 'admin', route: '/_admin/overview', persona: 'admin', status: 'ready',
    summary: 'شاخص‌های امروز، روند هفت‌روزه، توزیع وضعیت و درخواست‌های اخیر.',
    testHints: ['کارت‌های KPI', 'نمودار روند', 'جدول آخرین درخواست‌ها', 'گروه‌ها و هشدارهای باز']
  },
  {
    id: 'adminDispatch', name: 'تابلوی اعزام', section: 'admin', route: '/_admin/dispatch', persona: 'admin', status: 'ready',
    summary: 'صف درخواست‌های باز، نزدیک‌ترین امدادگران، اعزام گروهی و اعزام تیمی با ترکیب نیرو.',
    testHints: ['انتخاب نزدیک‌ترین امدادگر', 'حالت تیم و ساخت ترکیب', 'حالت offer در برابر immediate', 'بازخورد پس از اعزام']
  },
  {
    id: 'adminSupportRequests', name: 'درخواست‌های نیرو', section: 'admin', route: '/_admin/support-requests', persona: 'admin', status: 'ready',
    summary: 'صف بازبینی درخواست نیرو با نامزدهای مجاز و تصمیم تأیید/رد/جزئی.',
    testHints: ['باز کردن درخواست pending', 'فهرست نامزدها و دلیل عدم صلاحیت', 'ثبت تصمیم تأیید', 'فیلتر وضعیت']
  },
  {
    id: 'adminReports', name: 'گزارش‌ها', section: 'admin', route: '/_admin/reports', persona: 'admin', status: 'ready',
    summary: 'توزیع وضعیت درخواست‌ها و خروجی CSV ساختگی (کاربران و رویدادها).',
    testHints: ['نمودار توزیع وضعیت', 'دانلود CSV کاربران (ساختگی)', 'دانلود CSV رویدادها (ساختگی)'],
    limitation: 'گزارش‌ساز پیشرفته وجود ندارد؛ این صفحه فقط توزیع وضعیت و دو خروجی CSV دارد.'
  },
  {
    id: 'adminUsers', name: 'کاربران', section: 'admin', route: '/_admin/users', persona: 'admin', status: 'ready',
    summary: 'فهرست کاربران با جست‌وجو، فیلتر نقش/وضعیت، فعال‌سازی و تغییر نقش.',
    testHints: ['جست‌وجوی نام کاربری', 'فیلتر نقش responder', 'تغییر وضعیت یک حساب (نمایشی)']
  },
  {
    id: 'adminGroups', name: 'گروه‌های خدمت', section: 'admin', route: '/_admin/groups', persona: 'admin', status: 'ready',
    summary: 'گروه‌ها با ظرفیت، رنگ، پوشش حادثه و اعضا؛ ساخت و ویرایش گروه.',
    testHints: ['گروه‌های موجود و اعضا', 'ساخت گروه جدید (نمایشی)', 'تغییر ظرفیت']
  },
  {
    id: 'adminIncidents', name: 'انواع حادثه', section: 'admin', route: '/_admin/incidents', persona: 'admin', status: 'ready',
    summary: 'کاتالوگ رنگ‌های استاندارد حادثه (فقط خواندنی).',
    testHints: ['رنگ‌ها و آیکون‌ها', 'ترتیب رتبه‌بندی']
  },
  {
    id: 'adminJobTypes', name: 'انواع شغل', section: 'admin', route: '/_admin/job-types', persona: 'admin', status: 'ready',
    summary: 'کاتالوگ شغل‌ها با سیاست ارائه (همه/فقط آماده‌ها) و شمار اعضا.',
    testHints: ['سیاست ready_only در پارامدیک', 'غیرفعال‌کردن مدیر امداد', 'ساخت نوع شغل جدید (نمایشی)']
  },
  {
    id: 'adminAudit', name: 'رویدادهای سیستم', section: 'admin', route: '/_admin/audit', persona: 'admin', status: 'ready',
    summary: 'گزارش حسابرسی با جست‌وجو و خروجی CSV ساختگی.',
    testHints: ['جست‌وجوی یک کنش', 'دانلود CSV (ساختگی)', 'ستون‌های عامل/هدف/IP']
  },
  {
    id: 'adminAlerts', name: 'هشدارها', section: 'admin', route: '/_admin/alerts', persona: 'admin', status: 'ready',
    summary: 'هشدارهای عملیاتی (آفلاین بودن امدادگر، موقعیت کهنه) و رفع هشدار.',
    testHints: ['هشدارهای باز در برابر رفع‌شده', 'دکمهٔ رفع هشدار (نمایشی)', 'سطح‌های severity']
  },
  {
    id: 'adminSettings', name: 'تنظیمات سامانه', section: 'admin', route: '/_admin/settings', persona: 'admin', status: 'ready',
    summary: 'پارامترهای عملیاتی: شعاع اعزام، TTL پیشنهاد، آستانهٔ آفلاین بودن.',
    testHints: ['ویرایش مقدار و ذخیرهٔ نمایشی', 'انواع مقادیر عددی']
  }
];

export const previewCounts = {
  total: PREVIEW_PAGES.length,
  ready: PREVIEW_PAGES.filter((p) => p.status === 'ready').length,
  partial: PREVIEW_PAGES.filter((p) => p.status === 'partial').length,
  notReady: PREVIEW_PAGES.filter((p) => p.status === 'not_ready').length
} as const;
