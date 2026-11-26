/**
 * Vercel-only entrypoint.
 *
 * Vercel compiles the Express entry to `/var/task/server.js` and often loads it
 * as CommonJS, which breaks our ESM `import` syntax. Using a `.mts` entry forces
 * the runtime to treat the module as ESM (same idea as `.mjs`).
 *
 * Local / Docker / Render keep using `src/server.ts` via package.json scripts.
 */
import express from "express";

// Required for Vercel Express framework detection on this entry file.
void express;

export { default, bootstrap } from "./server.js";
