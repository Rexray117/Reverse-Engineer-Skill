#!/usr/bin/env node
/**
 * Enumerate the live MCP tool inventory from a REA server.
 *
 * Speaks JSON-RPC over stdio to `rea mcp`, asks for `tools/list`, and prints
 * only name + first line of description, so the output stays small even when
 * the full schema payload is megabytes.
 *
 *   node scripts/list-tools.mjs                 # 分组表格
 *   node scripts/list-tools.mjs --json          # 机器可读
 *   node scripts/list-tools.mjs --grep android  # 只看匹配的
 *   node scripts/list-tools.mjs --count
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pickRuntime, reaScriptFor } from "./lib/node-runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const countOnly = argv.includes("--count");
const grepIndex = argv.indexOf("--grep");
const pattern = grepIndex === -1 ? null : (argv[grepIndex + 1] ?? "");
const isWindows = process.platform === "win32";

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

/** On Windows a global bin is a `.cmd` shim; run the JS entry instead of a shell. */
const jsEntryBeside = (commandPath, relativeCandidates) => {
  const directory = dirname(commandPath);
  for (const relative of relativeCandidates) {
    const candidate = join(directory, relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/** Same resolution order as scripts/rea.mjs, narrowed to MCP mode. */
const resolveServer = () => {
  const override = process.env.REA_BIN;
  if (override) return { command: process.execPath, args: [override] };

  const localRoot = process.env.REA_REPO ? [process.env.REA_REPO] : [];
  for (const root of [...localRoot, join(HERE, "..", "..")]) {
    const entry = join(root, "scripts", "rea.mjs");
    if (existsSync(entry) && existsSync(join(root, "dist", "mcp", "main.js"))) {
      return { command: process.execPath, args: [entry] };
    }
  }

  const runtime = pickRuntime();
  const installed = reaScriptFor(runtime.prefix);
  if (installed) {
    return { command: runtime.executable, args: [installed] };
  }

  const globalRea = which("rea");
  if (globalRea) {
    const script = jsEntryBeside(globalRea, ["node_modules/rea-agents/scripts/rea.mjs"]);
    if (script) return { command: process.execPath, args: [script] };
    return { command: globalRea, args: [], shell: isWindows };
  }

  const npx = which("npx");
  if (npx) {
    const cli = jsEntryBeside(npx, ["node_modules/npm/bin/npx-cli.js"]);
    const version = process.env.REA_PINNED_VERSION || "6.5.0";
    if (cli) {
      return { command: process.execPath, args: [cli, "-y", `rea-agents@${version}`] };
    }
    return { command: npx, args: ["-y", `rea-agents@${version}`], shell: isWindows };
  }
  return null;
};

/** Group names into readable families. Order matters: first match wins. */
const GROUP_RULES = [
  ["会话与生命周期", /^(open_binary|close_binary|binary_session|open_native|open_jeb_project)$/],
  ["Android 设备（ADB）", /adb_/],
  ["Android 包分析", /^(inspect_android|search_android|trace_android|decode_android|project_android)/],
  [".NET 托管程序集", /managed/],
  ["Frida 仪表化", /frida/],
  ["GDB 调试", /^gdb/],
  ["Rizin / Cutter", /^(rizin|cutter)/],
  ["固件", /firmware/],
  ["数据包", /(packet|pcap)/],
  ["逻辑信号", /signal/],
  ["进程行为", /process/],
  ["Electron", /electron/],
  [
    "Web / 浏览器",
    /^(list_browser|capture_browser|inspect_web|observe_web|trace_web|compare_web|export_web|discover_webmcp|capture_web)/,
  ],
  [
    "JavaScript 应用",
    /(javascript|^analyze_web_bundle|^trace_application|^compare_application|^compare_source|^correlate_static)/,
  ],
  [
    "证据 / 比对 / 未知账本",
    /(evidence|^inspect_analysis_view|^compare_|unknown|reconstruction|^find_changed_behavior)/,
  ],
  [
    "字节码与离线数据",
    /(wasm|evm|sqlite|^inspect_go_binary|^inspect_rust_binary|^inspect_binary_layout|^inspect_recorded_crash|^inspect_pe_resources|^inspect_with_objdump)/,
  ],
  [
    "工件 / Apple / Flutter / JEB",
    /^(inspect_artifact|extract_artifact|project_apple|inspect_macho|inspect_plist|inspect_signature|inspect_keyed|inspect_asset|inspect_dart|identify_flutter|decode_interface|list_architectures|project_harmony|inspect_apktool|list_jeb|decompile_jeb|inspect_jeb)/,
  ],
];

const groupOf = (name) => {
  for (const [group, pattern] of GROUP_RULES) {
    if (pattern.test(name)) return group;
  }
  return "原生分析";
};

const send = (child, message) => {
  child.stdin.write(`${JSON.stringify(message)}\n`);
};

const collect = () =>
  new Promise((resolve, reject) => {
    const server = resolveServer();
    if (!server) {
      reject(new Error("找不到 REA（rea / npx / 本地构建）"));
      return;
    }
    const child = spawn(server.command, [...server.args, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: server.shell === true,
    });
    let buffer = "";
    let tools = null;
    let stderrTail = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("tools/list 超时（60s）"));
    }, 60000);

    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 2 && message.result?.tools) {
          tools = message.result.tools;
        } else if (message.id === 1 && message.result) {
          send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
          send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        }
      }
      if (tools) {
        clearTimeout(timer);
        child.kill();
        resolve({ tools, stderr: stderrTail, server });
      }
    });
    child.on("exit", () => {
      if (!tools) {
        clearTimeout(timer);
        reject(new Error(`服务器在返回工具清单前退出\n${stderrTail}`));
      }
    });

    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "rea-tool-inventory", version: "1.0.0" },
      },
    });
  });

const firstLine = (text) => (text ?? "").split(/\n/)[0].trim();

const main = async () => {
  let result;
  try {
    result = await collect();
  } catch (error) {
    process.stderr.write(`枚举失败：${error.message}\n`);
    return 1;
  }
  const entries = result.tools
    .map((tool) => ({
      name: tool.name,
      summary: firstLine(tool.description),
      group: groupOf(tool.name),
    }))
    .filter((entry) => (pattern ? entry.name.includes(pattern) : true))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (countOnly) {
    process.stdout.write(`${entries.length}\n`);
    return 0;
  }
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ total: result.tools.length, filtered: entries.length, entries }, null, 2)}\n`,
    );
    return 0;
  }

  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry.name);
  }
  process.stdout.write(`共 ${result.tools.length} 个 MCP 工具`);
  if (pattern) process.stdout.write(`（匹配 "${pattern}"：${entries.length}）`);
  process.stdout.write("\n");
  for (const [group, names] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"))) {
    process.stdout.write(`\n## ${group}（${names.length}）\n${names.join("  ")}\n`);
  }
  return 0;
};

main().then((code) => {
  process.exitCode = code;
});
