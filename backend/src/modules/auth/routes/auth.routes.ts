import { Router } from "express";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import { validateRequest } from "@middleware/validate.js";
import type { AuthController } from "@modules/auth/controller/AuthController.js";
import { createLoginRateLimiter } from "@modules/auth/middleware/loginRateLimiter.js";
import { loginBodySchema, registerBodySchema } from "@modules/auth/validators/AuthValidators.js";

/**
 * Auth routes — register, login, logout, me, refresh.
 */
export function createAuthRoutes(
  controller: AuthController,
  config: AppConfig,
  redis?: Redis | null
): Router {
  const router = Router();
  const loginLimiter = createLoginRateLimiter(config, redis);

  router.post(
    "/register",
    loginLimiter,
    validateRequest(registerBodySchema, "body"),
    controller.register
  );

  router.post(
    "/login",
    loginLimiter,
    validateRequest(loginBodySchema, "body"),
    controller.login
  );

  router.post("/logout", controller.logout);
  router.get("/me", controller.me);
  router.post("/refresh", controller.refresh);

  return router;
}