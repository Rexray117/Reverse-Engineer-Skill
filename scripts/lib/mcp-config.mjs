import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Locate the MCP client config that holds the `rea` server entry.
 *
 * The old code hard-coded `~/.workbuddy/mcp.json`, which silently pointed at the
 * wrong client when the skill ran under DeepSeek Harness / Codex / a project
 * checkout (the REA server was registered somewhere else, so check-env reported
 * "missing" while the tool actually worked, or register-mcp wrote into a file the
 * running client never reads). Resolution order:
 *
 *   1. explicit flag (caller passes it) — highest priority, handled by callers
 *   2. $REA_MCP_CONFIG
 *   3. $WORKBUDDY_MCP_CONFIG
 *   4. ~/.workbuddy/mcp.json                 (WorkBuddy)
 *   5. ~/.workbuddy/connectors/default/mcp.json
 *   6. $DSH_HOME/mcp.json  or  ~/.dsh/mcp.json   (DeepSeek Harness)
 *   7. ~/.codex/mcp.json                     (Codex, JSON fallback)
 *   8. <cwd>/.mcp.json                       (project-local)
 *
 * Returns `{ path, source, exists }`; `source` is one of `env:*`, `probe`, or
 * `default` so callers can explain where the decision came from.
 */
export function resolveMcpConfig({ explicit = null, cwd = process.cwd(), env = process.env } = {}) {
  if (explicit) return { path: resolve(explicit), source: "flag", exists: existsSync(resolve(explicit)) };

  const fromEnv = [
    ["env:REA_MCP_CONFIG", env.REA_MCP_CONFIG],
    ["env:WORKBUDDY_MCP_CONFIG", env.WORKBUDDY_MCP_CONFIG],
  ];
  for (const [source, value] of fromEnv) {
    if (value) return { path: resolve(value), source, exists: existsSync(resolve(value)) };
  }

  const home = homedir();
  const candidates = [
    join(home, ".workbuddy", "mcp.json"),
    join(home, ".workbuddy", "connectors", "default", "mcp.json"),
    join(env.DSH_HOME || join(home, ".dsh"), "mcp.json"),
    join(home, ".dsh", "mcp.json"),
    join(home, ".codex", "mcp.json"),
    join(cwd, ".mcp.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { path: candidate, source: "probe", exists: true };
  }

  // Nothing exists yet: register-mcp needs a writable target. Keep the historical
  // WorkBuddy location as the creation default so old workflows keep working.
  const fallback = join(home, ".workbuddy", "mcp.json");
  return { path: fallback, source: "default", exists: false };
}
