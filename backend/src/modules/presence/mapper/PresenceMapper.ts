import type {
  PresenceDeviceDto,
  PresenceDto,
  PresenceDeviceType,
  PresencePreferredStatus,
  PresencePrivacy,
  PresenceStatus,
} from "@modules/presence/dto/PresenceDto.js";
import type {
  PresenceLiveState,
  PresencePrefsRecord,
} from "@modules/presence/interfaces/IPresenceRepository.js";

/**
 * Maps persistence/live records → API DTOs.
 */
export class PresenceMapper {
  static toSelfDto(
    userId: string,
    live: PresenceLiveState,
    prefs: PresencePrefsRecord,
    devices: PresenceDeviceDto[]
  ): PresenceDto {
    return {
      userId,
      status: this.effectiveStatus(live.deviceCount, prefs.preferredStatus),
      lastSeenAt: live.lastSeenAt?.toISOString() ?? null,
      privacy: prefs.privacy,
      preferredStatus: prefs.preferredStatus,
      deviceCount: live.deviceCount,
      devices,
    };
  }

  static toViewerDto(
    userId: string,
    effectiveStatus: PresenceStatus,
    lastSeenAt: Date | null,
    privacy: PresencePrivacy,
    preferredStatus: PresencePreferredStatus
  ): PresenceDto {
    return {
      userId,
      status: effectiveStatus,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      privacy,
      preferredStatus,
      deviceCount: null,
      devices: null,
    };
  }

  static effectiveStatus(
    deviceCount: number,
    preferred: PresencePreferredStatus
  ): PresenceStatus {
    if (deviceCount <= 0) {
      return "OFFLINE";
    }
    if (preferred === "INVISIBLE") {
      return "INVISIBLE";
    }
    if (preferred === "AWAY") {
      return "AWAY";
    }
    return "ONLINE";
  }

  /** Status other users are allowed to observe (INVISIBLE → OFFLINE). */
  static visibleStatus(
    deviceCount: number,
    preferred: PresencePreferredStatus
  ): PresenceStatus {
    if (deviceCount <= 0 || preferred === "INVISIBLE") {
      return "OFFLINE";
    }
    if (preferred === "AWAY") {
      return "AWAY";
    }
    return "ONLINE";
  }

  static toDeviceDto(input: {
    socketId: string;
    deviceType: PresenceDeviceType;
    connectedAt: string;
  }): PresenceDeviceDto {
    return {
      socketId: input.socketId,
      deviceType: input.deviceType,
      connectedAt: input.connectedAt,
    };
  }
}
