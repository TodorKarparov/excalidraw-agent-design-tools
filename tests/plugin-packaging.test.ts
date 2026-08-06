import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(repositoryRoot, "plugins/excalidraw-agent-design-tools");

const paths = {
  claudeManifest: resolve(pluginRoot, ".claude-plugin/plugin.json"),
  claudeMarketplace: resolve(repositoryRoot, ".claude-plugin/marketplace.json"),
  codexManifest: resolve(pluginRoot, ".codex-plugin/plugin.json"),
  codexMarketplace: resolve(repositoryRoot, ".agents/plugins/marketplace.json"),
  helper: resolve(pluginRoot, "skills/excalidraw-system-design/scripts/prepare-components.ts"),
  package: resolve(pluginRoot, "package.json"),
  skill: resolve(pluginRoot, "skills/excalidraw-system-design/SKILL.md"),
};

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveManifestPath(root: string, value: string) {
  assert.ok(value.startsWith("./"), `manifest path must start with ./: ${value}`);
  const path = resolve(root, value);
  assert.ok(existsSync(path), `manifest path does not exist: ${value}`);
  return path;
}

function nodeAtLeast22_18(version: string) {
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 18);
}

test("Codex and Claude manifests and marketplaces contain valid JSON", () => {
  for (const path of [
    paths.codexManifest,
    paths.claudeManifest,
    paths.codexMarketplace,
    paths.claudeMarketplace,
  ]) {
    assert.doesNotThrow(() => readJson(path), path);
  }
});

test("Claude manifest uses only supported metadata fields and conventional skill discovery", () => {
  const manifest = readJson(paths.claudeManifest);
  const supportedFields = new Set([
    "name",
    "displayName",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
  ]);

  assert.equal(manifest.name, "excalidraw-agent-design-tools");
  assert.equal(manifest.displayName, "Excalidraw System Design");
  assert.deepEqual(
    Object.keys(manifest).filter((field) => !supportedFields.has(field)),
    [],
  );
  assert.ok(!("skills" in manifest), "Claude discovers the conventional skills/ path automatically");
  assert.ok(existsSync(resolve(pluginRoot, "skills/excalidraw-system-design/SKILL.md")));
});

test("Claude marketplace references the real plugin directory", () => {
  const marketplace = readJson(paths.claudeMarketplace);
  assert.equal(marketplace.name, "excalidraw-design-tools");
  assert.equal(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0];
  assert.equal(entry.name, "excalidraw-agent-design-tools");
  assert.equal(resolveManifestPath(repositoryRoot, entry.source), pluginRoot);
});

test("manifest versions stay synchronized", () => {
  const codexManifest = readJson(paths.codexManifest);
  const claudeManifest = readJson(paths.claudeManifest);
  assert.equal(claudeManifest.version, codexManifest.version);

  for (const marketplacePath of [paths.codexMarketplace, paths.claudeMarketplace]) {
    const marketplace = readJson(marketplacePath);
    const entry = marketplace.plugins.find(
      (candidate: Record<string, unknown>) => candidate.name === codexManifest.name,
    );
    if (entry?.version !== undefined) {
      assert.equal(entry.version, codexManifest.version, marketplacePath);
    }
  }
});

test("plugin package requires Node 22.18 or newer without dependencies", () => {
  const packageJson = readJson(paths.package);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.engines?.node, ">=22.18.0");
  assert.ok(!("dependencies" in packageJson));
  assert.ok(!("devDependencies" in packageJson));
});

test("every local path referenced by Codex manifests exists", () => {
  const manifest = readJson(paths.codexManifest);
  const skillPaths = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
  for (const path of skillPaths) {
    resolveManifestPath(pluginRoot, path);
  }

  const marketplace = readJson(paths.codexMarketplace);
  for (const entry of marketplace.plugins) {
    assert.equal(entry.source.source, "local");
    resolveManifestPath(repositoryRoot, entry.source.path);
  }
});

test("prepare-components.ts runs directly on the required Node runtime", () => {
  assert.ok(
    nodeAtLeast22_18(process.versions.node),
    `tests require Node >=22.18.0, found ${process.versions.node}`,
  );
  const result = spawnSync(process.execPath, [paths.helper, "validate"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const validation = JSON.parse(result.stdout);
  assert.equal(validation.valid, true);
  assert.equal(validation.assets, 16);
});

test("skill documents Claude cache paths, Node handling, and MCP compatibility guardrails", () => {
  const skill = readFileSync(paths.skill, "utf8");
  assert.match(skill, /\$\{CLAUDE_SKILL_DIR\}\/scripts\/prepare-components\.ts/);
  assert.match(skill, /node --version/);
  assert.match(skill, />=22\.18\.0/);
  assert.match(skill, /nvm use 22/);
  assert.match(skill, /Never install Node silently/);
  assert.match(skill, /edit_scene_content/);
  assert.match(skill, /tempId/);
  assert.match(skill, /startBinding/);
  assert.match(skill, /endBinding/);
  assert.match(skill, /boundElements/);
  assert.match(skill, /mcp\.excalidraw\.com/);
  assert.match(skill, /not a drop-in replacement/);
});
