import { ApiError } from "./http";

const localizedApiErrors: Record<string, string> = {
  ACCOUNT_INACTIVE: "این حساب غیرفعال است. برای راهنمایی با پشتیبانی تماس بگیرید.",
  ACCOUNT_SUSPENDED: "این حساب موقتاً محدود شده است. برای راهنمایی با پشتیبانی تماس بگیرید.",
  ADMIN_REQUIRED: "دسترسی مدیر برای این عملیات لازم است.",
  ALREADY_AUTHENTICATED: "ابتدا از حساب فعلی خارج شوید.",
  // Both mean "the row you were editing is gone" — usually a second browser tab. Naming the entity the
  // request was about is the whole point of the message, so the two codes are not folded into one line.
  CATEGORY_NOT_FOUND: "این گروه امدادگر دیگر وجود ندارد؛ فهرست را تازه کنید.",
  INCIDENT_TYPE_NOT_FOUND: "این نوع رویداد دیگر وجود ندارد؛ فهرست را تازه کنید.",
  INCIDENT_TYPE_SLUG_TAKEN: "این شناسه (slug) قبلاً برای نوع رویداد دیگری ثبت شده است.",
  INVALID_CREDENTIALS: "نام کاربری یا گذرواژه درست نیست.",
  INVALID_REFRESH: "نشست شما پایان یافته است؛ دوباره وارد شوید.",
  INVALID_RESET_TOKEN: "پیوند بازیابی معتبر نیست یا زمان آن به پایان رسیده است.",
  INVALID_SOS_STATUS: "وضعیت فعلی درخواست اضطراری اجازهٔ اعزام مجدد امدادگر را نمی‌دهد.",
  PHOTO_TOO_LARGE: "حجم تصویر ارسالی بیش از حد مجاز است.",
  PHOTO_URL_NOT_ACCEPTED: "تصویر حادثه باید پس از ثبت درخواست از مسیر بارگذاری تصویر ارسال شود.",
  PRIORITY_DEVICE_REQUIRED: "برای این اشتراک باید مشخص کنید کدام دستگاه زنده موقعیت بفرستد.",
  RATE_LIMITED: "درخواست‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید.",
  RECOVERY_UNAVAILABLE: "بازیابی گذرواژه موقتاً در دسترس نیست.",
  RESCUER_BUSY: "یک یا چند امدادگر انتخاب‌شده هم‌اکنون در مأموریت فعال دیگری هستند؛ فهرست را تازه کنید.",
  SECURITY_QUESTIONS_ALREADY_COMPLETED: "پرسش‌های امنیتی این حساب قبلاً تکمیل شده‌اند.",
  SECURITY_QUESTIONS_REQUIRED: "برای ادامه، ابتدا پرسش‌های امنیتی را تکمیل کنید.",
  SHARE_NOT_FOUND: "این اشتراک دیگر وجود ندارد؛ فهرست را تازه کنید.",
  SOS_REQUEST_NOT_FOUND: "این درخواست اضطراری یافت نشد؛ فهرست را تازه کنید.",
  TOO_MANY_PARTS: "در هر بارگذاری تنها یک فایل تصویر در فیلد photo مجاز است.",
  USER_NOT_FOUND: "کاربر مورد نظر یافت نشد؛ فهرست را تازه کنید.",
  USERNAME_TAKEN: "این نام کاربری قبلاً انتخاب شده است.",
  VALIDATION_ERROR: "اطلاعات واردشده را بررسی کنید.",
  WRONG_ANSWERS: "پاسخ‌ها با پرسش‌های این حساب مطابقت ندارند."
};

export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return localizedApiErrors[error.code] ?? fallback;
  if (error instanceof TypeError) return "ارتباط با سرویس برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.";
  return fallback;
}
