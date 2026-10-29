#!/usr/bin/env node
/**
 * Detect installed analysis engines and emit the environment REA needs.
 *
 * REA reads provider locations from environment variables. This script finds
 * what is actually installed and can either print the result, persist it as
 * per-user environment variables, or emit the `env` block for the MCP entry.
 *
 *   node scripts/apply-env.mjs                 # 人类可读的检测结果
 *   node scripts/apply-env.mjs --json          # 机器可读
 *   node scripts/apply-env.mjs --mcp           # 输出 MCP 条目的 env JSON
 *   node scripts/apply-env.mjs --apply         # setx 写入用户环境变量（需重开终端）
 *   node scripts/apply-env.mjs --apply --dry-run
 *
 * Nothing is installed and nothing outside the user environment is modified.
 * An existing, non-empty variable is never overwritten unless --force is given.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

const isWindows = platform() === "win32";
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const asJson = has("--json");
const asMcp = has("--mcp");
const apply = has("--apply");
const dryRun = has("--dry-run");
const force = has("--force");

const TOOLS_ROOT = process.env.REA_TOOLS_ROOT || (isWindows ? "C:\\tools" : "/opt");

const firstExisting = (candidates) => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // Unreadable candidates are not matches.
    }
  }
  return null;
};

const listDirs = (root) => {
  try {
    return readdirSync(root)
      .map((name) => join(root, name))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
};

const which = (name) => {
  const extensions = isWindows ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const entry of (process.env.PATH || "").split(isWindows ? ";" : ":")) {
    if (!entry) continue;
    for (const extension of extensions) {
      const candidate = join(entry, name + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

/** Highest Ghidra directory that actually contains the headless launcher. */
const detectGhidra = () => {
  const explicit = process.env.GHIDRA_INSTALL_DIR;
  if (explicit && existsSync(join(explicit, "support"))) return explicit;
  const candidates = listDirs(TOOLS_ROOT)
    .filter((path) => /ghidra/i.test(path))
    .filter((path) =>
      firstExisting([
        join(path, "support", "analyzeHeadless"),
        join(path, "support", "analyzeHeadless.bat"),
      ]),
    )
    .sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    );
  return candidates[0] ?? null;
};

/** JAVA_HOME from the java on PATH, then common install roots. */
const detectJavaHome = () => {
  const explicit = process.env.JAVA_HOME;
  if (explicit && existsSync(join(explicit, "bin"))) return explicit;
  const java = which("java");
  if (java) {
    const home = dirname(dirname(java));
    if (existsSync(join(home, "bin"))) return home;
  }
  const roots = [
    "C:\\Program Files\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "/usr/lib/jvm",
  ];
  for (const root of roots) {
    const match = listDirs(root)
      .filter((path) => existsSync(join(path, "bin")))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    if (match[0]) return match[0];
  }
  return null;
};

const detectJadx = () => {
  const explicit = process.env.REA_JADX_MCP_JAR;
  if (explicit && existsSync(explicit)) return explicit;
  const roots = [join(TOOLS_ROOT, "jadx"), TOOLS_ROOT];
  for (const root of roots) {
    try {
      const jars = readdirSync(root)
        .filter((name) => /jadx.*\.jar$/i.test(name) && /all|headless/i.test(name))
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      if (jars[0]) return join(root, jars[0]);
    } catch {
      // Missing directory: keep looking.
    }
  }
  return null;
};

const detectApktool = () => {
  const explicit = process.env.REA_APKTOOL_COMMAND;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    join(TOOLS_ROOT, "apktool", "apktool.bat"),
    join(TOOLS_ROOT, "apktool", "apktool.cmd"),
    which("apktool"),
  ]);
};

const detectWabt = () => {
  const explicit = process.env.REA_WABT_BIN_DIRECTORY;
  if (explicit && existsSync(explicit)) return explicit;
  const dirs = [join(TOOLS_ROOT, "wabt"), join(TOOLS_ROOT, "wabt", "bin")];
  for (const dir of dirs) {
    if (existsSync(join(dir, isWindows ? "wasm2wat.exe" : "wasm2wat"))) return dir;
  }
  return null;
};

const detectRizin = () => {
  const explicit = process.env.REA_RIZIN_COMMAND;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    join(TOOLS_ROOT, "rizin", "bin", "rizin.exe"),
    join(TOOLS_ROOT, "rizin", "rizin.exe"),
    which("rizin"),
  ]);
};

const detectTshark = () => {
  const explicit = process.env.REA_TSHARK_COMMAND;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    "C:\\Program Files\\Wireshark\\tshark.exe",
    join(TOOLS_ROOT, "wireshark", "tshark.exe"),
    "/usr/bin/tshark",
    "/usr/local/bin/tshark",
    which("tshark"),
  ]);
};

/** capinfos ships beside tshark; REA takes an explicit absolute path. */
const detectCapinfos = () => {
  const explicit = process.env.REA_CAPINFOS_COMMAND;
  if (explicit && existsSync(explicit)) return explicit;
  const besideWireshark = [
    "C:\\Program Files\\Wireshark\\capinfos.exe",
    join(TOOLS_ROOT, "wireshark", "capinfos.exe"),
    "/usr/bin/capinfos",
    "/usr/local/bin/capinfos",
  ];
  return firstExisting([...besideWireshark, which("capinfos")]);
};

const detectPwntoolsPython = () => {
  const explicit = process.env.REA_PWNTOOLS_PYTHON;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    join(TOOLS_ROOT, "pwntools", "venv", "Scripts", "python.exe"),
    join(TOOLS_ROOT, "pwntools", "venv", "bin", "python"),
    which("python3"),
    which("python"),
  ]);
};

const detectIlspy = () => {
  const explicit = process.env.REA_ILSPY_CMD_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    join(homedir(), ".dotnet", "tools", "ilspycmd.exe"),
    join(homedir(), ".dotnet", "tools", "ilspycmd"),
    which("ilspycmd"),
  ]);
};

const detectWakaru = () => {
  const explicit = process.env.REA_WAKARU_COMMAND;
  if (explicit && existsSync(explicit)) return explicit;
  return firstExisting([
    which("wakaru"),
    join(process.execPath, "..", "wakaru.cmd"),
  ]);
};

const detectFirmwareTools = () => ({
  binwalk: firstExisting([which("binwalk"), "/usr/bin/binwalk"]),
  unblob: firstExisting([which("unblob"), "/usr/local/bin/unblob"]),
  prlimit: firstExisting([which("prlimit"), "/usr/bin/prlimit"]),
});

/** MinGW/binutils directory. REA looks these up by name on PATH, so it has no variable. */
const detectMingwBin = () => {
  const candidates = [
    join(TOOLS_ROOT, "mingw64", "bin"),
    join(TOOLS_ROOT, "mingw32", "bin"),
  ];
  for (const directory of candidates) {
    if (existsSync(join(directory, isWindows ? "objdump.exe" : "objdump"))) return directory;
  }
  return null;
};

/**
 * Build the environment map. Keys with no detected value are omitted so an
 * unrelated variable is never invented.
 */
export const detectEnvironment = () => {
  const ghidra = detectGhidra();
  const java = detectJavaHome();
  const jadx = detectJadx();
  const apktool = detectApktool();
  const wabt = detectWabt();
  const rizin = detectRizin();
  const tshark = detectTshark();
  const capinfos = detectCapinfos();
  const pwntools = detectPwntoolsPython();
  const ilspy = detectIlspy();
  const wakaru = detectWakaru();
  const firmware = detectFirmwareTools();
  const mingwBin = detectMingwBin();
  // Windows owned-process spawning rejects a bare name resolved from PATH
  // ("Owned Windows process requires an absolute executable path"), so binutils
  // and gdb must be passed as absolute paths rather than inherited from PATH.
  const objdump = firstExisting([
    mingwBin ? join(mingwBin, isWindows ? "objdump.exe" : "objdump") : null,
    which("objdump"),
  ]);
  const gdb = firstExisting([
    mingwBin ? join(mingwBin, isWindows ? "gdb.exe" : "gdb") : null,
    which("gdb"),
  ]);

  const env = {};
  if (ghidra) env.GHIDRA_INSTALL_DIR = ghidra;
  if (java) env.JAVA_HOME = java;
  if (jadx) env.REA_JADX_MCP_JAR = jadx;
  if (apktool) env.REA_APKTOOL_COMMAND = apktool;
  if (wabt) env.REA_WABT_BIN_DIRECTORY = wabt;
  if (rizin) env.REA_RIZIN_COMMAND = rizin;
  if (tshark) env.REA_TSHARK_COMMAND = tshark;
  if (capinfos) env.REA_CAPINFOS_COMMAND = capinfos;
  if (objdump) env.REA_OBJDUMP_COMMAND = objdump;
  if (gdb) env.REA_GDB_COMMAND = gdb;
  if (pwntools) env.REA_PWNTOOLS_PYTHON = pwntools;
  if (ilspy) env.REA_ILSPY_CMD_PATH = ilspy;
  if (wakaru) env.REA_WAKARU_COMMAND = wakaru;

  const notes = [];
  if (!ghidra) notes.push("Ghidra 未找到：原生分析不可用");
  if (!java) notes.push("JAVA_HOME 未找到：Ghidra/JADX/Apktool 可能无法启动");
  if (!jadx) notes.push("JADX headless MCP 未找到：APK 只能到清单层");
  if (!firmware.unblob && !firmware.binwalk) {
    notes.push("Binwalk/Unblob 未找到：固件分析不可用（REA 要求 Linux 主机）");
  }
  if (!firmware.prlimit && platform() === "linux") {
    notes.push("prlimit 未找到：固件/抓包/信号在 Linux 上需要 util-linux prlimit");
  }
  if (platform() === "win32") {
    notes.push("在 Windows 上：固件（Binwalk/Unblob）与信号（sigrok）不可用，pcap 字段级需要 Linux");
  }

  return {
    env,
    detected: {
      ghidra,
      javaHome: java,
      jadx,
      apktool,
      wabt,
      rizin,
      tshark,
      capinfos,
      objdump,
      gdb,
      pwntools,
      ilspy,
      wakaru,
      firmware,
      mingwBin,
    },
    notes,
  };
};

const writeUserVariable = (name, value) => {
  if (!isWindows) return { ok: false, reason: "仅实现 Windows setx；POSIX 请用 --print 后手动 export" };
  const current = process.env[name];
  if (current && current === value) return { ok: true, status: "unchanged" };
  if (current && !force) {
    return { ok: false, reason: `已存在不同值（${current}），如需覆盖请加 --force` };
  }
  if (dryRun) return { ok: true, status: "planned" };
  const result = spawnSync("setx", [name, value], { encoding: "utf8", windowsHide: true });
  return result.status === 0
    ? { ok: true, status: "written" }
    : { ok: false, reason: (result.stderr || result.stdout || "").trim().split("\n")[0] };
};

const main = () => {
  const report = detectEnvironment();

  if (asMcp) {
    process.stdout.write(`${JSON.stringify(report.env, null, 2)}\n`);
    return 0;
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  const entries = Object.entries(report.env);
  if (!apply) {
    process.stdout.write("检测到的引擎环境（复制到 shell 或用于 MCP env）\n\n");
    if (entries.length === 0) {
      process.stdout.write("  （没有检测到任何引擎）\n");
    }
    for (const [key, value] of entries) {
      process.stdout.write(`  ${key}=${value}\n`);
    }
    if (report.notes.length > 0) {
      process.stdout.write("\n注意\n");
      for (const note of report.notes) process.stdout.write(`  - ${note}\n`);
    }
    process.stdout.write(
      "\n写入用户环境变量：node scripts/apply-env.mjs --apply\n" +
        "为 MCP 条目生成 env：node scripts/apply-env.mjs --mcp\n",
    );
    return 0;
  }

  process.stdout.write(`写入用户环境变量${dryRun ? "（dry-run）" : ""}\n`);
  let failures = 0;
  for (const [key, value] of entries) {
    const result = writeUserVariable(key, value);
    if (result.ok) {
      process.stdout.write(`  ${result.status.padEnd(9)} ${key}\n`);
    } else {
      failures += 1;
      process.stdout.write(`  FAILED    ${key}: ${result.reason}\n`);
    }
  }
  process.stdout.write(
    "\n已写入的变量只对**新启动**的进程生效。请重开终端，或重启客户端后再启动 MCP。\n",
  );
  return failures > 0 ? 1 : 0;
};

// Only run the CLI when executed directly; register-mcp.mjs imports
// detectEnvironment() and must not trigger the CLI as a side effect.
const invokedDirectly = (() => {
  const entry = process.argv[1] ?? "";
  try {
    return import.meta.url === new URL(`file://${entry.replace(/\\/g, "/")}`).href;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  process.exitCode = main();
}
