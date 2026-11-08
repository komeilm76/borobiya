/** Stable catalog values shared by the database seed and the browser. UI labels follow the Persian reference designs. */
export interface CatalogItem {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  requiresText?: boolean;
}

export const SECURITY_QUESTIONS: CatalogItem[] = [
  { id: 'sq_childhood', label: 'نام نخستین معلم شما چه بود؟' },
  { id: 'sq_pet', label: 'نام نخستین حیوان خانگی شما چه بود؟' },
  { id: 'sq_city', label: 'شهر محل تولد مادر شما کجاست؟' },
  { id: 'sq_book', label: 'عنوان نخستین کتابی که خریدید چه بود؟' },
  { id: 'sq_friend', label: 'نام بهترین دوست دوران کودکی شما چه بود؟' }
];

export const INCIDENT_TYPES: CatalogItem[] = [
  { id: 'inc_medical', label: 'پزشکی', icon: 'medical-bag', color: '#AF3438' },
  { id: 'inc_fire', label: 'آتشسوزی', icon: 'fire', color: '#B35A18' },
  { id: 'inc_road', label: 'حادثه رانندگی', icon: 'car-emergency', color: '#8C5609' },
  { id: 'inc_flood', label: 'سیل و آبگرفتگی', icon: 'home-flood', color: '#316D86' },
  { id: 'inc_other', label: 'سایر موارد', icon: 'lifebuoy', color: '#0E6666' }
];

export const CANCELLATION_REASONS: CatalogItem[] = [
  { id: 'cancel_resolved', label: 'مشکل خودبهخود حل شد' },
  { id: 'cancel_mistake', label: 'درخواست اشتباهی ثبت شد' },
  { id: 'cancel_other_help', label: 'کمک از مسیر دیگری رسید' },
  { id: 'cancel_location', label: 'موقعیت اشتباه انتخاب شد' },
  { id: 'cancel_other', label: 'سایر', requiresText: true }
];

export const DEFAULT_GROUPS: Array<{ id: string; name: string; color: string; capacity: number; incidentIds: string[] }> = [
  { id: 'grp_medical', name: 'گروه امداد پزشکی', color: '#AF3438', capacity: 24, incidentIds: ['inc_medical', 'inc_road'] },
  { id: 'grp_fire', name: 'گروه آتشنشانی', color: '#B35A18', capacity: 18, incidentIds: ['inc_fire'] },
  { id: 'grp_urban', name: 'گروه امداد شهری', color: '#316D86', capacity: 30, incidentIds: ['inc_flood', 'inc_other'] }
];

export const DEMO_USERS = [
  { id: 'usr_admin', username: 'admin', role: 'admin' },
  { id: 'usr_requester', username: 'saeed.k', role: 'user' },
  { id: 'usr_responder', username: 'reza.m', role: 'responder' },
  { id: 'usr_companion', username: 'maryam.a', role: 'user' }
] as const;
