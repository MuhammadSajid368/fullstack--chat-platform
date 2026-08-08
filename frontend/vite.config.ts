/// <reference types="vitest/config" />
import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import type { ClientRequest, IncomingMessage } from "node:http";

const BACKEND_ORIGIN = "http://127.0.0.1:3000";

function rewriteAuthCookiePath(setCookieHeader: string): string {
  return setCookieHeader.replace(
    /;\s*Path=\/api\/auth\/?/gi,
    "; Path=/"
  );
}

function extractAccessTokenFromCookieHeader(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = trimmed.slice(0, eq);
    if (name === "chat_session_access" || name.endsWith("_access")) {
      const value = trimmed.slice(eq + 1);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function injectBearerFromCookies(
  proxyReq: ClientRequest,
  req: IncomingMessage
): void {
  if (proxyReq.getHeader("authorization")) {
    return;
  }
  const token = extractAccessTokenFromCookieHeader(req.headers.cookie);
  if (token) {
    proxyReq.setHeader("Authorization", `Bearer ${token}`);
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // CRA allowed JSX inside `.js` files; esbuild does not by default. This
    // plugin transforms only the project's `.js` files as JSX, leaving
    // `.ts`/`.tsx` to Vite + @vitejs/plugin-react. It lets the existing
    // JavaScript keep working while it is incrementally migrated.
    {
      name: "load-js-files-as-jsx",
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) {
          return null;
        }
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
          proxy.on("proxyRes", (proxyRes) => {
            const setCookie = proxyRes.headers["set-cookie"];
            if (!setCookie) {
              return;
            }
            proxyRes.headers["set-cookie"] = setCookie.map(rewriteAuthCookiePath);
          });
        },
      },
      "/socket.io": {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
          proxy.on("proxyReqWs", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
        },
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
          proxy.on("proxyRes", (proxyRes) => {
            const setCookie = proxyRes.headers["set-cookie"];
            if (!setCookie) {
              return;
            }
            proxyRes.headers["set-cookie"] = setCookie.map(rewriteAuthCookiePath);
          });
        },
      },
      "/socket.io": {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
          proxy.on("proxyReqWs", (proxyReq, req) => {
            injectBearerFromCookies(proxyReq, req);
          });
        },
      },
    },
  },
  build: {
    outDir: "build",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          // Split large, leaf-ish vendors only — avoid catch-all chunks that
          // create circular vendor↔react-vendor / vendor↔socket graphs.
          if (id.includes("@mui") || id.includes("@emotion")) {
            return "mui";
          }
          if (id.includes("phosphor-react") || id.includes("@iconify")) {
            return "icons";
          }
          if (id.includes("framer-motion")) {
            return "motion";
          }
          if (id.includes("emoji-mart") || id.includes("@emoji-mart")) {
            return "emoji";
          }
          if (id.includes("@tanstack/react-virtual")) {
            return "virtual";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
