#!/usr/bin/env node
/**
 * REA environment check.
 *
 * Verifies the runtime REA needs, then probes every external engine that REA
 * can use. Nothing is installed and nothing is modified: this is read-only.
 *
 * Reports three independent things, because they fail independently:
 *   1. installation  - is the engine on disk          (filesystem probe)
 *   2. reachability  - can THIS process hand it to REA (process env / PATH)
 *   3. alignment     - does the skill still describe the installed REA
 *
 * A row that is installed but has no process variable reports NO-ENV: the MCP
 * server still reaches it when its entry embeds the variable, while a CLI call
 * in the same shell does not. Collapsing that into OK is how a readiness check
 * starts producing false confidence.
 *
 *   node scripts/check-env.mjs
 *   node scripts/check-env.mjs --json
 *   node scripts/check-env.mjs --deep     # + npm, live tool count, rea --help
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  installedRuntimes,
  npmCliFor,
  pickRuntime,
} from "./lib/node-runtime.mjs";
import { detectEnvironment } from "./apply-env.mjs";
import { resolveMcpConfig } from "./lib/mcp-config.mjs";

const isWindows = process.platform === "win32";
const EXTENSIONS = isWindows
  ? [".exe", ".cmd", ".bat", ".ps1", ""]
  : ["", ".sh"];

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const deep = argv.includes("--deep");

/** Parse "MAJOR.MINOR.PATCH" into numbers; null when unparsable. */
const parseVersion = (text) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text ?? "");
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : null;
};

const atLeast = (version, minimum) => {
  for (let index = 0; index < 3; index += 1) {
    if (version[index] > minimum[index]) return true;
    if (version[index] < minimum[index]) return false;
  }
  return true;
};

/** REA's engines field: ^22.19 || ^24.11 || >=26 */
const nodeSupported = (version) => {
  if (!version) return false;
  const [major, minor] = version;
  if (major === 22) return atLeast([major, minor, 0], [22, 19, 0]);
  if (major === 24) return atLeast([major, minor, 0], [24, 11, 0]);
  return major >= 26;
};

/** SQLite inspection needs Node 24.15+ or 26+ (DatabaseSync.limits). */
const sqliteSupported = (version) => {
  if (!version) return false;
  const [major, minor] = version;
  if (major === 24) return minor >= 15;
  return major >= 26;
};

const pathEntries = () =>
  (process.env.PATH || "").split(isWindows ? ";" : ":").filter(Boolean);

const which = (name) => {
  for (const entry of pathEntries()) {
    for (const extension of EXTENSIONS) {
      const candidate = join(entry, name + extension);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        // Unreadable PATH entries are not failures worth reporting.
      }
    }
  }
  return null;
};

const firstExisting = (candidates) => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // Ignore unreadable candidates.
    }
  }
  return null;
};

const envPath = (name) => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
};

/**
 * A row in the report. `state` drives the summary counts.
 *
 * `provenance` records why the row is in that state, because "installed" and
 * "callable from this process" are different claims:
 *   env  - the current process has the variable REA needs
 *   path - resolvable on PATH (CLI may still reject a bare name on Windows)
 *   fs   - only visible through filesystem probing; the process env is empty
 *   none - nothing was found
 */
const row = (name, state, detail, usedFor, provenance = "none") => ({
  name,
  state,
  detail,
  usedFor,
  provenance,
});

/**
 * Probe one external command. `envNames` may be a single name or an array:
 * REA accepts several overrides for the same tool (for example REA_GDB_COMMAND
 * for the binary and REA_PWNDBG_GDB for the pwndbg wrapper), and checking only
 * one of them reports MISSING for an engine REA can actually reach.
 */
const probeCommand = (name, envNames, usedFor) => {
  const names =
    envNames === null || envNames === undefined
      ? []
      : Array.isArray(envNames)
        ? envNames
        : [envNames];
  for (const envName of names) {
    const fromEnv = envPath(envName);
    if (!fromEnv) continue;
    if (existsSync(fromEnv)) {
      return row(name, "ok", `${envName}=${fromEnv}`, usedFor, "env");
    }
    // A command may be a bare name rather than an absolute path.
    const resolved = which(fromEnv);
    if (resolved) return row(name, "ok", `${envName}→${resolved}`, usedFor, "env");
    return row(name, "broken", `${envName} 指向不存在的路径: ${fromEnv}`, usedFor, "env");
  }
  const found = which(name);
  if (found) return row(name, "ok", found, usedFor, "path");
  const expected =
    names.length === 0
      ? ""
      : names.length === 1
        ? `（${names[0]} 未设置）`
        : `（${names.join(" / ")} 均未设置）`;
  return row(name, "missing", `未在 PATH 中找到${expected}`, usedFor, "none");
};

const probeHopper = () => {
  const fromEnv = envPath("HOPPER_LAUNCHER_PATH");
  if (fromEnv && existsSync(fromEnv)) {
    return row("Hopper", "ok", `HOPPER_LAUNCHER_PATH=${fromEnv}`, "原生深度分析", "env");
  }
  const macCandidate = firstExisting([
    "/Applications/Hopper Disassembler.app/Contents/MacOS/Hopper",
    join(homedir(), "Applications/Hopper Disassembler.app/Contents/MacOS/Hopper"),
  ]);
  if (macCandidate) return row("Hopper", "ok", macCandidate, "原生深度分析", "path");
  const found = which("hopper") || which("Hopper");
  if (found) return row("Hopper", "ok", found, "原生深度分析", "path");
  return row(
    "Hopper",
    "missing",
    process.platform === "darwin" || process.platform === "linux"
      ? "未安装（可选引擎）"
      : "当前平台不支持 Hopper",
    "原生深度分析",
  );
};

const probeGhidra = () => {
  const installDir = envPath("GHIDRA_INSTALL_DIR");
  if (installDir) {
    const launcher = firstExisting([
      join(installDir, "support", "analyzeHeadless"),
      join(installDir, "support", "analyzeHeadless.bat"),
      join(installDir, "ghidraRun"),
    ]);
    if (launcher) {
      const javaHome = envPath("JAVA_HOME");
      return row(
        "Ghidra",
        javaHome ? "ok" : "partial",
        `GHIDRA_INSTALL_DIR=${installDir}${javaHome ? "" : "（未设置 JAVA_HOME，若无内嵌 JDK 会启动失败）"}`,
        "原生深度分析（跨平台）",
        "env",
      );
    }
    return row(
      "Ghidra",
      "broken",
      `GHIDRA_INSTALL_DIR=${installDir} 下找不到 support/analyzeHeadless`,
      "原生深度分析（跨平台）",
      "env",
    );
  }
  const found = which("analyzeHeadless") || which("ghidraRun");
  if (found) return row("Ghidra", "ok", found, "原生深度分析（跨平台）", "path");
  return row("Ghidra", "missing", "未配置 GHIDRA_INSTALL_DIR", "原生深度分析（跨平台）");
};

const probeIda = () => {
  const config = envPath("REA_IDA_MCP_CONFIG");
  if (config) {
    return existsSync(config)
      ? row("IDA", "ok", `REA_IDA_MCP_CONFIG=${config}`, "原生深度分析", "env")
      : row("IDA", "broken", `REA_IDA_MCP_CONFIG 指向不存在的文件: ${config}`, "原生深度分析", "env");
  }
  const found = which("ida64") || which("idat64") || which("ida");
  if (found) {
    return row(
      "IDA",
      "partial",
      `${found}（未设置 REA_IDA_MCP_CONFIG，MCP 适配层未配置）`,
      "原生深度分析",
      "path",
    );
  }
  return row("IDA", "missing", "未安装 / 未配置 MCP 适配层", "原生深度分析");
};

const probeJadx = () => {
  const jar = envPath("REA_JADX_MCP_JAR");
  if (jar) {
    return existsSync(jar)
      ? row("JADX", "ok", `REA_JADX_MCP_JAR=${jar}`, "APK 方法级反编译", "env")
      : row("JADX", "broken", `REA_JADX_MCP_JAR 指向不存在的文件: ${jar}`, "APK 方法级反编译", "env");
  }
  const found = which("jadx");
  if (found) return row("JADX", "ok", found, "APK 方法级反编译", "path");
  return row("JADX", "missing", "未配置（APK 清单仍可读，方法级反编译不可用）", "APK 方法级反编译");
};

const probeWabt = () => {
  const directory = envPath("REA_WABT_BIN_DIRECTORY");
  if (directory) {
    const tool = firstExisting([
      join(directory, isWindows ? "wasm2wat.exe" : "wasm2wat"),
      join(directory, "wasm-objdump"),
    ]);
    return tool
      ? row("WABT", "ok", tool, "WASM 检查", "env")
      : row("WABT", "broken", `${directory} 下找不到 wasm2wat`, "WASM 检查", "env");
  }
  const found = which("wasm2wat");
  return found
    ? row("WABT", "ok", found, "WASM 检查", "path")
    : row("WABT", "missing", "需自备 WABT 1.0.42", "WASM 检查");
};

const probePwntools = (fallbackPython = null) => {
  const fromEnv = envPath("REA_PWNTOOLS_PYTHON");
  const python = fromEnv || fallbackPython || which("python3") || which("python");
  // A fallback interpreter came from filesystem detection, not from this
  // process's environment: the module may exist while REA cannot be pointed at
  // it without the variable, so say so instead of implying reachability.
  const detectedOnly = !fromEnv && Boolean(fallbackPython) && python === fallbackPython;
  const provenance = fromEnv ? "env" : detectedOnly ? "fs" : "path";
  const detectedNote = detectedOnly ? "；本进程无 REA_PWNTOOLS_PYTHON，仅文件系统可见" : "";
  if (!python) {
    return row("pwntools", "missing", "找不到 python 解释器", "离线 ELF 布局 / core dump");
  }
  if (!deep) {
    return row(
      "pwntools",
      "unknown",
      `解释器 ${python}${detectedNote}（--deep 才会探测模块）`,
      "离线 ELF 布局 / core dump",
      provenance,
    );
  }
  const probe = spawnSync(python, ["-c", "import pwn; print(pwn.__version__)"], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  if (probe.status === 0) {
    return row(
      "pwntools",
      "ok",
      `${python} · pwn ${probe.stdout.trim()}`,
      "离线 ELF 布局 / core dump",
      provenance,
    );
  }
  return row("pwntools", "missing", `${python} 中 import pwn 失败`, "离线 ELF 布局 / core dump");
};

const probeBrowser = () => {
  const fromEnv = envPath("REA_BROWSER_EXECUTABLE");
  if (fromEnv && existsSync(fromEnv)) {
    return row("Chromium 系浏览器", "ok", `REA_BROWSER_EXECUTABLE=${fromEnv}`, "网页/Electron 观测", "env");
  }
  const candidates = isWindows
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      ]
    : [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ];
  const found = firstExisting(candidates);
  return found
    ? row("Chromium 系浏览器", "ok", found, "网页/Electron 观测", "path")
    : row("Chromium 系浏览器", "missing", "未找到 Chrome/Edge/Chromium", "网页/Electron 观测");
};

/**
 * Frida ships as an optional dependency of rea-agents, so it is usually
 * nested inside the package rather than hoisted. Check the module itself,
 * and only trust a deep probe when --deep is set.
 */
const probeFrida = () => {
  const usedFor = "运行时仪表化（会执行外来代码）";
  const onPath = which("frida");
  if (onPath) return row("Frida", "ok", onPath, usedFor, "path");

  const runtime = pickRuntime();
  const candidates = [
    join(runtime.prefix, "node_modules", "rea-agents", "node_modules", "frida"),
    join(runtime.prefix, "node_modules", "frida"),
    process.env.NODE_PATH ? join(process.env.NODE_PATH, "frida") : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const manifest = join(candidate, "package.json");
    if (!existsSync(manifest)) continue;
    let version = "";
    try {
      version = JSON.parse(readFileSync(manifest, "utf8")).version ?? "";
    } catch {
      // A readable directory with an unreadable manifest is still installed.
    }
    if (!deep) {
      return row("Frida", "ok", `${candidate}${version ? ` · v${version}` : ""}`, usedFor, "path");
    }
    const probe = spawnSync(
      runtime.executable,
      [
        "-e",
        `require(${JSON.stringify(candidate)}).enumerateDevices().then(d=>{console.log(d.length);}).catch(e=>{console.error(e.message);process.exit(1)})`,
      ],
      { encoding: "utf8", timeout: 30000, windowsHide: true },
    );
    return probe.status === 0
      ? row("Frida", "ok", `${candidate} · ${probe.stdout.trim()} 个设备`, usedFor, "path")
      : row("Frida", "broken", `${candidate} 模块存在但无法枚举设备`, usedFor);
  }
  return row("Frida", "missing", "可选依赖未安装（impact 仅限 Frida 仪表化）", usedFor);
};

const probePs = () => {
  if (process.platform !== "linux") {
    return row("procps ps", "ok", "非 Linux，无需检查", "Ghidra/JADX/固件/静态 JS 的进程归属");
  }
  const found = which("ps");
  if (!found) {
    return row("procps ps", "broken", "缺少 ps：Ghidra/JADX/固件工具与静态 JS 无法校验进程归属", "进程归属");
  }
  const probe = spawnSync(found, ["-o", "pid,ppid,pgid,uid,stat,comm", "-p", String(process.pid)], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  return probe.status === 0
    ? row("procps ps", "ok", found, "进程归属")
    : row("procps ps", "partial", `${found} 不支持所需字段`, "进程归属");
};

const probeNpm = () => {
  if (!deep) return row("npm", "unknown", "未探测（--deep 启用）", "安装与更新 REA");
  const runtime = pickRuntime();
  const cli = npmCliFor(runtime.prefix);
  if (!cli) return row("npm", "missing", `在 ${runtime.prefix} 下找不到 npm`, "安装与更新 REA");
  const probe = spawnSync(runtime.executable, [cli, "-v"], {
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
  });
  return probe.status === 0
    ? row("npm", "ok", `v${probe.stdout.trim()}（${runtime.executable}）`, "安装与更新 REA")
    : row("npm", "partial", "npm -v 执行失败", "安装与更新 REA");
};

const reaEnvironmentVariables = () =>
  Object.keys(process.env)
    .filter((name) => /^REA_|^GHIDRA_|^HOPPER_|^JAVA_HOME$/.test(name))
    .sort()
    .map((name) => ({ name, value: process.env[name] }));

const buildReport = () => {
  const installed = installedRuntimes();
  const selected = pickRuntime();
  const version = selected.version;
  // Resolved first: a freshly installed engine must be visible even when this
  // process predates `apply-env --apply` (setx only affects new processes).
  const detected = detectEnvironment().detected;
  const runtime = [
    row(
      "Node.js（选中）",
      nodeSupported(version) ? "ok" : "broken",
      `v${version?.join(".") ?? "?"} · 来源 ${selected.source}（要求 ^22.19 || ^24.11 || >=26）`,
      "运行 REA",
    ),
    row(
      "已装运行时",
      installed.length > 0 ? "ok" : "missing",
      installed.length > 0
        ? installed.map((entry) => `v${entry.version.join(".")}`).join(", ")
        : `仅当前进程 v${process.version}`,
      "版本选择",
    ),
    row(
      "SQLite 能力",
      sqliteSupported(version) ? "ok" : "unavailable",
      sqliteSupported(version)
        ? "支持 inspect_sqlite_database"
        : "需 Node 24.15+ 或 26+（DatabaseSync.limits）",
      "SQLite 快照",
    ),
    probeNpm(),
    probePs(),
  ];
  const engines = [
    probeHopper(),
    probeGhidra(),
    probeIda(),
    probeCommand("JEB", "REA_JEB_MCP_URL", "JEB 工程分析"),
    probeCommand("objdump", ["REA_OBJDUMP_COMMAND"], "离线反汇编"),
    probeCommand("rizin", "REA_RIZIN_COMMAND", "Rizin 会话/调试"),
    probeCommand("gdb", ["REA_GDB_COMMAND", "REA_PWNDBG_GDB"], "GDB/MI 调试"),
    probeFrida(),
  ];
  const targets = [
    probeJadx(),
    probeCommand("apktool", "REA_APKTOOL_COMMAND", "APK 资源解码"),
    probeCommand("adb", "REA_ADB_PATH", "Android 设备"),
    probeCommand("binwalk", "REA_BINWALK_COMMAND", "固件区域"),
    probeCommand("unblob", "REA_UNBLOB_COMMAND", "固件提取"),
    probeCommand("tshark", "REA_TSHARK_COMMAND", "pcap 字段/摘要"),
    probeCommand("capinfos", ["REA_CAPINFOS_COMMAND"], "pcap 摘要"),
    probeCommand("sigrok-cli", "REA_SIGROK_COMMAND", "逻辑信号解码"),
    probeWabt(),
    probePwntools(detected.pwntools),
    probeCommand("wakaru", "REA_WAKARU_COMMAND", "JS 代码分块恢复"),
    probeCommand("ilspycmd", "REA_ILSPY_CMD_PATH", ".NET 反编译辅助"),
    probeCommand("mitmdump", "REA_MITMDUMP_COMMAND", "原生 mitmproxy 抓包"),
    probeBrowser(),
  ];
  // The current process may not see variables written by `apply-env --apply`
  // (setx only affects new processes). Fall back to filesystem detection so a
  // freshly installed engine still reports correctly from an old shell.
  const besideTshark = detected.tshark
    ? join(detected.tshark, "..", isWindows ? "capinfos.exe" : "capinfos")
    : null;
  const hints = {
    Ghidra: detected.ghidra,
    JADX: detected.jadx,
    WABT: detected.wabt,
    rizin: detected.rizin,
    tshark: detected.tshark,
    capinfos: besideTshark && existsSync(besideTshark) ? besideTshark : null,
    apktool: detected.apktool,
    pwntools: detected.pwntools,
    objdump: detected.mingwBin
      ? join(detected.mingwBin, isWindows ? "objdump.exe" : "objdump")
      : null,
    gdb: detected.mingwBin ? join(detected.mingwBin, isWindows ? "gdb.exe" : "gdb") : null,
    binwalk: detected.firmware.binwalk,
    unblob: detected.firmware.unblob,
  };
  /* The variable REA actually reads for each row. A filesystem-only hit must
     name the prefix the caller has to supply, otherwise "OK" is a claim about
     installation rather than about reachability. */
  const ENV_FOR = {
    Ghidra: "GHIDRA_INSTALL_DIR",
    JADX: "REA_JADX_MCP_JAR",
    WABT: "REA_WABT_BIN_DIRECTORY",
    rizin: "REA_RIZIN_COMMAND",
    tshark: "REA_TSHARK_COMMAND",
    capinfos: "REA_CAPINFOS_COMMAND",
    apktool: "REA_APKTOOL_COMMAND",
    objdump: "REA_OBJDUMP_COMMAND",
    gdb: "REA_GDB_COMMAND",
    pwntools: "REA_PWNTOOLS_PYTHON",
    binwalk: "REA_BINWALK_COMMAND",
    unblob: "REA_UNBLOB_COMMAND",
  };
  // Only `missing` is promoted: a `broken` row means the variable IS set but
  // points somewhere wrong, which is a configuration error to surface, not a
  // shell-inheritance artefact to explain away.
  for (const entry of [...engines, ...targets]) {
    const hint = hints[entry.name];
    if (!hint || entry.state !== "missing") continue;
    const envName = ENV_FOR[entry.name] ?? null;
    entry.state = "envless";
    entry.provenance = "fs";
    entry.hint = hint;
    entry.envName = envName;
    entry.detail = `${hint}（仅文件系统可见，进程 env 无变量）`;
  }
  const envless = [...engines, ...targets]
    .filter((entry) => entry.state === "envless" && entry.envName)
    .map((entry) => ({ name: entry.name, envName: entry.envName, path: entry.hint }));
  const cliPrefix = envless.map((entry) => `${entry.envName}="${entry.path}"`).join(" ");
  return {
    runtime,
    engines,
    targets,
    env: reaEnvironmentVariables(),
    envless,
    cliPrefix,
    mcp: readMcpEntry(),
  };
};

/**
 * What the MCP server will see. REA's own processes do not inherit the client
 * shell, so an entry that embeds these variables works while a bare CLI in the
 * same shell does not. Reading the entry is the only way to tell them apart
 * without starting the server.
 */
function readMcpEntry() {
  const resolved = resolveMcpConfig({
    explicit: envPath("REA_MCP_CONFIG"),
    env: process.env,
  });
  const configPath = resolved.path;
  if (!existsSync(configPath)) {
    return { path: configPath, state: "missing", envNames: [], command: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    const entry = parsed?.mcpServers?.rea;
    if (!entry) return { path: configPath, state: "absent", envNames: [], command: null };
    return {
      path: configPath,
      state: entry.disabled === true ? "disabled" : "present",
      envNames: Object.keys(entry.env ?? {}),
      command: entry.command ?? null,
    };
  } catch {
    return { path: configPath, state: "unreadable", envNames: [], command: null };
  }
}

const STATE_LABEL = {
  ok: "OK",
  envless: "NO-ENV",
  stale: "STALE",
  partial: "PARTIAL",
  broken: "BROKEN",
  missing: "MISSING",
  unknown: "UNKNOWN",
  unavailable: "N/A",
};

/** Terminal column width: CJK and fullwidth characters occupy two cells. */
const displayWidth = (text) =>
  [...text].reduce((total, character) => {
    const code = character.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    return total + (wide ? 2 : 1);
  }, 0);

const padTo = (text, width) => text + " ".repeat(Math.max(0, width - displayWidth(text)));

const renderTable = (rows) => {
  const widthName = Math.max(...rows.map((entry) => displayWidth(entry.name)), 4);
  const widthState = 8;
  return rows
    .map(
      (entry) =>
        `  ${padTo(entry.name, widthName)}  ${padTo(STATE_LABEL[entry.state], widthState)}  ${entry.detail}`,
    )
    .join("\n");
};

const summarize = (report) => {
  const byState = (rows) =>
    rows.reduce((totals, entry) => {
      totals[entry.state] = (totals[entry.state] || 0) + 1;
      return totals;
    }, {});
  const all = [...report.engines, ...report.targets];
  const find = (name) => all.find((entry) => entry.name === name);
  const mcpEnv = new Set(report.mcp?.envNames ?? []);

  /**
   * Two channels, two answers. The MCP server runs with the variables embedded
   * in its own entry; a CLI call in this shell only sees this process's env.
   * A row that exists on disk but has no variable here is reachable by exactly
   * one of them, so collapsing both into one "OK" hides the difference.
   */
  const reachable = (entry, channel) => {
    if (!entry) return false;
    if (entry.state === "ok") return true;
    if (entry.state !== "envless") return false;
    if (channel === "cli") return false;
    return entry.envName ? mcpEnv.has(entry.envName) : true;
  };
  const capabilitiesFor = (channel) => {
    const deepEngine = ["Hopper", "Ghidra", "IDA"].some((name) =>
      reachable(find(name), channel),
    );
    const anyOf = (...names) => names.some((name) => reachable(find(name), channel));
    return {
      静态分析_无需引擎: true,
      原生深度分析: deepEngine,
      APK方法级反编译: reachable(find("JADX"), channel),
      Android设备: reachable(find("adb"), channel),
      固件: process.platform === "linux" && anyOf("binwalk", "unblob"),
      网络抓包: anyOf("tshark", "capinfos"),
      WASM: reachable(find("WABT"), channel),
      离线ELF与core: process.platform === "linux" && reachable(find("pwntools"), channel),
      浏览器观测: reachable(find("Chromium 系浏览器"), channel),
    };
  };
  const linuxOnly = process.platform !== "linux";
  return {
    byState: byState([...report.runtime, ...report.engines, ...report.targets]),
    // `capabilities` stays the conservative CLI view: a claim that holds only
    // through the MCP entry must not be reported as generally available.
    capabilities: capabilitiesFor("cli"),
    capabilitiesViaMcp: capabilitiesFor("mcp"),
    envlessCount: report.envless?.length ?? 0,
    linuxOnlyGap: linuxOnly
      ? ["固件", "逻辑信号", "pcap 字段级", "离线 ELF 与 core dump"]
      : [],
    platformCaveats:
      process.platform === "win32"
        ? [
            "pcap 摘要（inspect_pcap_capture）需要 capinfos 报出版本；Windows 构建的 capinfos -v 实际以 0xC0000409 崩溃退出，REA 据此判为不可用（capinfos 解析文件本身正常，tshark 也正常）",
          ]
        : [],
  };
};

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Anti-drift assertions for the skill itself.
 *
 * REA's own bundled skill carries `metadata.version` and is validated against
 * the catalog tool count, so `rea setup` can detect a stale install. A
 * hand-written skill has no such anchor: it silently describes an inventory
 * that no longer exists after an upgrade. These rows are that anchor.
 */
const readSkillMetadata = () => {
  const skillPath = join(SKILL_DIR, "SKILL.md");
  if (!existsSync(skillPath)) return null;
  const frontmatter = readFileSync(skillPath, "utf8").split("---")[1] ?? "";
  const pick = (key) => {
    const match = new RegExp(`^[ \\t]*${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, "m").exec(
      frontmatter,
    );
    return match ? match[1].trim() : null;
  };
  const numeric = (key) => {
    const value = Number(pick(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  return {
    version: pick("version"),
    reaVersion: pick("rea_version"),
    toolCount: numeric("tool_count"),
    cliCount: numeric("cli_command_count"),
  };
};

const spawnSkillScript = (scriptName, args, timeout = 60000) => {
  const runtime = pickRuntime();
  const probe = spawnSync(runtime.executable, [join(SKILL_DIR, "scripts", scriptName), ...args], {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
  return {
    status: probe.status,
    stdout: (probe.stdout ?? "").trim(),
    stderr: (probe.stderr ?? "").trim(),
  };
};

/**
 * Unique tool-shaped names in the MCP half of the inventory. This is a coverage
 * check, not an arithmetic one: count the distinct names the document claims,
 * so a missing tool or a name that no longer exists both surface as a delta.
 * Per-section numbers legitimately sum above the total because §9/§12/§14
 * cross-reference entries listed elsewhere.
 */
const inventoryUniqueToolNames = () => {
  const inventoryPath = join(SKILL_DIR, "references", "tool-inventory.md");
  if (!existsSync(inventoryPath)) return null;
  const mcpHalf = readFileSync(inventoryPath, "utf8").split("# CLI 命令")[0];
  const names = new Set(
    [...mcpHalf.matchAll(/`([a-z][a-z0-9_]{2,})`/g)].map((match) => match[1]),
  );
  return names;
};

const inventoryDeclaredCliCount = () => {
  const inventoryPath = join(SKILL_DIR, "references", "tool-inventory.md");
  if (!existsSync(inventoryPath)) return null;
  const match = /^# CLI 命令（(\d+)/m.exec(readFileSync(inventoryPath, "utf8"));
  return match ? Number(match[1]) : null;
};

const checkSkillAlignment = (deepMode) => {
  const usedFor = "技能与 REA 版本对齐";
  const metadata = readSkillMetadata();
  if (!metadata) {
    return [row("技能元数据", "unknown", "找不到 SKILL.md", usedFor)];
  }
  const rows = [];

  // 1. REA version. Cheap enough to always run: one short-lived CLI process.
  const versionProbe = spawnSkillScript("rea.mjs", ["--version"]);
  const actualRea = versionProbe.status === 0 ? versionProbe.stdout.split(/\s+/).pop() : null;
  if (!metadata.reaVersion) {
    rows.push(row("rea_version", "unknown", "frontmatter 未声明 rea_version", usedFor));
  } else if (!actualRea) {
    rows.push(
      row(
        "rea_version",
        "broken",
        `技能按 ${metadata.reaVersion} 写就，但 rea --version 无法执行：${(versionProbe.stderr || "无输出").slice(0, 120)}`,
        usedFor,
      ),
    );
  } else {
    rows.push(
      row(
        "rea_version",
        actualRea === metadata.reaVersion ? "ok" : "stale",
        actualRea === metadata.reaVersion
          ? `${metadata.reaVersion}（技能与实测一致）`
          : `技能按 ${metadata.reaVersion} 写就，实测 ${actualRea}：工具清单/命令名可能已过期`,
        usedFor,
      ),
    );
  }

  // 2. Tool count. Deep probes the live server; otherwise check the document's
  //    own arithmetic, which cannot detect drift but does detect a bad edit.
  if (metadata.toolCount) {
    if (deepMode) {
      const countProbe = spawnSkillScript("list-tools.mjs", ["--count"]);
      const live = Number(countProbe.stdout);
      rows.push(
        row(
          "tool_count（MCP 实测）",
          live === metadata.toolCount ? "ok" : Number.isFinite(live) && live > 0 ? "stale" : "unknown",
          Number.isFinite(live) && live > 0
            ? `声明 ${metadata.toolCount} / 实测 ${live}`
            : `无法枚举：${(countProbe.stderr || "无输出").slice(0, 120)}`,
          usedFor,
        ),
      );
    } else {
      const names = inventoryUniqueToolNames();
      const unique = names?.size ?? null;
      rows.push(
        row(
          "tool_count（清单去重）",
          unique === metadata.toolCount ? "ok" : "stale",
          unique === null
            ? "references/tool-inventory.md 不可读"
            : `声明 ${metadata.toolCount} / 清单唯一名 ${unique}${
                unique === metadata.toolCount
                  ? ""
                  : "（差值为幽灵名或非工具字段：用 --deep 与服务器对账）"
              }`,
          usedFor,
        ),
      );
    }
  }

  // 3. CLI command count: the document's claim, and (deep) the live help text.
  if (metadata.cliCount) {
    const declaredCli = inventoryDeclaredCliCount();
    rows.push(
      row(
        "cli_command_count（清单）",
        declaredCli === metadata.cliCount ? "ok" : "stale",
        declaredCli === null
          ? "references/tool-inventory.md 缺少 CLI 计数"
          : `声明 ${metadata.cliCount} / 清单 ${declaredCli}`,
        usedFor,
      ),
    );
    if (deepMode) {
      const helpProbe = spawnSkillScript("rea.mjs", ["--help"], 30000);
      const live = helpProbe.status === 0
        ? helpProbe.stdout.split("\n").filter((line) => /^ {2}[a-z]/.test(line)).length
        : null;
      rows.push(
        row(
          "cli_command_count（rea --help）",
          live === metadata.cliCount ? "ok" : live ? "stale" : "unknown",
          live ? `声明 ${metadata.cliCount} / 实测 ${live}` : "无法读取 rea --help",
          usedFor,
        ),
      );
    }
  }
  return rows;
};

const main = () => {
  const report = buildReport();
  const summary = summarize(report);
  const alignment = checkSkillAlignment(deep);

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ...report, alignment, summary }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`REA 环境检查  ${process.platform}/${process.arch}\n`);
  process.stdout.write(`技能目录  ${SKILL_DIR}\n`);
  process.stdout.write("状态含义  OK=本进程可直接用　NO-ENV=已安装但本进程无变量（MCP 可用 / CLI 需带前缀）\n\n");

  process.stdout.write("运行时\n");
  process.stdout.write(`${renderTable(report.runtime)}\n\n`);
  process.stdout.write("深度分析引擎（三选一即可，BYO）\n");
  process.stdout.write(`${renderTable(report.engines)}\n\n`);
  process.stdout.write("专项工具与格式能力（BYO）\n");
  process.stdout.write(`${renderTable(report.targets)}\n\n`);

  process.stdout.write("技能与 REA 版本对齐\n");
  process.stdout.write(`${renderTable(alignment)}\n\n`);

  process.stdout.write("能力判定（CLI 口径：只认本进程 env / PATH）\n");
  for (const [capability, available] of Object.entries(summary.capabilities)) {
    const label = capability.replace(/_/g, " ");
    process.stdout.write(`  ${available ? "✓" : "✗"}  ${label}\n`);
  }
  const mcpOnly = Object.entries(summary.capabilitiesViaMcp ?? {}).filter(
    ([capability, available]) => available && !summary.capabilities[capability],
  );
  if (mcpOnly.length > 0) {
    process.stdout.write(
      `  ·  另有 ${mcpOnly.length} 项仅在 MCP 通道可用：${mcpOnly
        .map(([capability]) => capability.replace(/_/g, " "))
        .join("、")}\n`,
    );
  }
  if (summary.linuxOnlyGap.length > 0) {
    process.stdout.write(
      `  ·  ${summary.linuxOnlyGap.join("、")} 在 REA 中要求 Linux 主机，当前平台不支持（与是否安装工具无关）\n`,
    );
  }
  for (const caveat of summary.platformCaveats ?? []) {
    process.stdout.write(`  ·  ${caveat}\n`);
  }

  const mcp = report.mcp ?? {};
  process.stdout.write("\nMCP 通道\n");
  process.stdout.write(`  配置    ${mcp.path ?? "?"}\n`);
  process.stdout.write(
    `  状态    ${
      mcp.state === "present"
        ? "条目存在（本会话是否已连接无法由此判断）"
        : mcp.state === "disabled"
          ? "条目存在但 disabled:true"
          : mcp.state === "absent"
            ? "配置里没有 mcpServers.rea"
            : mcp.state === "unreadable"
              ? "配置无法解析"
              : "配置文件不存在"
    }\n`,
  );
  process.stdout.write(`  内嵌变量 ${mcp.envNames?.length ?? 0} 个\n`);

  if (report.envless?.length > 0) {
    process.stdout.write(
      `\n仅文件系统可见（${report.envless.length} 项，本进程无变量）\n`,
    );
    for (const entry of report.envless) {
      const inMcp = mcp.envNames?.includes(entry.envName) ? "MCP 已内嵌" : "MCP 未内嵌";
      process.stdout.write(`  ${padTo(entry.name, 10)} ${entry.envName} · ${inMcp}\n`);
    }
    process.stdout.write("\nCLI 前缀（bash / Git Bash，逐行可直接粘贴）\n");
    for (const entry of report.envless) {
      process.stdout.write(`  ${entry.envName}="${entry.path}" \\\n`);
    }
    process.stdout.write("  rea <命令>\n");
    process.stdout.write("PowerShell 等价\n");
    for (const entry of report.envless) {
      process.stdout.write(`  $env:${entry.envName}="${entry.path}"\n`);
    }
    process.stdout.write("  rea <命令>\n");
  }

  if (report.env.length > 0) {
    process.stdout.write("\n已设置的相关环境变量\n");
    for (const entry of report.env) {
      process.stdout.write(`  ${entry.name}=${entry.value}\n`);
    }
  }

  const broken = [...report.runtime, ...report.engines, ...report.targets].filter(
    (entry) => entry.state === "broken",
  );
  if (broken.length > 0) {
    process.stdout.write("\n需要修复（配置指向了不存在的路径）\n");
    for (const entry of broken) {
      process.stdout.write(`  - ${entry.name}: ${entry.detail}\n`);
    }
  }

  const stale = alignment.filter((entry) => entry.state === "stale" || entry.state === "broken");
  if (stale.length > 0) {
    process.stdout.write("\n技能需要对齐（REA 已变化，技能内容可能过期）\n");
    for (const entry of stale) {
      process.stdout.write(`  - ${entry.name}: ${entry.detail}\n`);
    }
  }

  process.stdout.write(
    "\n提示：MISSING 只影响对应能力，不影响其它能力。缺少的引擎 REA 不会替你安装。\n",
  );
  return 0;
};

process.exitCode = main();
