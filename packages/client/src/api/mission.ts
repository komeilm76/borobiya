import { z } from "zod";
import { apiRoutes } from "@shared/api";
import { cancellationReasonSchema, cancellationSchema, missionSchema, paginatedResponseSchema,
  type CancellationReason, type Mission } from "@shared/index";
import { requestJson } from "./http";

export async function listRescuerMissions(token: string, page = 1): Promise<{ items: Mission[]; total: number; totalPages: number }> {
  const query = apiRoutes.sos.listMissions.schema.query.parse({ role: "rescuer", page, limit: 20 });
  const params = new URLSearchParams({ role: "rescuer", page: String(query.page), limit: String(query.limit) });
  return paginatedResponseSchema(missionSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listMissions.url}?${params}`, { accessToken: token }
  ));
}

export async function getMission(token: string, id: string): Promise<Mission> {
  return missionSchema.parse(await requestJson<unknown>(apiRoutes.sos.getMission.url.replace(":id", encodeURIComponent(id)),
    { accessToken: token }));
}

export async function listRescuerCancellationReasons(token: string): Promise<CancellationReason[]> {
  return z.array(cancellationReasonSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listCancellationReasons.url}?type=rescuer`, { accessToken: token }
  ));
}

export async function cancelRescuerMission(token: string, missionId: string, reasonId: string, customReason?: string): Promise<void> {
  await requestJson<unknown>(apiRoutes.sos.cancelMission.url.replace(":id", encodeURIComponent(missionSchema.shape.id.parse(missionId))), {
    method: "POST", accessToken: token,
    body: cancellationSchema.parse({ cancellationReasonId: reasonId, ...(customReason ? { customReason } : {}) })
  });
}
