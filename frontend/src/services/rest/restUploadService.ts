import type {
  CompleteUploadParams,
  CreateUploadParams,
  FailUploadParams,
  Upload,
  UploadService,
} from "../uploadService";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpDelete, httpGet, httpPost } from "../api/httpClient";
import type { ApiUploadDto } from "../api/apiTypes";
import { getErrorMessage } from "../api/apiError";

function transformUpload(dto: ApiUploadDto): Upload {
  return {
    id: dto.id,
    type: dto.type,
    status: dto.status,
    mimeType: dto.mimeType,
    fileName: dto.fileName,
    byteSize: dto.byteSize,
    width: dto.width,
    height: dto.height,
    durationMs: dto.durationMs,
    checksum: dto.checksum,
    conversationId: dto.conversationId,
    messageId: dto.messageId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

class RestUploadService implements UploadService {
  async createUpload(params: CreateUploadParams): Promise<Upload> {
    try {
      const dto = await httpPost<ApiUploadDto>(
        API_ENDPOINTS.uploads.create,
        params
      );
      return transformUpload(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to create upload"));
    }
  }

  async getUpload(attachmentId: string): Promise<Upload> {
    try {
      const dto = await httpGet<ApiUploadDto>(
        API_ENDPOINTS.uploads.byId(attachmentId)
      );
      return transformUpload(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load upload"));
    }
  }

  async completeUpload(
    attachmentId: string,
    params: CompleteUploadParams = {}
  ): Promise<Upload> {
    try {
      const dto = await httpPost<ApiUploadDto>(
        API_ENDPOINTS.uploads.complete(attachmentId),
        params
      );
      return transformUpload(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to complete upload"));
    }
  }

  async failUpload(
    attachmentId: string,
    params: FailUploadParams = {}
  ): Promise<Upload> {
    try {
      const dto = await httpPost<ApiUploadDto>(
        API_ENDPOINTS.uploads.fail(attachmentId),
        params
      );
      return transformUpload(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to mark upload failed"));
    }
  }

  async deleteUpload(attachmentId: string): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.uploads.byId(attachmentId));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete upload"));
    }
  }
}

export const restUploadService = new RestUploadService();
