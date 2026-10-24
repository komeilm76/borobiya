import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { Mission } from "@shared/index";
import { getMission, rateMission } from "../api/mission";
import { ApiError } from "../api/http";
import { sosApiErrorMessage } from "../sos/sos-form";

/** Requester-only rating state; never carry a stale response into another mission/account. */
export function useMissionRating(mission: Ref<Mission | null>, token: Ref<string | null>,
  userId: Ref<string | null>, ensureSession?: () => Promise<unknown>) {
  const rating = ref<number | null>(null);
  const score = ref(0);
  const comment = ref("");
  const loading = ref(false);
  const loaded = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);
  let generation = 0;
  const eligible = computed(() => mission.value?.status === "completed" &&
    mission.value.requesterId === userId.value && !!token.value);
  const canSubmit = computed(() => eligible.value && loaded.value && rating.value === null && !loading.value && !submitting.value &&
    Number.isInteger(score.value) && score.value >= 1 && score.value <= 5 && comment.value.trim().length <= 500);

  async function load(): Promise<void> {
    const current = ++generation;
    rating.value = null;
    loaded.value = false;
    score.value = 0;
    comment.value = "";
    error.value = null;
    loading.value = false;
    submitting.value = false;
    if (!eligible.value) return;
    const id = mission.value!.id;
    const owner = userId.value;
    loading.value = true;
    try {
      await ensureSession?.();
      if (!token.value || userId.value !== owner || mission.value?.id !== id || generation !== current) return;
      const detail = await getMission(token.value, id);
      if (generation === current && userId.value === owner && mission.value?.id === id) {
        rating.value = detail.rating;
        loaded.value = true;
      }
    } catch (cause) {
      if (generation === current) error.value = sosApiErrorMessage(cause, "دریافت امتیاز مأموریت انجام نشد.");
    } finally {
      if (generation === current) loading.value = false;
    }
  }

  async function submit(): Promise<void> {
    if (!canSubmit.value || !mission.value || !token.value) return;
    const current = generation;
    const id = mission.value.id;
    const owner = userId.value;
    const chosen = score.value;
    submitting.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      if (!token.value || userId.value !== owner || mission.value?.id !== id || generation !== current) return;
      await rateMission(token.value, id, { rating: chosen, ...(comment.value.trim() ? { comment: comment.value.trim() } : {}) });
      if (generation === current && userId.value === owner && mission.value?.id === id) rating.value = chosen;
    } catch (cause) {
      if (generation !== current || userId.value !== owner || mission.value?.id !== id) return;
      if (cause instanceof ApiError && cause.status === 409 && cause.code === "MISSION_ALREADY_RATED") {
        // A concurrent tab won the unique constraint: display the persisted score,
        // not the score from this rejected attempt.
        submitting.value = false;
        await load();
      } else error.value = sosApiErrorMessage(cause, "ثبت امتیاز انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      if (generation === current) submitting.value = false;
    }
  }

  // Access-token rotation for the same account is not a new mission. In particular,
  // ensureSession() can refresh the token during submit; watching its raw value
  // cancels that submission before it reaches the API. Logout/restoration still
  // invalidates the read through the presence bit, while userId scopes accounts.
  watch([() => mission.value?.id, () => mission.value?.status, () => Boolean(token.value), userId],
    () => { void load(); }, { immediate: true });
  onScopeDispose(() => { ++generation; });
  return { rating, score, comment, loading, loaded, submitting, error, eligible, canSubmit, load, submit };
}
