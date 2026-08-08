# Chat Backend

Layered Express + TypeScript API for the Chat frontend.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full folder tree, dependency graph, and layer rules.

## Status

Architecture scaffold only:

- Infrastructure, DI, middleware, health checks — **ready**
- Business API endpoints — **not implemented yet**
- Frontend repo is **not modified**

## Quick start

```bash
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

Health: `GET /health` · Ready: `GET /ready`
