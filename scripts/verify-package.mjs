/**
 * Skill package self-check (offline).
 *
 * Verifies three things that fail independently:
 *   1. identity   - frontmatter name matches the directory, description present
 *   2. references - every linked reference file exists
 *   3. alignment  - the declared REA version / tool count / CLI count still
 *                   match what the document itself describes
 *
 * The alignment block is the offline half of the anti-drift assertion in
 * check-env.mjs. It cannot see an upgraded REA (that needs a live probe), but it
 * does catch a hand edit that drops a tool, invents one, or leaves the counts
 * disagreeing -- which is exactly how this inventory drifted before.
 *
 *   node scripts/verify-package.mjs "<skill dir>"
 *
 * Exits 1 when a hard check fails.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: verify-package.mjs <skill dir>");
  process.exit(2);
}

const problems = [];
const raw = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
const frontmatter = raw.split("---")[1] ?? "";
const nameMatch = frontmatter.match(/^name:[ \t]*(.+)$/m);
const name = nameMatch ? nameMatch[1].trim() : null;
const folder = path.basename(root);

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

console.log("frontmatter name:", JSON.stringify(name));
console.log("folder          :", JSON.stringify(folder));
console.log("match           :", name === folder);
if (name !== folder) problems.push("frontmatter name 与目录名不一致");

const hasDescription = /^description:[ \t]*\S/m.test(frontmatter);
const hasMetadata = /^metadata:/m.test(frontmatter);
console.log("has description :", hasDescription);
console.log("has metadata    :", hasMetadata);
if (!hasDescription) problems.push("frontmatter 缺少 description");
if (!hasMetadata) problems.push("frontmatter 缺少 metadata");

console.log("SKILL.md lines  :", raw.split("\n").length);
console.log("skill version   :", pick("version") ?? "(未声明)");

const references = [...raw.matchAll(/references\/([a-z-]+)\.md/g)].map((m) => m[1]);
const missing = [...new Set(references)].filter(
  (entry) => !fs.existsSync(path.join(root, "references", `${entry}.md`)),
);
console.log("linked refs     :", [...new Set(references)].length);
console.log("missing refs    :", missing.length ? missing.join(", ") : "none");
if (missing.length) problems.push(`引用缺失: ${missing.join(", ")}`);

const scripts = fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".mjs"));
console.log("scripts         :", scripts.join(", "));

/* ---------------------------------------------------------------- 版本断言 */

const declared = {
  rea_version: pick("rea_version"),
  tool_count: numeric("tool_count"),
  cli_command_count: numeric("cli_command_count"),
};
console.log("\n版本断言锚点");
console.log("  rea_version       :", declared.rea_version ?? "(未声明)");
console.log("  tool_count        :", declared.tool_count ?? "(未声明)");
console.log("  cli_command_count :", declared.cli_command_count ?? "(未声明)");
if (!declared.rea_version) problems.push("metadata 缺少 rea_version（无法检测 REA 升级）");
if (!declared.tool_count) problems.push("metadata 缺少 tool_count（无法检测工具增减）");
if (!declared.cli_command_count) problems.push("metadata 缺少 cli_command_count");

const inventoryPath = path.join(root, "references", "tool-inventory.md");
if (fs.existsSync(inventoryPath)) {
  const inventory = fs.readFileSync(inventoryPath, "utf8");
  const uniqueNames = new Set(
    [...inventory.split("# CLI 命令")[0].matchAll(/`([a-z][a-z0-9_]{2,})`/g)].map(
      (match) => match[1],
    ),
  );
  const cliDeclared = /^# CLI 命令（(\d+)/m.exec(inventory)?.[1] ?? null;
  console.log("\n清单一致性（离线）");
  console.log("  唯一工具名        :", uniqueNames.size, "/ 声明", declared.tool_count ?? "?");
  console.log("  CLI 命令（清单）  :", cliDeclared ?? "?", "/ 声明", declared.cli_command_count ?? "?");
  if (declared.tool_count && uniqueNames.size !== declared.tool_count) {
    problems.push(
      `清单唯一工具名 ${uniqueNames.size} ≠ 声明 tool_count ${declared.tool_count}（多出的名字可能是幽灵工具或非工具字段）`,
    );
  }
  if (declared.cli_command_count && Number(cliDeclared) !== declared.cli_command_count) {
    problems.push(
      `清单 CLI 计数 ${cliDeclared} ≠ 声明 cli_command_count ${declared.cli_command_count}`,
    );
  }
} else {
  problems.push("references/tool-inventory.md 缺失，无法校验清单一致性");
}

console.log("");
if (problems.length > 0) {
  console.log("结论：未通过");
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("结论：通过（身份 / 引用 / 版本断言一致）");
  process.exitCode = 0;
}
