/**
 * Legacy CRA axios helper.
 * Prefer src/services/api/httpClient.ts for REST mode chat/auth.
 * Kept for any non-chat utilities that still import this path.
 */
import axios from "axios";

const legacyAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default legacyAxios;
