#!/usr/bin/env node
/**
 * REA unified invoker.
 *
 * Resolution order:
 *   1. --rea-cmd <path> / REA_BIN           explicit REA entry script
 *   2. a built local checkout               (REA_REPO, cwd, or the skill parent)
 *   3. the best installed Node runtime      (REA_NODE, managed versions) plus
 *      the rea-agents package installed beside it
 *   4. `rea` on PATH                        (resolving .cmd shims to JS)
 *   5. `npx -y rea-agents@<pinned|latest>`
 *
 * Forwards all arguments and the child's exit code, so this behaves exactly
 * like calling `rea` directly. Set REA_DEBUG_INVOCATION=1 to see the choice.
 *
 *   node scripts/rea.mjs doctor --json
 *   node scripts/rea.mjs analyze-javascript-application /path/to/app --json
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installedRuntimes,
  npmCliFor,
  pickRuntime,
  reaScriptFor,
} from "./lib/node-runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PINNED = process.env.REA_PINNED_VERSION || "6.5.0";
const isWindows = process.platform === "win32";
const EXE_EXTENSIONS = isWindows ? [".cmd", ".exe", ".bat", ".ps1", ""] : [""];

/** Resolve a bare command name against PATH without spawning a shell. */
const which = (name) => {
  const pathEntries = (process.env.PATH || "").split(isWindows ? ";" : ":");
  for (const entry of pathEntries) {
    if (!entry) continue;
    for (const extension of EXE_EXTENSIONS) {
      const candidate = join(entry, name + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

/** A `.cmd` shim cannot be spawned without a shell; prefer the JS it wraps. */
const jsEntryBeside = (commandPath, relativeCandidates) => {
  const directory = dirname(commandPath);
  for (const relative of relativeCandidates) {
    const candidate = join(directory, relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/** Locate a built REA checkout: explicit env, cwd, or the skill parent. */
const findLocalCheckout = () => {
  const explicit = process.env.REA_REPO;
  const candidates = explicit
    ? [explicit]
    : [process.cwd(), join(HERE, "..", "..")];
  for (const root of candidates) {
    const entry = join(root, "scripts", "rea.mjs");
    const built = join(root, "dist", "mcp", "main.js");
    if (existsSync(entry) && existsSync(built)) return entry;
  }
  return null;
};

const parseArgs = (argv) => {
  const rest = [];
  let reaCmd = process.env.REA_BIN || null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--rea-cmd") {
      reaCmd = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--rea-cmd=")) {
      reaCmd = arg.slice("--rea-cmd=".length);
      continue;
    }
    rest.push(arg);
  }
  return { reaCmd, rest };
};

/** Decide the concrete command to spawn, with a human-readable label. */
const selectInvocation = (reaCmd) => {
  if (reaCmd) {
    return { command: process.execPath, args: [reaCmd], label: `override ${reaCmd}` };
  }

  const local = findLocalCheckout();
  if (local) {
    return { command: process.execPath, args: [local], label: `local checkout ${local}` };
  }

  const runtime = pickRuntime();
  const script = reaScriptFor(runtime.prefix);
  if (script) {
    return {
      command: runtime.executable,
      args: [script],
      label: `node ${runtime.version?.join(".") ?? "?"} + installed rea-agents`,
    };
  }

  const globalRea = which("rea");
  if (globalRea) {
    const resolved = jsEntryBeside(globalRea, ["node_modules/rea-agents/scripts/rea.mjs"]);
    return resolved
      ? { command: process.execPath, args: [resolved], label: `global ${resolved}` }
      : { command: globalRea, args: [], label: `global ${globalRea}` };
  }

  const npx = which("npx");
  if (npx) {
    const cli = jsEntryBeside(npx, ["node_modules/npm/bin/npx-cli.js"]);
    const args = ["-y", `rea-agents@${PINNED}`];
    return cli
      ? { command: process.execPath, args: [cli, ...args], label: `npx ${PINNED}` }
      : { command: npx, args, label: `npx ${PINNED}` };
  }

  return null;
};

const describeEnvironment = () => {
  const runtimes = installedRuntimes();
  const runtime = pickRuntime();
  const npmCli = npmCliFor(runtime.prefix);
  return [
    `[rea-wrapper] runtimes: ${runtimes.map((entry) => entry.label).join(", ") || "none"}`,
    `[rea-wrapper] selected node: ${runtime.executable} (${runtime.version?.join(".") ?? "?"}, from ${runtime.source})`,
    `[rea-wrapper] selected rea: ${reaScriptFor(runtime.prefix) ?? "not installed beside node"}`,
    `[rea-wrapper] install: ${npmCli ? `"${runtime.executable}" "${npmCli}" install -g rea-agents@latest` : "unavailable"}`,
    "",
  ].join("\n");
};

const main = () => {
  const { reaCmd, rest } = parseArgs(process.argv.slice(2));
  const debug = process.env.REA_DEBUG_INVOCATION === "1";
  if (debug) process.stderr.write(describeEnvironment());

  const invocation = selectInvocation(reaCmd);
  if (!invocation) {
    process.stderr.write(
      "REA not found.\n" +
        "  Install it:  npm install --global rea-agents\n" +
        "  Or build a checkout:  npm ci && npm run build:cached\n" +
        "  Then verify:  node scripts/check-env.mjs\n",
    );
    return 127;
  }
  if (debug) process.stderr.write(`[rea-wrapper] using ${invocation.label}\n`);

  const result = spawnSync(invocation.command, [...invocation.args, ...rest], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    process.stderr.write(`[rea-wrapper] failed to start: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
};

process.exitCode = main();
