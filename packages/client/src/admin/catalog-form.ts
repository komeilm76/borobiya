import {
  categoryCreateSchema,
  categoryUpdateSchema,
  deriveIncidentSlug,
  incidentTypeCreateSchema,
  incidentTypeUpdateSchema,
  type Category,
  type CategoryCreateInput,
  type CategoryUpdateInput,
  type IncidentType,
  type IncidentTypeCreateInput,
  type IncidentTypeUpdateInput
} from "@shared/index";
import { ApiError } from "../api/http";

/**
 * The decisions behind the two admin catalog screens (T3.1.5), kept out of the components so they are
 * testable and so a rule appears once.
 *
 * The shape every form follows: a draft is all strings (that is what a text field holds), and the
 * conversion to a request body is where "empty" becomes something specific — omitted on create, `null`
 * on update when it has to clear a value, `""` for the one field the API folds to `NULL` itself. The
 * client never decides on its own that a value is *too long*: the shared schema is the only bound here,
 * so a limit raised server-side is not silently contradicted by a form that still refuses it.
 */

export interface IncidentFormDraft {
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
}

export interface CategoryFormDraft {
  name: string;
  description: string;
  incidentTypeIds: string[];
}

export const EMPTY_INCIDENT_DRAFT: IncidentFormDraft = {
  name: "",
  slug: "",
  icon: "",
  color: "",
  description: ""
};

export const EMPTY_CATEGORY_DRAFT: CategoryFormDraft = { name: "", description: "", incidentTypeIds: [] };

/** A nullable column shown in a text field: `null` and `""` are the same thing to type into. */
export function incidentDraftFromType(type: IncidentType): IncidentFormDraft {
  return {
    name: type.name,
    slug: type.slug,
    icon: type.icon ?? "",
    color: type.color ?? "",
    description: type.description ?? ""
  };
}

export function categoryDraftFromCategory(category: Category): CategoryFormDraft {
  return { name: category.name, description: category.description ?? "", incidentTypeIds: [...category.incidentTypeIds] };
}

export type CatalogFieldErrors = Partial<Record<string, string>>;

export type CreateBodyResult<T> = { status: "valid"; body: T } | { status: "invalid"; fieldErrors: CatalogFieldErrors };

export type PatchBodyResult<T> =
  | { status: "valid"; body: T }
  | { status: "unchanged" }
  | { status: "invalid"; fieldErrors: CatalogFieldErrors };

/**
 * The slug an empty slug field will produce, or `null` when the name has nothing slug-shaped in it.
 *
 * `deriveIncidentSlug` is shared rather than re-typed here for the reason its own docstring gives: a
 * preview that drifts from the server is worse than no preview, because the admin would learn the rule
 * by being refused. A `null` is not an error — it means the field has to be filled in by hand, which is
 * what `slugNeedsManualEntry` says in the form's own words.
 */
export function incidentSlugPreview(name: string): string | null {
  return deriveIncidentSlug(name);
}

export function slugNeedsManualEntry(draft: IncidentFormDraft): boolean {
  return draft.slug.trim().length === 0 && incidentSlugPreview(draft.name) === null;
}

function optionalField(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function incidentCreateFields(draft: IncidentFormDraft): IncidentTypeCreateInput {
  const fields = {
    name: draft.name.trim(),
    ...(optionalField(draft.slug) === undefined ? {} : { slug: optionalField(draft.slug)! }),
    ...(optionalField(draft.icon) === undefined ? {} : { icon: optionalField(draft.icon)! }),
    ...(optionalField(draft.color) === undefined ? {} : { color: optionalField(draft.color)! }),
    // `description` is the one field the routes collapse themselves (`blankToNull`), so a blank
    // description is sent as `""` on create too — the server stores NULL either way, and a form that
    // omitted it would leave an edited-away description behind on an update.
    description: draft.description.trim()
  };
  return fields;
}

/** The Persian line for the zod issues that matter to a human editing this form. */
const FIELD_LABELS: Record<string, string> = {
  name: "نام",
  slug: "نامک",
  icon: "نماد",
  color: "رنگ",
  description: "توضیح",
  incidentTypeIds: "نوع رویدادها"
};

/**
 * The schema's issue code in the admin's own language. `too_big` quotes the bound off the issue rather
 * than a number written here, so a limit that moves in `@borobiya/shared` moves in this sentence too —
 * a client that hardcodes 64 would be a second rule to keep in step, which is the mistake this repo
 * already fixed once in the slug.
 */
interface IssueShape {
  code: string;
  path: readonly unknown[];
  maximum?: unknown;
  minimum?: unknown;
  format?: unknown;
}

const ISSUE_MESSAGES: Record<string, (label: string, issue: IssueShape) => string> = {
  invalid_type: (label) => `«${label}» را درست پر کنید.`,
  // A `min(1)` string is the schema's way of saying "required", and that is the sentence an admin needs;
  // the numeric form only reads well above one character.
  too_small: (label, issue) =>
    typeof issue.minimum === "number" && issue.minimum > 1
      ? `«${label}» باید دستِ‌کم ${issue.minimum} نویسه باشد.`
      : `«${label}» نمی‌تواند خالی باشد.`,
  too_big: (label, issue) =>
    typeof issue.maximum === "number"
      ? `«${label}» نباید از ${issue.maximum} نویسه بیشتر باشد.`
      : `«${label}» از حد مجاز بلندتر است.`,
  // Both the slug's `.regex()` and an id's `.uuid()` arrive as `invalid_format` in Zod 4, differing only
  // by `format` — which is why this branches on the format rather than the code. Guessing from the code
  // would label a bad slug "not a valid identifier" and leave the admin hunting for an id field.
  invalid_format: (label, issue) =>
    issue.format === "uuid"
      ? `«${label}» باید شناسهٔ معتبر باشد.`
      : `«${label}» فقط می‌تواند حرف کوچک انگلیسی، عدد و خط تیره داشته باشد (مثل flood-response).`,
  unrecognized_keys: (label) => `«${label}» برای این فرم تعریف نشده است.`,
  custom: (label) => `«${label}» را نمی‌توان پذیرفت.`
};

/**
 * One message per field, from the schema's own verdict rather than a parallel client-side validator.
 *
 * The first issue for a field wins, because a form shows the error under the field and a second sentence
 * about the same box is noise. An issue on the object as a whole (path `[]`) is shown under `name`,
 * which is where the admin's eye starts.
 */
export function fieldErrorsFromZodError(error: { issues: readonly IssueShape[] }): CatalogFieldErrors {
  const fieldErrors: CatalogFieldErrors = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "name";
    if (fieldErrors[key]) continue;
    const label = FIELD_LABELS[key] ?? key;
    const message = ISSUE_MESSAGES[issue.code] ?? ((value: string) => `«${value}» معتبر نیست.`);
    fieldErrors[key] = message(label, issue);
  }
  return fieldErrors;
}

export function incidentCreateBody(draft: IncidentFormDraft): CreateBodyResult<IncidentTypeCreateInput> {
  const parsed = incidentTypeCreateSchema.safeParse(incidentCreateFields(draft));
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrorsFromZodError(parsed.error) };
  return { status: "valid", body: parsed.data };
}

/**
 * Only the fields that actually moved.
 *
 * An empty PATCH body is a `400` by contract (`"At least one incident type field must be provided."`),
 * and sending unchanged values would write an audit row for an edit that changed nothing — the catalog
 * routes go out of their way to avoid that. `null` is meaningful here: it is how an icon or a color gets
 * *removed*, since those two columns refuse an empty string.
 */
export function incidentPatchBody(
  original: IncidentType,
  draft: IncidentFormDraft
): PatchBodyResult<IncidentTypeUpdateInput> {
  const fields: Record<string, unknown> = {};
  const name = draft.name.trim();
  const slug = draft.slug.trim();
  const icon = draft.icon.trim();
  const color = draft.color.trim();
  const description = draft.description.trim();

  if (name.length > 0 && name !== original.name) fields.name = name;
  if (slug.length > 0 && slug !== original.slug) fields.slug = slug;
  if (icon !== (original.icon ?? "")) fields.icon = icon.length > 0 ? icon : null;
  if (color !== (original.color ?? "")) fields.color = color.length > 0 ? color : null;
  if (description !== (original.description ?? "")) fields.description = description;

  if (Object.keys(fields).length === 0) return { status: "unchanged" };
  const parsed = incidentTypeUpdateSchema.safeParse(fields);
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrorsFromZodError(parsed.error) };
  return { status: "valid", body: parsed.data };
}

/**
 * The one field a form cannot submit empty, checked before the diff rather than through it.
 *
 * A patch builder that simply skipped a blank name would turn "you erased the required field" into
 * "nothing to save", which is the same silence as rejecting the admin's edit for no reason. So the
 * screens ask this question directly and put the answer under the field.
 */
export function requiredNameError(name: string): string | null {
  return name.trim().length > 0 ? null : "«نام» نمی‌تواند خالی باشد.";
}

/** A blank name is the one thing an update cannot leave behind, and the schema would refuse it later. */
export function categoryCreateBody(draft: CategoryFormDraft): CreateBodyResult<CategoryCreateInput> {
  const parsed = categoryCreateSchema.safeParse({
    name: draft.name.trim(),
    description: draft.description.trim(),
    incidentTypeIds: [...new Set(draft.incidentTypeIds)]
  });
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrorsFromZodError(parsed.error) };
  return { status: "valid", body: parsed.data };
}

/**
 * The incident-type set is compared as a set, because the route replaces it wholesale: a dialog where
 * the same types come back in a different order is not an edit, and sending it would add an audit row
 * for nothing.
 */
export function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function categoryPatchBody(
  original: Category,
  draft: CategoryFormDraft
): PatchBodyResult<CategoryUpdateInput> {
  const fields: Record<string, unknown> = {};
  const name = draft.name.trim();
  const description = draft.description.trim();

  if (name.length > 0 && name !== original.name) fields.name = name;
  if (description !== (original.description ?? "")) fields.description = description;
  if (!sameIdSet(draft.incidentTypeIds, original.incidentTypeIds)) fields.incidentTypeIds = [...new Set(draft.incidentTypeIds)];

  if (Object.keys(fields).length === 0) return { status: "unchanged" };
  const parsed = categoryUpdateSchema.safeParse(fields);
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrorsFromZodError(parsed.error) };
  return { status: "valid", body: parsed.data };
}

/**
 * Which incident type holds a slug the admin just tried to take.
 *
 * The server's refusal names it, in English, and the screen is Persian; the list this view already holds
 * answers the same question locally, so the message can name the type in the UI's own language. `null`
 * means the conflicting type is not in the local list — a race, or a slug that became taken since the
 * last load — and the caller falls back to naming the slug, which is still the thing to fix.
 */
export function slugConflictTarget(error: unknown, known: readonly IncidentType[]): IncidentType | null {
  if (!(error instanceof ApiError) || error.code !== "INCIDENT_TYPE_SLUG_TAKEN") return null;
  const taken = error.issues.find(
    (issue) => typeof issue === "object" && issue !== null && "slug" in issue
  ) as { slug?: unknown } | undefined;
  const slug = typeof taken?.slug === "string" ? taken.slug : null;
  if (!slug) return null;
  return known.find((type) => type.slug === slug) ?? null;
}

/**
 * The ids the server refused to assign, phrased with the names this screen knows.
 *
 * `unknown_target` issues arrive pointing at an array index (`{ path: ["userIds", 2] }`), which is
 * useless to a person who sees names on screen — so the id is read back out of the submitted list and
 * matched against the picker's own rows. An id that is not there is quoted raw rather than dropped: a
 * refusal that goes silent about one of the picks leaves the admin guessing which one was refused.
 */
export function unknownTargetLabels(error: unknown, submitted: readonly string[], nameOf: (id: string) => string | null): string[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR") return [];
  const labels: string[] = [];
  for (const issue of error.issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const { code, path } = issue as { code?: unknown; path?: unknown };
    if (code !== "unknown_target" || !Array.isArray(path)) continue;
    const index = path[path.length - 1];
    const id = typeof index === "number" ? submitted[index] : undefined;
    if (!id) continue;
    labels.push(nameOf(id) ?? id);
  }
  return labels;
}
