import { ApiError } from "./http";

const localizedApiErrors: Record<string, string> = {
  ACCOUNT_INACTIVE: "این حساب غیرفعال است. برای راهنمایی با پشتیبانی تماس بگیرید.",
  ACCOUNT_SUSPENDED: "این حساب موقتاً محدود شده است. برای راهنمایی با پشتیبانی تماس بگیرید.",
  ALREADY_AUTHENTICATED: "ابتدا از حساب فعلی خارج شوید.",
  INVALID_CREDENTIALS: "نام کاربری یا گذرواژه درست نیست.",
  INVALID_REFRESH: "نشست شما پایان یافته است؛ دوباره وارد شوید.",
  INVALID_RESET_TOKEN: "پیوند بازیابی معتبر نیست یا زمان آن به پایان رسیده است.",
  RATE_LIMITED: "درخواست‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید.",
  RECOVERY_UNAVAILABLE: "بازیابی گذرواژه موقتاً در دسترس نیست.",
  SECURITY_QUESTIONS_ALREADY_COMPLETED: "پرسش‌های امنیتی این حساب قبلاً تکمیل شده‌اند.",
  SECURITY_QUESTIONS_REQUIRED: "برای ادامه، ابتدا پرسش‌های امنیتی را تکمیل کنید.",
  USERNAME_TAKEN: "این نام کاربری قبلاً انتخاب شده است.",
  VALIDATION_ERROR: "اطلاعات واردشده را بررسی کنید.",
  WRONG_ANSWERS: "پاسخ‌ها با پرسش‌های این حساب مطابقت ندارند."
};

export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return localizedApiErrors[error.code] ?? fallback;
  if (error instanceof TypeError) return "ارتباط با سرویس برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.";
  return fallback;
}
