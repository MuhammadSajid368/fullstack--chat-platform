import type {
  CompleteUploadParams,
  CreateUploadParams,
  FailUploadParams,
  Upload,
  UploadService,
} from "../uploadService";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const uploads = new Map<string, Upload>();

class MockUploadService implements UploadService {
  async createUpload(params: CreateUploadParams): Promise<Upload> {
    await delay(200);
    const upload: Upload = {
      id: `upload-${Date.now()}`,
      type: params.type,
      status: "pending",
      mimeType: params.mimeType,
      fileName: params.fileName,
      byteSize: String(params.byteSize),
      width: params.width,
      height: params.height,
      durationMs: params.durationMs,
      checksum: params.checksum,
      conversationId: params.conversationId,
      createdAt: new Date().toISOString(),
    };
    uploads.set(upload.id, upload);
    return { ...upload };
  }

  async getUpload(attachmentId: string): Promise<Upload> {
    await delay(100);
    const upload = uploads.get(attachmentId);
    if (!upload) {
      throw new Error("Upload not found");
    }
    return { ...upload };
  }

  async completeUpload(
    attachmentId: string,
    params: CompleteUploadParams = {}
  ): Promise<Upload> {
    await delay(100);
    const upload = uploads.get(attachmentId);
    if (!upload) {
      throw new Error("Upload not found");
    }
    const updated: Upload = {
      ...upload,
      status: "ready",
      checksum: params.checksum ?? upload.checksum,
      byteSize: params.byteSize ? String(params.byteSize) : upload.byteSize,
      width: params.width ?? upload.width,
      height: params.height ?? upload.height,
      durationMs: params.durationMs ?? upload.durationMs,
      updatedAt: new Date().toISOString(),
    };
    uploads.set(attachmentId, updated);
    return { ...updated };
  }

  async failUpload(
    attachmentId: string,
    params: FailUploadParams = {}
  ): Promise<Upload> {
    await delay(100);
    void params;
    const upload = uploads.get(attachmentId);
    if (!upload) {
      throw new Error("Upload not found");
    }
    const updated: Upload = {
      ...upload,
      status: "failed",
      updatedAt: new Date().toISOString(),
    };
    uploads.set(attachmentId, updated);
    return { ...updated };
  }

  async deleteUpload(attachmentId: string): Promise<void> {
    await delay(100);
    uploads.delete(attachmentId);
  }
}

export const mockUploadService = new MockUploadService();
