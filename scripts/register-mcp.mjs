#!/usr/bin/env node
/**
 * Register (or remove) the REA MCP server in WorkBuddy's MCP configuration.
 *
 * Design rules, mirroring REA's own setup behaviour:
 *   - additive and idempotent: unrelated servers are preserved byte-for-byte
 *     in meaning, and an already-correct entry is reported as unchanged
 *   - fail-closed: a malformed existing file blocks the write instead of
 *     being silently replaced
 *   - a backup is written before the first modification
 *
 *   node scripts/register-mcp.mjs --dry-run
 *   node scripts/register-mcp.mjs
 *   node scripts/register-mcp.mjs --remove
 *   node scripts/register-mcp.mjs --config /path/to/mcp.json --pin 6.5.0
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import { pickRuntime, reaScriptFor } from "./lib/node-runtime.mjs";
import { detectEnvironment } from "./apply-env.mjs";
import { resolveMcpConfig } from "./lib/mcp-config.mjs";

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const flagValue = (name, fallback = null) => {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  return argv[index + 1] ?? fallback;
};

const isWindows = process.platform === "win32";
const dryRun = hasFlag("--dry-run");
const remove = hasFlag("--remove");
const asJson = hasFlag("--json");
const version = flagValue("--pin", process.env.REA_PINNED_VERSION || "6.5.0");
const mcpTarget = resolveMcpConfig({ explicit: flagValue("--config") });
const configPath = mcpTarget.path;
const serverKey = flagValue("--key", "rea");

/** Resolve a bin shim (`.cmd` on Windows) to the JS entry it wraps. */
const jsEntryBeside = (commandPath, relativeCandidates) => {
  const directory = dirname(commandPath);
  for (const relative of relativeCandidates) {
    const candidate = join(directory, relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const which = (name) => {
  const extensions = isWindows ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const entry of (process.env.PATH || "").split(isWindows ? ";" : ":")) {
    if (!entry) continue;
    for (const extension of extensions) {
      const candidate = join(entry, name + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

/**
 * Prefer `node <rea.mjs>` on the best installed runtime: MCP clients spawn
 * without a shell, so a `.cmd` shim can fail with EINVAL on Windows. Running
 * the JS entry directly also avoids npx resolution on every start.
 */
const resolveInvocation = () => {
  const explicit = flagValue("--command", null);
  if (explicit) return { command: explicit, prefix: [] };

  const runtime = pickRuntime();
  const installed = reaScriptFor(runtime.prefix);
  if (installed) {
    return { command: runtime.executable, prefix: [installed] };
  }

  const globalRea = which("rea");
  if (globalRea) {
    const script = jsEntryBeside(globalRea, ["node_modules/rea-agents/scripts/rea.mjs"]);
    if (script) return { command: process.execPath, prefix: [script] };
    return { command: globalRea, prefix: [] };
  }

  const npx = which("npx");
  if (npx) {
    const cli = jsEntryBeside(npx, ["node_modules/npm/bin/npx-cli.js"]);
    if (cli) {
      return { command: process.execPath, prefix: [cli, "-y", `rea-agents@${version}`] };
    }
    return { command: npx, prefix: ["-y", `rea-agents@${version}`] };
  }
  return { command: "npx", prefix: ["-y", `rea-agents@${version}`] };
};

const desiredEntry = () => {
  const { command, prefix } = resolveInvocation();
  const entry = { command, args: [...prefix, "mcp"] };
  // The neighbouring streamableHttp entry in this file carries an explicit
  // `type`, so declare the transport discriminator too. `--no-type` omits it
  // for clients whose schema rejects an unknown field.
  if (!hasFlag("--no-type")) entry.type = "stdio";
  // --auto-env embeds detected engine locations so the server does not depend
  // on the client inheriting the user environment.
  if (hasFlag("--auto-env")) {
    const { env } = detectEnvironment();
    if (Object.keys(env).length > 0) entry.env = env;
  }
  const extraEnv = flagValue("--env", null);
  if (extraEnv) {
    const [key, ...rest] = extraEnv.split("=");
    if (key && rest.length > 0) {
      entry.env = { ...(entry.env ?? {}), [key]: rest.join("=") };
    }
  }
  entry.disabled = false;
  return entry;
};

const stableStringify = (value) => JSON.stringify(value, null, 2);

const readConfiguration = () => {
  if (!existsSync(configPath)) {
    return { ok: true, document: { mcpServers: {} }, created: true };
  }
  const raw = readFileSync(configPath, "utf8");
  if (raw.trim() === "") return { ok: true, document: { mcpServers: {} }, created: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "配置文件顶层不是 JSON 对象" };
    }
    if (parsed.mcpServers !== undefined) {
      const servers = parsed.mcpServers;
      if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
        return { ok: false, reason: "mcpServers 不是 JSON 对象" };
      }
    }
    return { ok: true, document: parsed, created: false };
  } catch (error) {
    return { ok: false, reason: `现有配置不是合法 JSON：${error.message}` };
  }
};

const backupPath = () => `${configPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;

const main = () => {
  const read = readConfiguration();
  if (!read.ok) {
    const message =
      `拒绝写入：${read.reason}\n` +
      `路径：${configPath}\n` +
      "请先手工修复该文件；本工具不会覆盖无法解析的配置。\n";
    if (asJson) {
      process.stdout.write(`${stableStringify({ status: "blocked", reason: read.reason, path: configPath })}\n`);
    } else {
      process.stderr.write(message);
    }
    return 1;
  }

  const document = read.document;
  document.mcpServers = document.mcpServers ?? {};
  const before = document.mcpServers[serverKey];
  const desired = desiredEntry();

  let status;
  if (remove) {
    if (before === undefined) {
      status = "absent";
    } else {
      delete document.mcpServers[serverKey];
      status = "removed";
    }
  } else if (before !== undefined && stableStringify(before) === stableStringify(desired)) {
    status = "unchanged";
  } else {
    document.mcpServers[serverKey] = desired;
    status = before === undefined ? "added" : "updated";
  }

  const result = {
    status,
    path: configPath,
    serverKey,
    entry: remove ? null : desired,
    dryRun,
    backedUp: null,
  };

  if (dryRun || status === "unchanged" || status === "absent") {
    if (asJson) {
      process.stdout.write(`${stableStringify(result)}\n`);
    } else {
      process.stdout.write(`状态：${status}${dryRun ? "（dry-run，未写入）" : ""}\n路径：${configPath}\n`);
      if (!remove) process.stdout.write(`条目：\n${stableStringify(desired)}\n`);
    }
    return 0;
  }

  const backup = existsSync(configPath) ? backupPath() : null;
  if (backup) writeFileSync(backup, readFileSync(configPath));
  result.backedUp = backup;
  mkdirSync(dirname(configPath), { recursive: true });

  // Atomic replacement: write beside the target, then rename over it.
  const staging = `${configPath}.rea-staging`;
  writeFileSync(staging, `${stableStringify(document)}\n`);
  renameSync(staging, configPath);

  if (asJson) {
    process.stdout.write(`${stableStringify(result)}\n`);
  } else {
    process.stdout.write(`状态：${status}\n路径：${configPath}\n`);
    if (backup) process.stdout.write(`备份：${backup}\n`);
    if (!remove) {
      process.stdout.write(`条目：\n${stableStringify(desired)}\n`);
      process.stdout.write(
        "\n下一步：在客户端「连接器」页面找到该服务器并点击「信任」才会生效；" +
          "之后重启会话。验证：\n  node scripts/rea.mjs doctor --json\n",
      );
    }
  }
  return 0;
};

process.exitCode = main();
