#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../plugins/excalidraw-agent-design-tools/skills/excalidraw-system-design/scripts/prepare-components.ts";

export * from "../plugins/excalidraw-agent-design-tools/skills/excalidraw-system-design/scripts/prepare-components.ts";

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`prepare-components: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
