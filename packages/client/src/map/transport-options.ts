import type { TransportProfile } from "@/api/mission-routing";

export const transportOptions: readonly { value: TransportProfile; icon: string; label: string }[] = [
  { value: "car", icon: "mdi-car", label: "خودرو" },
  { value: "bicycle", icon: "mdi-bicycle", label: "دوچرخه" },
  { value: "foot", icon: "mdi-walk", label: "پیاده" }
];

export function transportLabel(profile: TransportProfile): string {
  return transportOptions.find((option) => option.value === profile)?.label ?? "وسیلهٔ انتخابی";
}
