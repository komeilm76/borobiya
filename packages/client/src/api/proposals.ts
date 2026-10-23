import { paginatedResponseSchema, missionProposalSchema } from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

const inboxSchema = paginatedResponseSchema(missionProposalSchema);
export type ProposalInboxPage = ReturnType<typeof inboxSchema.parse>;

export async function listPendingProposals(token: string, page = 1, limit = 20): Promise<ProposalInboxPage> {
  const query = apiRoutes.sos.listProposals.schema.query.parse({ page, limit });
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  return inboxSchema.parse(await requestJson<unknown>(`${apiRoutes.sos.listProposals.url}?${params}`, { accessToken: token }));
}
