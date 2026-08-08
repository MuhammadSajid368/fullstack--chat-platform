import { describe, expect, it } from "vitest";
import {
  getActiveChatServiceMode,
  getAuthService,
  getConversationService,
  getMessageService,
  getGroupService,
  getUserService,
  getPresenceService,
  getNotificationService,
  getSearchService,
  getUploadService,
  getAdminService,
} from "./serviceRegistry";
import { mockAuthService } from "./mock/mockAuthService";
import { restAuthService } from "./rest/restAuthService";

/**
 * Vitest uses `.env.test` → mock mode so unit tests stay offline.
 * Runtime `npm run dev` uses `.env` → rest mode.
 */
describe("serviceRegistry mode selection", () => {
  it("uses mock implementations under test env", () => {
    expect(getActiveChatServiceMode()).toBe("mock");
    expect(getAuthService()).toBe(mockAuthService);
    expect(getAuthService()).not.toBe(restAuthService);
    expect(getConversationService().constructor.name).toMatch(/Mock|Object/);
    // Sanity: all getters resolve without throwing
    expect(getMessageService()).toBeTruthy();
    expect(getGroupService()).toBeTruthy();
    expect(getUserService()).toBeTruthy();
    expect(getPresenceService()).toBeTruthy();
    expect(getNotificationService()).toBeTruthy();
    expect(getSearchService()).toBeTruthy();
    expect(getUploadService()).toBeTruthy();
    expect(getAdminService()).toBeTruthy();
  });
});
