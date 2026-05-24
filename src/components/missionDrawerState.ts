import type { MissionBrief } from "../types/cognopticon";
import type { MissionPacketValidationResult } from "../lib/missionPacket";

export interface MissionDrawerDeliveryState {
  packetReady: boolean;
  status: string;
  summary: string;
  markdownForDelivery?: string;
}

export function missionDrawerDeliveryState(
  brief: MissionBrief | null,
  packetResult: MissionPacketValidationResult | undefined,
  dispatchStatus: string,
  dispatchSummary: string | undefined
): MissionDrawerDeliveryState {
  if (!brief || !packetResult) {
    return {
      packetReady: false,
      status: "blocked",
      summary: "Mission packet blocked: no mission packet is available."
    };
  }

  if (!packetResult.ok) {
    return {
      packetReady: false,
      status: "blocked",
      summary: `Mission packet blocked: ${packetResult.errors.join(" ")}`
    };
  }

  return {
    packetReady: true,
    status: dispatchStatus,
    summary: dispatchSummary ?? "Review records intent only. Use Run or Run Verification for daemon-backed execution.",
    markdownForDelivery: brief.markdown
  };
}
