import type { CancellationType } from "@borobiya/shared";

export type SecurityQuestionSeed = {
  id: string;
  text: string;
};

export type CancellationReasonSeed = {
  id: string;
  type: CancellationType;
  key: string;
  label: string;
  labelFa: string;
  requiresCustomText: boolean;
  isActive: boolean;
};

/** Public Persian-language prompts; answers themselves are never seeded or stored here. */
export const securityQuestionSeeds = [
  { id: "10000000-0000-4000-8000-000000000001", text: "نام اولین مدرسه‌ای که در آن تحصیل کردید چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000002", text: "نام اولین معلم شما چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000003", text: "نام اولین حیوان خانگی شما چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000004", text: "در کدام شهر متولد شدید؟" },
  { id: "10000000-0000-4000-8000-000000000005", text: "نام خیابانی که در کودکی در آن زندگی می‌کردید چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000006", text: "نام صمیمی‌ترین دوست دوران کودکی شما چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000007", text: "در کودکی شما را با چه لقبی صدا می‌کردند؟" },
  { id: "10000000-0000-4000-8000-000000000008", text: "اولین شغل شما چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000009", text: "نام اولین کتابی که به‌تنهایی خواندید چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000010", text: "غذای موردعلاقه شما در دوران کودکی چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000011", text: "نام نخستین مربی ورزشی شما چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000012", text: "نام نخستین همسایه‌ای که به یاد دارید چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000013", text: "در نوجوانی کدام سرگرمی را بیشتر دوست داشتید؟" },
  { id: "10000000-0000-4000-8000-000000000014", text: "نام نخستین گروه موسیقی یا خواننده موردعلاقه‌تان چه بود؟" },
  { id: "10000000-0000-4000-8000-000000000015", text: "نخستین سفری که بدون خانواده رفتید به کدام شهر بود؟" }
] as const satisfies readonly SecurityQuestionSeed[];

/** Keys are unique within each cancellation type, matching the API's scoped reason lists. */
export const cancellationReasonSeeds = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    type: "requester",
    key: "need_resolved",
    label: "Need no longer exists",
    labelFa: "دیگر نیازی به کمک نیست",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    type: "requester",
    key: "self_resolved",
    label: "I resolved the problem myself",
    labelFa: "مشکل را خودم حل کردم",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    type: "requester",
    key: "helped_by_other",
    label: "Someone else helped me",
    labelFa: "فرد دیگری به من کمک کرد",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    type: "requester",
    key: "mistaken_request",
    label: "Request was sent by mistake",
    labelFa: "درخواست به‌اشتباه ارسال شد",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    type: "requester",
    key: "other",
    label: "Other",
    labelFa: "سایر",
    requiresCustomText: true,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    type: "rescuer",
    key: "physical_inability",
    label: "Physical inability to reach location",
    labelFa: "به‌دلیل ناتوانی جسمی نمی‌توانم به محل برسم",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000007",
    type: "rescuer",
    key: "vehicle_breakdown",
    label: "Vehicle problem / breakdown",
    labelFa: "وسیله نقلیه دچار خرابی شده است",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000008",
    type: "rescuer",
    key: "personal_emergency",
    label: "Personal emergency",
    labelFa: "برای من یک وضعیت اضطراری پیش آمده است",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000009",
    type: "rescuer",
    key: "lack_of_expertise",
    label: "Insufficient expertise for this incident type",
    labelFa: "تخصص کافی برای رسیدگی به این نوع حادثه را ندارم",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000010",
    type: "rescuer",
    key: "unsafe_conditions",
    label: "Unsafe conditions at scene",
    labelFa: "شرایط محل حادثه ایمن نیست",
    requiresCustomText: false,
    isActive: true
  },
  {
    id: "20000000-0000-4000-8000-000000000011",
    type: "rescuer",
    key: "other",
    label: "Other",
    labelFa: "سایر",
    requiresCustomText: true,
    isActive: true
  }
] as const satisfies readonly CancellationReasonSeed[];
