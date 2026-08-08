import type {
  PresenceInfo,
  PresencePreferredStatus,
  PresenceService,
} from "../presenceService";
import type { PresenceState } from "../../types/chat";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpGet, httpPost } from "../api/httpClient";
import type {
  ApiPresenceDto,
  ApiPresencePrivacyRequest,
  ApiPresenceStatusRequest,
} from "../api/apiTypes";
import { transformPresenceDto } from "../api/transformers";
import { getErrorMessage } from "../api/apiError";

function preferredFromDto(dto: ApiPresenceDto): PresencePreferredStatus {
  if (
    dto.preferredStatus === "ONLINE" ||
    dto.preferredStatus === "AWAY" ||
    dto.preferredStatus === "INVISIBLE"
  ) {
    return dto.preferredStatus;
  }
  const status = transformPresenceDto(dto);
  if (status === "away") return "AWAY";
  if (status === "invisible") return "INVISIBLE";
  return "ONLINE";
}

function toPresenceInfo(dto: ApiPresenceDto): PresenceInfo {
  return {
    userId: dto.userId,
    status: transformPresenceDto(dto),
    preferredStatus: preferredFromDto(dto),
    lastSeenAt: dto.lastSeenAt,
    privacy: dto.privacy,
  };
}

class RestPresenceService implements PresenceService {
  async getMyPresence() {
    try {
      const dto = await httpGet<ApiPresenceDto>(API_ENDPOINTS.presence.self);
      return toPresenceInfo(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load presence"));
    }
  }

  async getPresence(userId: string) {
    try {
      const dto = await httpGet<ApiPresenceDto>(
        API_ENDPOINTS.presence.byUserId(userId)
      );
      return toPresenceInfo(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load presence"));
    }
  }

  async getPresenceForUsers(userIds: string[]): Promise<PresenceState> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return {};
    }
    const entries = await Promise.all(
      uniqueIds.map(async (userId) => {
        try {
          const info = await this.getPresence(userId);
          return [userId, info.status] as const;
        } catch {
          return [userId, "offline" as const] as const;
        }
      })
    );
    return Object.fromEntries(entries);
  }

  async setStatus(status: "ONLINE" | "AWAY" | "INVISIBLE") {
    try {
      const body: ApiPresenceStatusRequest = { status };
      const dto = await httpPost<ApiPresenceDto>(
        API_ENDPOINTS.presence.status,
        body
      );
      return toPresenceInfo(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to update presence status"));
    }
  }

  async setPrivacy(privacy: "EVERYONE" | "CONTACTS" | "NOBODY") {
    try {
      const body: ApiPresencePrivacyRequest = { privacy };
      const dto = await httpPost<ApiPresenceDto>(
        API_ENDPOINTS.presence.privacy,
        body
      );
      return toPresenceInfo(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to update presence privacy"));
    }
  }
}

export const restPresenceService = new RestPresenceService();
