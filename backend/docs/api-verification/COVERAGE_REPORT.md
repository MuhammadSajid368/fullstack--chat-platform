# Final API Coverage Report

Production verification snapshot of the feature-complete backend.

## Module scorecards

### Authentication
| | |
|--|--|
| Implemented endpoints | Login, Me, Refresh, Logout (4) |
| Missing endpoints | ❌ none for claimed scope |
| Optional / by design | No signup/reset in this codebase |
| Test coverage | ✓ HTTP + security + service |
| Known limitations | Access JWT only in path-scoped HttpOnly cookie; Bearer required for other modules |

### Users
| | |
|--|--|
| Implemented | List, Search, Patch me, Get by id (4) |
| Missing | ❌ none |
| Pagination | Cursor on list/search |
| Tests | ✓ HTTP + service |

### Conversations
| | |
|--|--|
| Implemented | List, Get, Mute, Mark read (4) |
| Missing | ❌ none (DM create via messages) |
| Optional | No archive-for-user HTTP beyond mute |
| Tests | ✓ |

### Messages
| | |
|--|--|
| Implemented | List, Send, Direct, Retry, Delete, Star/Unstar, Pin/Unpin (9) |
| Missing | ❌ none |
| Pagination | Cursor on list |
| Tests | ✓ strong |

### Groups
| | |
|--|--|
| Implemented | CRUD-ish + members + roles + leave + transfer (9) |
| Missing | ❌ none |
| Tests | ✓ |

### Uploads
| | |
|--|--|
| Implemented | Create, Get, Delete, Complete, Fail (5) |
| By design | No multipart binary endpoint |
| Tests | ✓ |

### Presence
| | |
|--|--|
| Implemented HTTP | Get mine, Get user, Set status, Set privacy (4) |
| Implemented realtime | Multi-device, typing, subscribe, privacy |
| Missing HTTP | ○ realtime ops correctly non-HTTP |
| Tests | ✓ HTTP + repo + concurrency + WS |
| Migration | `20260715160000_presence_privacy_status` must be applied in envs |

### Notifications
| | |
|--|--|
| Implemented | List, Unread, Read one, Read all, Delete (5) |
| By design | Creation via jobs after message events |
| Tests | ✓ |
| Limitation | Empty inbox until jobs/runtime emit notifications |

### Search
| | |
|--|--|
| Implemented | Messages, Users, Groups, Conversations (4) |
| Missing | ❌ none |
| Tests | ✓ |
| Limitation | FTS requires migration `search_fts` |

### Admin / Moderation
| | |
|--|--|
| Implemented | 28 routes (users, conversations, groups, messages, audit, reports) |
| Missing | ❌ none vs AdminService |
| Tests | ⚠ HTTP partial; service unit broad |
| Limitation | Needs ADMIN/SUPER_ADMIN seed user |

### Health
| | |
|--|--|
| Implemented | `/health`, `/ready`, `/health/queues`, `/health/live`, `/health/ready`, `/health/startup` |
| Tests | ⚠ obs probes covered; classic `/health`/`/ready` thinner |

### Observability
| | |
|--|--|
| Implemented | `/metrics` when enabled |
| Tests | ✓ metrics route + families |

---

## Aggregate

| Metric | Value |
|--------|------:|
| Registered HTTP endpoints | 87 |
| Modules with DI wired | 10 domain + health + metrics |
| Modules with empty route tables | 0 |
| Endpoints with controller gaps | 0 |
| Critical production risks flagged | 1 (Bearer handoff / cookie path) |
| Automated test files (backend) | 41 (310 tests last green run) |

## Release checklist (manual)

1. Import Postman collection + environment from this folder  
2. Apply Prisma migrations (incl. presence privacy + search FTS)  
3. Seed regular user + peer + admin  
4. Run testing order in `API_TESTING_GUIDE.md`  
5. Confirm login → extract access cookie → Bearer on `/api/users`  
6. Confirm `/ready` 200 with Postgres+Redis  
7. Confirm Socket.IO presence/typing separately (not in REST collection)  
8. Confirm notifications after message with `JOBS_ENABLED=true`  
9. Confirm admin 403 for non-admin token and 200 for admin token  
10. Confirm `/metrics` scrapable if enabled  

## Artifacts in this folder

| File | Purpose |
|------|---------|
| `Chat-API.postman_collection.json` | Postman Collection v2.1 (84 requests) |
| `Chat-API.postman_environment.json` | Environment variables |
| `ENDPOINT_INVENTORY.md` | Full route table |
| `DEPENDENCY_GRAPH.md` | ID dependency graph |
| `MISSING_API_REPORT.md` | Gaps / by-design / layer audit |
| `API_TESTING_GUIDE.md` | Ordered manual test script |
| `generate-postman.mjs` | Regenerates Postman JSON |
| `COVERAGE_REPORT.md` | This file |
