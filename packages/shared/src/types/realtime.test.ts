import { describe, expectTypeOf, it } from "vitest";
import type { LocationUpdate } from "../schemas/location";
import type { MissionLocationEvent, MissionLocationPublish, MissionStatusUpdatedEvent,
  RequesterCancellationEvent, RescuerCancellationEvent, SosProposalReceivedEvent } from "../schemas/sos";
import type { ClientToServerEvents, LocationUpdateAck, MissionJoinAck, ServerToClientEvents } from "./realtime";

/** T4.3.1: the transport uses these interfaces at both endpoints; keep the catalog live-only. */
describe("typed realtime event catalog", () => {
  it("names precisely the implemented client-to-server events and their acknowledgement contracts", () => {
    expectTypeOf<keyof ClientToServerEvents>().toEqualTypeOf<
      "location:update" | "mission:subscribe" | "mission:location-publish">();
    expectTypeOf<Parameters<ClientToServerEvents["location:update"]>[0]>().toEqualTypeOf<LocationUpdate>();
    expectTypeOf<Parameters<ClientToServerEvents["mission:subscribe"]>[0]>().toEqualTypeOf<{ missionId: string }>();
    expectTypeOf<Parameters<ClientToServerEvents["mission:subscribe"]>[1]>().toEqualTypeOf<(response: MissionJoinAck) => void>();
    expectTypeOf<Parameters<ClientToServerEvents["mission:location-publish"]>[0]>().toEqualTypeOf<MissionLocationPublish>();
    expectTypeOf<Parameters<ClientToServerEvents["location:update"]>[1]>().toEqualTypeOf<(response: LocationUpdateAck) => void>();
  });

  it("names live server events only, preserving participant vs admin cancellation payloads", () => {
    expectTypeOf<keyof ServerToClientEvents>().toEqualTypeOf<
      "location:peer-update" | "location:share-ended" | "sos:new-request" |
      "sos:proposal-received" | "sos:proposal-accepted" | "mission:status-updated" |
      "mission:location" | "mission:cancelled-by-requester" | "mission:cancelled-by-rescuer">();
    expectTypeOf<Parameters<ServerToClientEvents["mission:location"]>[0]>().toEqualTypeOf<MissionLocationEvent>();
    expectTypeOf<Parameters<ServerToClientEvents["mission:status-updated"]>[0]>().toEqualTypeOf<MissionStatusUpdatedEvent>();
    expectTypeOf<Parameters<ServerToClientEvents["mission:cancelled-by-rescuer"]>[0]>().toEqualTypeOf<RescuerCancellationEvent>();
    expectTypeOf<Parameters<ServerToClientEvents["mission:cancelled-by-requester"]>[0]>().toEqualTypeOf<RequesterCancellationEvent>();
    expectTypeOf<Parameters<ServerToClientEvents["sos:proposal-received"]>[0]>().toEqualTypeOf<SosProposalReceivedEvent>();
  });
});
