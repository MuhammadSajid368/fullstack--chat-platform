import type { GroupService } from "../groupService";
import type {
  AddGroupMembersParams,
  ChangeMemberRoleParams,
  CreateGroupParams,
  LeaveGroupParams,
  RemoveGroupMemberParams,
  TransferGroupOwnershipParams,
  UpdateGroupParams,
} from "../groupService";
import type { Conversation } from "../../types/chat";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpDelete, httpPatch, httpPost } from "../api/httpClient";
import type {
  ApiAddMembersRequest,
  ApiChangeMemberRoleRequest,
  ApiConversationDto,
  ApiCreateGroupRequest,
  ApiTransferOwnershipRequest,
  ApiUpdateGroupRequest,
} from "../api/apiTypes";
import { transformConversation } from "../api/transformers";
import { ApiError, getErrorMessage } from "../api/apiError";

class RestGroupService implements GroupService {
  async createGroup(params: CreateGroupParams): Promise<Conversation> {
    try {
      const body: ApiCreateGroupRequest = {
        name: params.name,
        description: params.description,
        memberUserIds: params.memberUserIds,
      };
      const dto = await httpPost<ApiConversationDto>(
        API_ENDPOINTS.groups.create,
        body
      );
      return transformConversation(dto);
    } catch (error) {
      if (ApiError.isApiError(error) && error.fieldErrors) {
        throw error;
      }
      throw new Error(getErrorMessage(error, "Failed to create group"));
    }
  }

  async updateGroup(params: UpdateGroupParams): Promise<Conversation> {
    try {
      const body: ApiUpdateGroupRequest = {};
      if (params.name !== undefined) {
        body.name = params.name;
      }
      if (params.description !== undefined) {
        body.description = params.description;
      }
      if (params.avatarUrl !== undefined) {
        body.avatarUrl = params.avatarUrl;
      }
      const dto = await httpPatch<ApiConversationDto>(
        API_ENDPOINTS.groups.byId(params.conversationId),
        body
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to update group"));
    }
  }

  async deleteGroup(conversationId: string): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.groups.byId(conversationId));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete group"));
    }
  }

  async addMembers(params: AddGroupMembersParams): Promise<Conversation> {
    try {
      const body: ApiAddMembersRequest = {
        memberUserIds: params.memberUserIds,
      };
      const dto = await httpPost<ApiConversationDto>(
        API_ENDPOINTS.groups.members(params.conversationId),
        body
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to add members"));
    }
  }

  async removeMember(params: RemoveGroupMemberParams): Promise<Conversation> {
    try {
      const dto = await httpDelete<ApiConversationDto>(
        API_ENDPOINTS.groups.member(
          params.conversationId,
          params.targetUserId
        )
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to remove member"));
    }
  }

  async changeMemberRole(params: ChangeMemberRoleParams): Promise<Conversation> {
    try {
      const body: ApiChangeMemberRoleRequest = { role: params.role };
      const dto = await httpPatch<ApiConversationDto>(
        API_ENDPOINTS.groups.memberRole(
          params.conversationId,
          params.targetUserId
        ),
        body
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to change member role"));
    }
  }

  async leaveGroup(params: LeaveGroupParams): Promise<void> {
    try {
      await httpPost(API_ENDPOINTS.groups.leave(params.conversationId));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to leave group"));
    }
  }

  async transferOwnership(
    params: TransferGroupOwnershipParams
  ): Promise<Conversation> {
    try {
      const body: ApiTransferOwnershipRequest = {
        toUserId: params.toUserId,
        newOwnerUserId: params.toUserId,
      };
      const dto = await httpPost<ApiConversationDto>(
        API_ENDPOINTS.groups.transferOwnership(params.conversationId),
        body
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to transfer ownership"));
    }
  }
}

export const restGroupService = new RestGroupService();
