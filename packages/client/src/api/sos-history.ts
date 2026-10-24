import { apiRoutes } from "@shared/api";
import { paginatedResponseSchema, sosRequestRecordSchema, type SosRequest } from "@shared/index";
import { requestJson } from "./http";

export interface SosHistoryPage {
  items: SosRequest[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listRequesterSosHistory(token: string, page = 1): Promise<SosHistoryPage> {
  const query = apiRoutes.sos.listRequests.schema.query.parse({ role: "requester", page, limit: 12 });
  const params = new URLSearchParams({ role: "requester", page: String(query.page), limit: String(query.limit) });
  return paginatedResponseSchema(sosRequestRecordSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listRequests.url}?${params}`, { accessToken: token }
  ));
}

export async function getRequesterSosRequest(token: string, id: string): Promise<SosRequest> {
  const valid = sosRequestRecordSchema.shape.id.parse(id);
  return sosRequestRecordSchema.parse(await requestJson<unknown>(
    apiRoutes.sos.getRequest.url.replace(":id", encodeURIComponent(valid)), { accessToken: token }
  ));
}
