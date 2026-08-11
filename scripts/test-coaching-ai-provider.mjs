#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runner = resolve(here, "test-coaching-ai-provider.ts");

const result = spawnSync("npx", ["tsx", runner], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
