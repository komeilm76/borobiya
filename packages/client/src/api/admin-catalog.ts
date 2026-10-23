import { z } from "zod";
import {
  assignCategoryUsersSchema,
  categoryCreateSchema,
  categorySchema,
  categoryUpdateSchema,
  incidentTypeCreateSchema,
  incidentTypeSchema,
  incidentTypeUpdateSchema,
  uuidPathParamsSchema,
  type Category,
  type CategoryCreateInput,
  type CategoryUpdateInput,
  type IncidentType,
  type IncidentTypeCreateInput,
  type IncidentTypeUpdateInput
} from "@shared/index";
import { apiRoutes, categoryUserParamsSchema } from "@shared/api";
import { requestJson } from "./http";

const incidentTypeListSchema = z.array(incidentTypeSchema);
const categoryListSchema = z.array(categorySchema);

/**
 * The admin catalog calls (`docs/API.md` §2.6–§2.7). The module is thin on purpose: every body is
 * validated by the same shared schema the server runs, so a form bug is caught here rather than as a
 * 400 the admin has to decode, and every response is parsed by the schema the client is about to
 * render, so a server change that drops a field breaks a test instead of a view.
 */
function catalogPath(route: { url: string }, id: string) {
  // Parsed through the contract's own path schema rather than a local `z.string().uuid()`, so a path
  // rule that changes server-side shows up here as a failing test instead of a 400 in the browser.
  const params = uuidPathParamsSchema.parse({ id });
  return route.url.replace(":id", encodeURIComponent(params.id));
}

export async function listIncidentTypes(accessToken: string, signal?: AbortSignal): Promise<IncidentType[]> {
  const response = await requestJson<unknown>(apiRoutes.admin.listIncidentTypes.url, { accessToken, signal });
  return incidentTypeListSchema.parse(response);
}

export async function listPublicIncidentTypes(signal?: AbortSignal): Promise<IncidentType[]> {
  const response = await requestJson<unknown>(apiRoutes.public.incidentTypes.url, { signal });
  return incidentTypeListSchema.parse(response);
}

export async function createIncidentType(input: IncidentTypeCreateInput, accessToken: string): Promise<IncidentType> {
  const body = incidentTypeCreateSchema.parse(input);
  const response = await requestJson<unknown>(apiRoutes.admin.createIncidentType.url, {
    method: "POST",
    body,
    accessToken
  });
  return incidentTypeSchema.parse(response);
}

/**
 * A PATCH with no keys is a `400` (`"At least one incident type field must be provided."`), so callers
 * pass the *changed* fields only — `buildIncidentTypePatch` in `admin/catalog-form.ts` is what decides
 * that. An explicit `null` survives and clears the column; an empty string never reaches here.
 */
export async function updateIncidentType(
  id: string,
  input: IncidentTypeUpdateInput,
  accessToken: string
): Promise<IncidentType> {
  const body = incidentTypeUpdateSchema.parse(input);
  const response = await requestJson<unknown>(catalogPath(apiRoutes.admin.updateIncidentType, id), {
    method: "PATCH",
    body,
    accessToken
  });
  return incidentTypeSchema.parse(response);
}

export async function listCategories(accessToken: string, signal?: AbortSignal): Promise<Category[]> {
  const response = await requestJson<unknown>(apiRoutes.admin.listCategories.url, { accessToken, signal });
  return categoryListSchema.parse(response);
}

export async function createCategory(input: CategoryCreateInput, accessToken: string): Promise<Category> {
  const body = categoryCreateSchema.parse(input);
  const response = await requestJson<unknown>(apiRoutes.admin.createCategory.url, {
    method: "POST",
    body,
    accessToken
  });
  return categorySchema.parse(response);
}

export async function updateCategory(
  id: string,
  input: CategoryUpdateInput,
  accessToken: string
): Promise<Category> {
  const body = categoryUpdateSchema.parse(input);
  const response = await requestJson<unknown>(catalogPath(apiRoutes.admin.updateCategory, id), {
    method: "PATCH",
    body,
    accessToken
  });
  return categorySchema.parse(response);
}

/**
 * Adds members; the server treats an already-assigned user as a success rather than a conflict.
 */
export async function assignCategoryUsers(
  id: string,
  userIds: readonly string[],
  accessToken: string
): Promise<void> {
  const body = assignCategoryUsersSchema.parse({ userIds: [...userIds] });
  await requestJson<unknown>(catalogPath(apiRoutes.admin.assignCategoryUsers, id), {
    method: "POST",
    body,
    accessToken
  });
}

/** Removes one user from a responder category (`DELETE /_admin/categories/:id/users/:userId`). */
export async function removeCategoryUser(
  id: string,
  userId: string,
  accessToken: string
): Promise<void> {
  const params = categoryUserParamsSchema.parse({ id, userId });
  const url = apiRoutes.admin.removeCategoryUser.url
    .replace(":id", encodeURIComponent(params.id))
    .replace(":userId", encodeURIComponent(params.userId));
  await requestJson<unknown>(url, {
    method: "DELETE",
    accessToken
  });
}
