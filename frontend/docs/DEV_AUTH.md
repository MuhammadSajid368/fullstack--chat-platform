# Chat frontend – local development notes

## Active mode (REST)

Local development is configured for the **real backend** via Vite proxy:

```
# frontend/.env
VITE_CHAT_SERVICE_MODE=rest
VITE_API_BASE_URL=/api
VITE_SOCKET_URL=
```

- Browser calls same-origin `/api` and `/socket.io` on port **5173**.
- Vite proxies those to backend **http://127.0.0.1:3000** (see `vite.config.ts`).
- Auth uses **HTTP-only cookies** (`withCredentials: true`). The proxy can inject `Authorization: Bearer` from the access cookie for API/socket handshakes.
- On startup the app calls `GET /auth/me` (and refresh if needed). See `docs/API_CONTRACT.md`.

Register a user via the Register page (`POST /auth/register`), or log in with an existing backend account. Mock demo credentials (`demo@chat.app`) only work when mock mode is enabled.

## Mock mode (tests / offline)

Unit tests force mock via `frontend/.env.test` so Vitest does not need a live API.

To run the UI against mocks temporarily:

```
VITE_CHAT_SERVICE_MODE=mock
```

Then restart Vite. Demo credentials: `demo@chat.app` / `demo1234` (`src/services/mock/mockAuthService.ts`).

## Chat service mode

| Mode | Behavior |
|------|----------|
| `rest` | Axios adapters against `VITE_API_BASE_URL` + Socket.IO |
| `mock` | In-memory deterministic services; no network |

## CORS / cookies

Backend must allow the Vite origin with credentials:

- `Access-Control-Allow-Origin: http://localhost:5173` (exact)
- `Access-Control-Allow-Credentials: true`

## Switching modes

1. Stop the Vite dev server.
2. Edit `frontend/.env` (or use `.env.local`).
3. Restart `npm run dev`.
4. Keep backend running on port 3000 when using REST.

## Tests

```
npm test
npm run type-check
npm run lint
npm run build
```
