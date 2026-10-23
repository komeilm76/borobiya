import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { IncidentType, Severity, SosLocation } from "@shared/index";
import { createSosRequest, listSosIncidentTypes, uploadSosRequestPhoto } from "../api/sos";
import {
  buildSosCreatePayload,
  canSubmitSosDraft,
  gpsLocationDraft,
  manualLocationDraft,
  parseCoordinatePair,
  sosApiErrorMessage,
  sosDraftIssues,
  sosIssueMessage,
  validateSosPhoto,
  type SosFormDraft
} from "../sos/sos-form";

export interface GeolocationProvider {
  getCurrentPosition(
    success: (position: {
      coords: { latitude: number; longitude: number; accuracy?: number | null };
    }) => void,
    error?: (err: { code?: number; message?: string }) => void,
    options?: PositionOptions
  ): void;
}

export interface UseSosRequestOptions {
  accessToken: ComputedRef<string | null> | Ref<string | null>;
  ensureSession?: () => Promise<unknown>;
  geolocation?: () => GeolocationProvider | null;
}

function defaultGeolocation(): GeolocationProvider | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return navigator.geolocation;
}

/**
 * State machine for filing an emergency SOS request (`T3.2.4`).
 *
 * Critical reliability invariant: creating the SOS row (`POST /_user/sos/requests`) and attaching
 * optional photo evidence (`POST /_user/sos/requests/:id/photo`) are two separate network calls.
 * If step 1 succeeds (`201`) and step 2 fails on a weak field connection, `createdRequestId` is
 * retained so retrying uploads *only* the photo instead of filing duplicate emergency requests or
 * burning the user's `3 req/min` SOS rate-limit budget.
 */
export function useSosRequest(options: UseSosRequestOptions) {
  const incidentTypes = ref<IncidentType[]>([]);
  const loadingCatalog = ref(false);
  const catalogError = ref<string | null>(null);

  const severity = ref<Severity>("high");
  const incidentTypeId = ref("");
  const description = ref("");
  const location = ref<SosLocation | null>(null);
  const locating = ref(false);
  const locationHint = ref<string | null>(null);

  const photoFile = ref<(Blob & { name?: string }) | null>(null);
  const photoError = ref<string | null>(null);

  const submitting = ref(false);
  const submitError = ref<string | null>(null);
  const createdRequestId = ref<string | null>(null);
  const photoUploadedUrl = ref<string | null>(null);
  const awaitingPhotoRetry = ref(false);

  const draft = computed<SosFormDraft>(() => ({
    severity: severity.value,
    incidentTypeId: incidentTypeId.value,
    description: description.value,
    location: location.value,
    photo: photoFile.value
      ? {
          size: photoFile.value.size,
          type: photoFile.value.type,
          name: photoFile.value.name
        }
      : null
  }));

  const issues = computed(() => sosDraftIssues(draft.value));
  const canSubmit = computed(() => !submitting.value && !awaitingPhotoRetry.value && canSubmitSosDraft(draft.value));
  const isCompleted = computed(() => createdRequestId.value !== null && !awaitingPhotoRetry.value);

  async function loadCatalog(): Promise<void> {
    loadingCatalog.value = true;
    catalogError.value = null;
    try {
      const types = await listSosIncidentTypes();
      incidentTypes.value = types;
      if (!incidentTypeId.value && types.length > 0) {
        incidentTypeId.value = types[0]!.id;
      }
    } catch (error) {
      catalogError.value = sosApiErrorMessage(
        error,
        "دریافت فهرست نوع حوادث انجام نشد؛ دوباره تلاش کنید."
      );
    } finally {
      loadingCatalog.value = false;
    }
  }

  function requestGpsLocation(): void {
    const provider = (options.geolocation ?? defaultGeolocation)();
    if (!provider) {
      locating.value = false;
      locationHint.value =
        "مرورگر یا دستگاه دسترسی GPS ندارد؛ نقطهٔ حادثه را مستقیماً روی نقشه لمس کنید.";
      return;
    }

    locating.value = true;
    locationHint.value = null;
    provider.getCurrentPosition(
      (position) => {
        locating.value = false;
        const resolved = gpsLocationDraft(position.coords);
        if (!resolved) {
          locationHint.value = "موقعیت GPS معتبر نبود؛ نقطهٔ حادثه را روی نقشه انتخاب کنید.";
          return;
        }
        location.value = resolved;
      },
      () => {
        locating.value = false;
        locationHint.value =
          "دریافت خودکار موقعیت انجام نشد؛ لطفاً محل دقیق حادثه را روی نقشه لمس کنید یا مختصات را وارد کنید.";
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 }
    );
  }

  function setManualLocation(lat: number, lon: number): boolean {
    const next = manualLocationDraft(lat, lon);
    if (!next) {
      submitError.value = sosIssueMessage("location_invalid");
      return false;
    }
    location.value = next;
    locationHint.value = null;
    submitError.value = null;
    return true;
  }

  function setCoordinateInputs(latInput: string, lonInput: string): boolean {
    const next = parseCoordinatePair(latInput, lonInput);
    if (!next) {
      submitError.value = sosIssueMessage("location_invalid");
      return false;
    }
    location.value = next;
    locationHint.value = null;
    submitError.value = null;
    return true;
  }

  function selectPhoto(file: (Blob & { name?: string }) | null): boolean {
    photoError.value = null;
    if (!file) {
      photoFile.value = null;
      return true;
    }
    const issue = validateSosPhoto({
      size: file.size,
      type: file.type,
      name: file.name
    });
    if (issue) {
      photoFile.value = null;
      photoError.value = sosIssueMessage(issue.code);
      return false;
    }
    photoFile.value = file;
    return true;
  }

  function clearPhoto(): void {
    photoFile.value = null;
    photoError.value = null;
    if (awaitingPhotoRetry.value) {
      awaitingPhotoRetry.value = false;
    }
  }

  async function requireToken(): Promise<string | null> {
    if (options.ensureSession) await options.ensureSession();
    return options.accessToken.value;
  }

  async function submit(): Promise<boolean> {
    if (submitting.value) return false;
    submitError.value = null;

    if (awaitingPhotoRetry.value && createdRequestId.value) {
      return retryPhotoUpload();
    }

    const foundIssues = sosDraftIssues(draft.value);
    if (foundIssues.length > 0) {
      submitError.value = sosIssueMessage(foundIssues[0]!.code);
      return false;
    }

    const token = await requireToken();
    if (!token) {
      submitError.value = "برای ارسال درخواست امداد دوباره وارد حساب کاربری شوید.";
      return false;
    }

    submitting.value = true;
    try {
      const payload = buildSosCreatePayload(draft.value);
      const created = await createSosRequest(payload, token);
      createdRequestId.value = created.requestId;

      if (photoFile.value) {
        try {
          const uploaded = await uploadSosRequestPhoto(created.requestId, photoFile.value, token);
          photoUploadedUrl.value = uploaded.photoUrl;
          awaitingPhotoRetry.value = false;
        } catch (uploadError) {
          awaitingPhotoRetry.value = true;
          submitError.value = sosApiErrorMessage(
            uploadError,
            "درخواست امداد ثبت شد، اما ارسال تصویر انجام نشد. می‌توانید ارسال تصویر را دوباره تلاش کنید."
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      submitError.value = sosApiErrorMessage(
        error,
        "ثبت درخواست امداد انجام نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید."
      );
      return false;
    } finally {
      submitting.value = false;
    }
  }

  async function retryPhotoUpload(): Promise<boolean> {
    if (submitting.value || !createdRequestId.value || !photoFile.value) return false;
    submitError.value = null;

    const token = await requireToken();
    if (!token) {
      submitError.value = "برای ارسال تصویر دوباره وارد حساب کاربری شوید.";
      return false;
    }

    submitting.value = true;
    try {
      const uploaded = await uploadSosRequestPhoto(createdRequestId.value, photoFile.value, token);
      photoUploadedUrl.value = uploaded.photoUrl;
      awaitingPhotoRetry.value = false;
      return true;
    } catch (error) {
      awaitingPhotoRetry.value = true;
      submitError.value = sosApiErrorMessage(
        error,
        "ارسال دوبارهٔ تصویر انجام نشد. درخواست امداد شما همچنان ثبت و فعال است."
      );
      return false;
    } finally {
      submitting.value = false;
    }
  }

  function reset(): void {
    severity.value = "high";
    description.value = "";
    photoFile.value = null;
    photoError.value = null;
    submitError.value = null;
    createdRequestId.value = null;
    photoUploadedUrl.value = null;
    awaitingPhotoRetry.value = false;
  }

  function prepareForOpen(): void {
    if (incidentTypes.value.length === 0 && !loadingCatalog.value) {
      void loadCatalog();
    }
    if (!location.value && !locating.value) {
      requestGpsLocation();
    }
  }

  return {
    incidentTypes,
    loadingCatalog,
    catalogError,
    severity,
    incidentTypeId,
    description,
    location,
    locating,
    locationHint,
    photoFile,
    photoError,
    submitting,
    submitError,
    createdRequestId,
    photoUploadedUrl,
    awaitingPhotoRetry,
    issues,
    canSubmit,
    isCompleted,
    loadCatalog,
    requestGpsLocation,
    setManualLocation,
    setCoordinateInputs,
    selectPhoto,
    clearPhoto,
    submit,
    retryPhotoUpload,
    reset,
    prepareForOpen
  };
}
