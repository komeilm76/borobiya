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
  const latInput = ref("");
  const lonInput = ref("");
  const locating = ref(false);
  const locationHint = ref<string | null>(null);

  const photoFile = ref<(Blob & { name?: string }) | null>(null);
  const photoError = ref<string | null>(null);

  const submitting = ref(false);
  const submitError = ref<string | null>(null);
  const createdRequestId = ref<string | null>(null);
  const photoUploadedUrl = ref<string | null>(null);
  const awaitingPhotoRetry = ref(false);
  let gpsRequestId = 0;

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
  const canSubmit = computed(() => !submitting.value && createdRequestId.value === null && canSubmitSosDraft(draft.value));
  const isCompleted = computed(() => createdRequestId.value !== null && !submitting.value && !awaitingPhotoRetry.value);

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
    if (submitting.value) return;
    const currentGpsRequest = ++gpsRequestId;
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
        if (currentGpsRequest !== gpsRequestId) return;
        locating.value = false;
        const resolved = gpsLocationDraft(position.coords);
        if (!resolved) {
          locationHint.value = "موقعیت GPS معتبر نبود؛ نقطهٔ حادثه را روی نقشه انتخاب کنید.";
          return;
        }
        location.value = resolved;
        latInput.value = String(resolved.lat);
        lonInput.value = String(resolved.lon);
      },
      () => {
        if (currentGpsRequest !== gpsRequestId) return;
        locating.value = false;
        locationHint.value =
          "دریافت خودکار موقعیت انجام نشد؛ لطفاً محل دقیق حادثه را روی نقشه لمس کنید یا مختصات را وارد کنید.";
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 }
    );
  }

  function setManualLocation(lat: number, lon: number): boolean {
    if (submitting.value) return false;
    const next = manualLocationDraft(lat, lon);
    if (!next) {
      submitError.value = sosIssueMessage("location_invalid");
      return false;
    }
    gpsRequestId++;
    locating.value = false;
    location.value = next;
    latInput.value = String(next.lat);
    lonInput.value = String(next.lon);
    locationHint.value = null;
    submitError.value = null;
    return true;
  }

  function setCoordinateInputs(nextLatInput: string, nextLonInput: string): boolean {
    if (submitting.value) return false;
    gpsRequestId++;
    locating.value = false;
    latInput.value = nextLatInput;
    lonInput.value = nextLonInput;
    const next = parseCoordinatePair(nextLatInput, nextLonInput);
    if (!next) {
      location.value = null;
      submitError.value =
        nextLatInput.trim().length > 0 && nextLonInput.trim().length > 0
          ? sosIssueMessage("location_invalid")
          : null;
      return false;
    }
    location.value = next;
    locationHint.value = null;
    submitError.value = null;
    return true;
  }

  function selectPhoto(file: (Blob & { name?: string }) | null): boolean {
    if (submitting.value) return false;
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
    if (submitting.value) return;
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

    if (createdRequestId.value) {
      // Once the create call succeeded, this sheet must never file the same emergency
      // again. A photo failure has its own retry path; a new SOS requires reset().
      return awaitingPhotoRetry.value ? retryPhotoUpload() : false;
    }

    const foundIssues = sosDraftIssues(draft.value);
    if (foundIssues.length > 0) {
      submitError.value = sosIssueMessage(foundIssues[0]!.code);
      return false;
    }

    // Snapshot what the user approved at tap time. A late GPS fix, map drag or file-picker
    // event during session refresh must not silently change the submitted SOS or attachment.
    const payload = buildSosCreatePayload(draft.value);
    const selectedPhoto = photoFile.value;
    gpsRequestId++; // discard a geolocation callback already in flight
    locating.value = false;
    // Lock before an asynchronous session refresh. Two taps while a refresh is pending
    // must not each create a separate emergency (and consume the 3/minute quota).
    submitting.value = true;
    try {
      const token = await requireToken();
      if (!token) {
        submitError.value = "برای ارسال درخواست امداد دوباره وارد حساب کاربری شوید.";
        return false;
      }
      const created = await createSosRequest(payload, token);
      createdRequestId.value = created.requestId;

      if (selectedPhoto) {
        try {
          const uploaded = await uploadSosRequestPhoto(created.requestId, selectedPhoto, token);
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
    const requestId = createdRequestId.value;
    const selectedPhoto = photoFile.value;
    submitError.value = null;

    // The photo retry is also single-flight across an asynchronous token refresh.
    submitting.value = true;
    try {
      const token = await requireToken();
      if (!token) {
        submitError.value = "برای ارسال تصویر دوباره وارد حساب کاربری شوید.";
        return false;
      }
      const uploaded = await uploadSosRequestPhoto(requestId, selectedPhoto, token);
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
    gpsRequestId++;
    locating.value = false;
    severity.value = "high";
    description.value = "";
    location.value = null;
    latInput.value = "";
    lonInput.value = "";
    locationHint.value = null;
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
    latInput,
    lonInput,
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
