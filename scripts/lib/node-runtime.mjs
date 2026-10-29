/**
 * Node runtime selection shared by every script in this skill.
 *
 * REA needs ^22.19 || ^24.11 || >=26. SQLite inspection additionally needs
 * 24.15+ (DatabaseSync limits). Rather than trusting whatever `node` happens
 * to be first on PATH, resolve the best installed runtime explicitly.
 *
 * Resolution order:
 *   1. REA_NODE (absolute path to a node executable)
 *   2. the highest installed version under the managed versions directory
 *   3. the runtime executing this process
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";

const isWindows = platform() === "win32";

export const parseVersion = (text) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text ?? "");
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const compare = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

export const satisfiesRea = (version) => {
  if (!version) return false;
  const [major, minor] = version;
  if (major === 22) return minor >= 19;
  if (major === 24) return minor >= 11;
  return major >= 26;
};

/** REA's SQLite inspection requires 24.15+ or 26+. */
export const satisfiesSqlite = (version) => {
  if (!version) return false;
  const [major, minor] = version;
  if (major === 24) return minor >= 15;
  return major >= 26;
};

/** Directories that may hold `<version>/node.exe` managed runtimes. */
const runtimeRoots = () => {
  const roots = [];
  const explicit = process.env.REA_NODE_VERSIONS_DIR;
  if (explicit) roots.push(explicit);

  // Self-referential: a managed layout is <root>/<version>/<node executable>.
  const executable = process.execPath;
  if (executable) {
    const versionDirectory = dirname(executable);
    const root = dirname(versionDirectory);
    const executableName = isWindows ? "node.exe" : "node";
    if (existsSync(join(versionDirectory, executableName))) roots.push(root);
  }

  roots.push(join(homedir(), ".workbuddy", "binaries", "node", "versions"));
  return [...new Set(roots.map((entry) => resolve(entry)))];
};

/** Every managed runtime that actually contains an executable. */
export const installedRuntimes = () => {
  const executableName = isWindows ? "node.exe" : "bin/node";
  const found = [];
  for (const root of runtimeRoots()) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const executable = join(root, entry, executableName);
      try {
        if (!existsSync(executable) || !statSync(executable).isFile()) continue;
      } catch {
        continue;
      }
      // `22.22.2-6` style suffixes are build identifiers, not semver.
      const version = parseVersion(entry);
      if (!version) continue;
      found.push({
        version,
        label: entry,
        executable,
        prefix: join(root, entry),
      });
    }
  }
  const unique = new Map();
  for (const runtime of found) {
    const key = runtime.version.join(".");
    if (!unique.has(key)) unique.set(key, runtime);
  }
  return [...unique.values()].sort((left, right) =>
    compare(right.version, left.version),
  );
};

/**
 * Pick the runtime to use for REA.
 * Prefers a SQLite-capable version, falls back to any REA-compatible one.
 */
export const pickRuntime = () => {
  const override = process.env.REA_NODE;
  if (override && existsSync(override)) {
    return {
      executable: override,
      prefix: dirname(override),
      version: parseVersion(override) ?? null,
      source: "REA_NODE",
    };
  }
  const runtimes = installedRuntimes();
  const sqliteCapable = runtimes.find((runtime) => satisfiesSqlite(runtime.version));
  if (sqliteCapable) return { ...sqliteCapable, source: "installed" };
  const compatible = runtimes.find((runtime) => satisfiesRea(runtime.version));
  if (compatible) return { ...compatible, source: "installed" };
  return {
    executable: process.execPath,
    prefix: dirname(process.execPath),
    version: parseVersion(process.version),
    source: "current-process",
  };
};

/**
 * The REA entry script installed beside a Node runtime.
 * Managed global installs put it under <prefix>/node_modules/rea-agents.
 */
export const reaScriptFor = (prefix) => {
  const candidates = [
    join(prefix, "node_modules", "rea-agents", "scripts", "rea.mjs"),
    join(prefix, "lib", "node_modules", "rea-agents", "scripts", "rea.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/** npm's CLI entry beside a runtime, used to install or update packages. */
export const npmCliFor = (prefix) => {
  const candidates = [
    join(prefix, "node_modules", "npm", "bin", "npm-cli.js"),
    join(prefix, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};
