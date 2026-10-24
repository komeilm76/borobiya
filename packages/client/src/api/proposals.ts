import { paginatedResponseSchema, proposalInboxItemSchema, proposalAcceptResponseSchema, proposalDeclineSchema } from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

const inboxSchema = paginatedResponseSchema(proposalInboxItemSchema);
export type ProposalInboxPage = ReturnType<typeof inboxSchema.parse>;

export async function listPendingProposals(token: string, page = 1, limit = 20): Promise<ProposalInboxPage> {
  const query = apiRoutes.sos.listProposals.schema.query.parse({ page, limit });
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  return inboxSchema.parse(await requestJson<unknown>(`${apiRoutes.sos.listProposals.url}?${params}`, { accessToken: token }));
}

export async function acceptProposal(token: string, id: string): Promise<string> {
  const path = apiRoutes.sos.acceptProposal.url.replace(":id", encodeURIComponent(id));
  const result = await requestJson<unknown>(path, { method: "POST", accessToken: token });
  return proposalAcceptResponseSchema.parse(result).missionId;
}

export async function declineProposal(token: string, id: string, reason?: string): Promise<void> {
  const path = apiRoutes.sos.declineProposal.url.replace(":id", encodeURIComponent(id));
  const body = proposalDeclineSchema.parse(reason ? { reason } : {});
  await requestJson<unknown>(path, { method: "POST", accessToken: token, body });
}
