import type { RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IAdminRepository } from "@modules/admin/interfaces/IAdminRepository.js";

/**
 * Requires authenticated user with globalRole ADMIN or SUPER_ADMIN.
 * Attaches `req.admin` for fine-grained checks in the service layer.
 */
export function createRequireAdminMiddleware(
  adminRepository: IAdminRepository
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const role = await adminRepository.getGlobalRole(req.user.id);
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw new ForbiddenError("Admin access required");
    }

    req.admin = {
      id: req.user.id,
      globalRole: role,
    };
    next();
  });
}
