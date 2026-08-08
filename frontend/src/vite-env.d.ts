/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** `mock` (default) | `rest` */
  readonly VITE_CHAT_SERVICE_MODE?: string;
  /** Required when VITE_CHAT_SERVICE_MODE=rest */
  readonly VITE_API_BASE_URL?: string;
  /** Optional axios timeout in ms (default 15000) */
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
