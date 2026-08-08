import type {
  AttachmentSafeDto,
  CompleteUploadInput,
  CreateUploadInput,
  FailUploadInput,
  UploadClientContext,
} from "@modules/uploads/dto/UploadDto.js";

export interface IUploadService {
  create(
    userId: string,
    input: CreateUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto>;

  getById(userId: string, attachmentId: string): Promise<AttachmentSafeDto>;

  complete(
    userId: string,
    attachmentId: string,
    input: CompleteUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto>;

  fail(
    userId: string,
    attachmentId: string,
    input: FailUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto>;

  softDelete(
    userId: string,
    attachmentId: string,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto>;
}
