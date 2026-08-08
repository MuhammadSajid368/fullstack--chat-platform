# API Verification Artifacts

Production release verification pack for the Chat backend (HTTP + layer audit).

| Artifact | Description |
|----------|-------------|
| [Chat-API.postman_collection.json](./Chat-API.postman_collection.json) | Postman Collection v2.1 — 84 requests, folders by module |
| [Chat-API.postman_environment.json](./Chat-API.postman_environment.json) | Environment variables + placeholders |
| [ENDPOINT_INVENTORY.md](./ENDPOINT_INVENTORY.md) | Every registered route (method, auth, DTOs, status, pagination) |
| [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) | ID dependency graph + critical path |
| [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md) | Testing order + per-endpoint purpose/setup/errors/checklists |
| [MISSING_API_REPORT.md](./MISSING_API_REPORT.md) | Missing / partial / by-design findings |
| [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) | Final module coverage scorecard |
| [generate-postman.mjs](./generate-postman.mjs) | Regenerates Postman JSON (`node generate-postman.mjs`) |

## Quick start

1. Import collection + environment into Postman  
2. Set `baseUrl`, user/admin credentials, `peerUserId`  
3. Run **01 Authentication → Login** (auto-fills `accessToken`)  
4. Follow order in `API_TESTING_GUIDE.md`  

## Top findings (read before sign-off)

1. **87** HTTP endpoints registered; **0** empty module routers.  
2. **⚠** Access token is cookie-only on path `/api/auth`; domain APIs need Bearer — Postman script handles this; confirm client handoff.  
3. **⚠** Admin HTTP automated tests are partial (APIs exist).  
4. Presence realtime / notification create / DM create-via-direct are **by design**, not missing routes.  
