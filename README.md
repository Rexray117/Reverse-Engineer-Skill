# Reverse Engineer · 逆向工程技能（REA 驱动）

[![DSH Skill](https://img.shields.io/badge/DeepSeek%20Harness-skill-4a7dff)](https://github.com/Rexray117/Reverse-Engineer-Skill)
[![version](https://img.shields.io/badge/version-1.2.0-brightgreen)](https://github.com/Rexray117/Reverse-Engineer-Skill/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

> 一个 **DeepSeek Harness（DSH）/ Agent Skill**：`Reverse Engineer-20261017` v1.2.0。

用 REA 对已编译产物做逆向工程并给出可核查结论——原生二进制（Hopper/Ghidra/IDA 伪代码、汇编、调用图、xref）、JavaScript/Electron 应用、.NET 程序集、Android APK 与设备、固件、WASM/EVM 字节码、SQLite、网络抓包、浏览器与进程运行时。当用户说"这个功能是怎么实现的/反编译看看/这个 exe、dll、so、apk、asar、wasm 里是什么/对比两个版本/还原这段算法/看看这个网页怎么做的"，或需要基于二进制证据（而非源码）下结论时激活。Reverse engineer binaries, Electron/JS apps, .NET assemblies, APKs, firmware and runtime behavior with evidence discipline.

## 适用场景

把本仓库整体放进 agent 的技能目录即可按描述自动触发；也可以在对话里直接点名 `Reverse Engineer-20261017`。

## 目录结构

```
`SKILL.md`
`LICENSE`
`.gitignore`
references/
scripts/
```

## 安装

### DSH（DeepSeek Harness）

技能目录放到用户级技能根：

```powershell
# Windows
git clone https://github.com/Rexray117/Reverse-Engineer-Skill.git "$env:USERPROFILE\.dsh\skills\reverse-engineer-20261017"
```

```bash
# macOS / Linux
git clone https://github.com/Rexray117/Reverse-Engineer-Skill.git ~/.dsh/skills/reverse-engineer-20261017
```

也可以用 DSH 的插件管理安装本地目录：

```
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

### 其他 agent（Codex / WorkBuddy / Claude Code）

技能根分别位于 `~/.codex/skills`、`~/.workbuddy/skills`、`~/.claude/skills`，把本仓库克隆成其中的 `reverse-engineer-20261017` 子目录即可（技能名以 `SKILL.md` 的 `name: Reverse Engineer-20261017` 为准）。

## 版本

- 当前版本：**v1.2.0**（与 `SKILL.md` 的 `version` 字段一致）
- 变更记录见仓库提交历史

## License

MIT © 2026 Rexray117
