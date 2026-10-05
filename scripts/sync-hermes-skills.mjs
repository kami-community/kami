#!/usr/bin/env node
/**
 * Validate repo skills/ and agents/, then sync skills into the local Hermes
 * home under skills/gtm/. Agents are read by the web app at runtime (they are
 * sent as system prompts), so they are validated here but not copied.
 *
 *   npm run sync:skills            validate + sync
 *   npm run sync:skills -- --check validate only (used in CI)
 *
 * Hermes home: HERMES_HOME, else %LOCALAPPDATA%\hermes on Windows, else ~/.hermes.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

/** Parse `name` and `description` from YAML-style frontmatter. */
function frontmatter(path) {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fields;
}

function validate(dir, fileFor) {
  const problems = [];
  const names = readdirSync(join(root, dir), { withFileTypes: true })
    .map((d) => fileFor(d))
    .filter(Boolean);
  for (const { name, path } of names) {
    const fm = frontmatter(path);
    if (!fm) problems.push(`${path}: missing frontmatter`);
    else {
      if (fm.name !== name) problems.push(`${path}: name "${fm.name}" should be "${name}"`);
      if (!fm.description) problems.push(`${path}: missing description`);
    }
  }
  return { names, problems };
}

const skills = validate("skills", (d) =>
  d.isDirectory() ? { name: d.name, path: join(root, "skills", d.name, "SKILL.md") } : null,
);
const agents = validate("agents", (d) =>
  d.isFile() && d.name.endsWith(".md")
    ? { name: d.name.replace(/\.md$/, ""), path: join(root, "agents", d.name) }
    : null,
);

// Every skill an agent references must exist.
const skillNames = new Set(skills.names.map((s) => s.name));
const registry = readFileSync(join(root, "web", "lib", "hermes", "agents.ts"), "utf8");
for (const [, list] of registry.matchAll(/skills:\s*\[([^\]]*)\]/g)) {
  for (const [, skill] of list.matchAll(/"([a-z0-9_]+)"/g)) {
    if (!skillNames.has(skill)) agents.problems.push(`web/lib/hermes/agents.ts references missing skill "${skill}"`);
  }
}
for (const [, file] of registry.matchAll(/file:\s*"([^"]+)"/g)) {
  if (!existsSync(join(root, "agents", file))) agents.problems.push(`web/lib/hermes/agents.ts references missing agents/${file}`);
}

// Every agent role file must be registered (and so actually used) by the app,
// except leaf specialists that only run as Hermes delegate_task subagents.
const DELEGATE_ONLY = new Set(["distribution-platform-specialist"]);
const registered = new Set([...registry.matchAll(/file:\s*"([^"]+)\.md"/g)].map((m) => m[1]));
for (const { name } of agents.names) {
  if (!registered.has(name) && !DELEGATE_ONLY.has(name)) {
    agents.problems.push(`agents/${name}.md is not registered in web/lib/hermes/agents.ts`);
  }
}

const problems = [...skills.problems, ...agents.problems];
if (problems.length) {
  console.error(`Invalid skills/agents:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`OK: ${skills.names.length} skills, ${agents.names.length} agents`);
if (checkOnly) process.exit(0);

const hermesHome =
  process.env.HERMES_HOME ||
  (process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "hermes")
    : join(homedir(), ".hermes"));
const dest = join(hermesHome, "skills", "gtm");
mkdirSync(dest, { recursive: true });
for (const { name } of skills.names) {
  cpSync(join(root, "skills", name), join(dest, name), { recursive: true });
  console.log(`synced ${name}`);
}
writeFileSync(
  join(dest, "DESCRIPTION.md"),
  `# Kami GTM skills\n\nSynced from the Kami repo on ${new Date().toISOString()}.\n`,
  "utf8",
);
console.log(`\nHermes skills home: ${dest}\nRestart Hermes sessions if skills were already loaded.`);
