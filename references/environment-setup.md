# 安装、环境变量与故障恢复

> **用途**：安装形态、硬性与软性依赖、环境变量全表、平台矩阵、健康检查与故障定位。  
> **读者**：使用者（配置环境）/ 排障  
> **更新**：2026-10-17 · REA 6.5.0 · 技能 v1.2.0

## 目录

- [1. 三种安装形态](#1-三种安装形态)
- [2. 注册到 Agent（MCP）](#2-注册到-agentmcp)
- [3. 硬性与软性依赖](#3-硬性与软性依赖)
- [4. 环境变量全表](#4-环境变量全表)
- [5. 平台矩阵](#5-平台矩阵)
- [6. 本机安装布局（2026-10-17 实际状态）](#6-本机安装布局2026-10-17-实际状态)
- [7. 健康检查与故障定位](#7-健康检查与故障定位)
- [8. 常见坑（按出现频率）](#8-常见坑按出现频率)
- [9. 更新](#9-更新)

## 1. 三种安装形态

| 形态 | 命令 | 适用 |
| --- | --- | --- |
| 包运行器（推荐给 Agent） | `npx -y rea-agents@latest <cmd>` | 免安装；每次可能走 npm 缓存 |
| 全局 CLI | `npm install --global rea-agents` → `rea --help` | 常规使用、脚本化 |
| 源码构建 | `npm ci && npm run build:cached` → `node scripts/rea.mjs <cmd>` | 二次开发、验证未发布特性 |

源码构建的产物：
- `dist/mcp/main.js`（长驻 MCP）
- `dist/cli-runtime/cli.js`（一次性 CLI）
- `skills/`（由 `.agents/skills/reverse-engineer-anything/**` 生成）

**构建前置**：Node 满足 `^22.19 || ^24.11 || >=26`；`npm ci` 之后必须 `build:cached`，否则 `scripts/rea.mjs` 会报「compiled runtime is missing」。

## 2. 注册到 Agent（MCP）

官方路径（会预览计划再动手）：

```bash
npx rea-agents setup                       # 交互：多选客户端 → 审阅计划 → 批准
rea setup --client codex --dry-run --json  # 只读计划
rea setup --yes --client codex             # 应用
rea setup --yes --all-detected --install-hopper --json   # 含可选 Hopper 安装
rea doctor --json                          # 健康诊断
rea doctor --provider ghidra --json        # 单引擎诊断
rea doctor --skill --json                  # 校验 skill 副本
rea uninstall                              # 移除注册与自有 skill（保留无法安全删除项并报告）
```

官方支持 20+ 客户端：`claude_code`、`claude_desktop`、`codex`、`cursor`、`gemini_cli`、`windsurf`、`devin`、`opencode`、`antigravity`、`copilot_cli`、`commandcode`、`vscode`、`grok_build`、`grok_bot`、`qoder`、`trae`、`zcode`、`dsh`（DeepSeek Harness）、`kimi`、`droid`、`omp`、`pi`、`hermes`、`qwen_code`、`workbuddy`。

**WorkBuddy 手动注册**（本技能提供脚本）：

```bash
node scripts/register-mcp.mjs --dry-run
node scripts/register-mcp.mjs          # 写 ~/.workbuddy/mcp.json，自动备份
node scripts/register-mcp.mjs --remove
```

写入后需在客户端「连接器」页面点「信任」，再重启会话，工具才会出现。

## 3. 硬性与软性依赖

### 硬性

| 项 | 要求 | 不满足的后果 |
| --- | --- | --- |
| Node.js | `^22.19 \|\| ^24.11 \|\| >=26` | 启动即失败 |
| npm | 随 Node 提供（开发用 `npm@11.16`） | 无法安装/更新 |
| Linux 的 `ps` | procps 兼容 | Ghidra / JADX / 固件工具 / 静态 JS 的进程归属校验失败 |
| SQLite 能力 | Node 24.15+ 或 26+（`DatabaseSync.limits`） | `inspect_sqlite_database` 不可用，其余不受影响 |
| 历史源码导入 | Linux / macOS 的安全 no-follow open | 原生 Windows 返回 `unsupported_host`（改用 WSL） |

### 按能力选择（全部 BYO，REA 不安装）

| 能力 | 需要 |
| --- | --- |
| 原生伪代码/汇编/调用图 | Hopper / Ghidra / IDA 任一 |
| APK 方法级反编译 | headless JADX + 完整 JDK |
| APK 资源 | Apktool |
| 设备操作 | adb |
| 固件 | Binwalk / Unblob（Linux + prlimit） |
| 抓包 / 信号 | tshark 4.x / sigrok-cli 0.7.2（+ Linux prlimit） |
| WASM | WABT 1.0.42 |
| 离线 ELF / core | pwntools（Linux x64）+ 可选 pwndbg / GDB |
| JS 分块恢复 | Wakaru（1.14.0 已验证） |
| 网页观测 | Chrome 系浏览器 |
| 仪表化 | Frida 17.x |

## 4. 环境变量全表

### 服务与协议

| 变量 | 作用 |
| --- | --- |
| `REA_LOG_LEVEL` | 日志级别 |
| `REA_MCP_MAX_RESPONSE_BYTES` | 单帧响应预算（≥10485760 的十进制整数；启动时捕获） |
| `REA_MCP_INPUT_SCHEMA_PROFILE` | 输入 schema 呈现方式（compact 等） |
| `REA_MCP_OUTPUT_SCHEMA_PROFILE` | 输出 schema 呈现方式 |
| `REA_ANALYSIS_PROVIDER` | 常驻默认深度引擎 |
| `REA_WORKFLOW_PROVIDER` | 工作流层 provider 选择 |

### Ghidra

| 变量 | 作用 |
| --- | --- |
| `GHIDRA_INSTALL_DIR` | 安装目录（存在 `support/analyzeHeadless`） |
| `JAVA_HOME` | JDK 路径（Ghidra 无内嵌 JDK 时必需） |
| `REA_GHIDRA_LANGUAGE_ID` | 强指定语言（raw/DOS/MIPS 等场景） |
| `REA_GHIDRA_COMPILER_SPEC_ID` | 强指定编译器规格（需配合语言 ID） |
| `REA_GHIDRA_SEED_FILE` | 分析种子文件 |
| `REA_GHIDRA_DISABLED_ANALYZERS` | 禁用分析器列表（JSON 数组） |
| `REA_GHIDRA_NATIVEAOT_JAR` | NativeAOT 元数据扩展 JAR |
| `REA_GHIDRA_STARTUP_TIMEOUT_MS` | 启动/首次查询截止时间（大二进制要放大） |

### Hopper

| 变量 | 作用 |
| --- | --- |
| `HOPPER_LAUNCHER_PATH` | 启动器路径 |
| `HOPPER_TARGET_PATH` / `HOPPER_TARGET_KIND` | 预绑定目标 |
| `REA_HOPPER_STARTUP_TIMEOUT_MS` | 启动截止时间 |

### 专项工具

| 变量 | 指向 |
| --- | --- |
| `REA_IDA_MCP_CONFIG` | ida-pro-mcp 配置 |
| `REA_JEB_MCP_URL` | JEB 客户端 MCP 端点 |
| `REA_JADX_MCP_JAR` / `REA_JADX_HEAP_MIB` / `REA_JADX_ACTIVE_PROCESSOR_COUNT` | JADX 桥与资源上限 |
| `REA_APKTOOL_COMMAND` | Apktool 启动器 |
| `REA_ADB_PATH` | adb 可执行文件 |
| `REA_WABT_BIN_DIRECTORY` | WABT bin 目录（含 `wasm2wat`） |
| `REA_OBJDUMP_COMMAND` | GNU objdump 可执行文件（**Windows 必须绝对路径**） |
| `REA_GDB_COMMAND` | GNU gdb 可执行文件（**Windows 必须绝对路径**） |
| `REA_PWNTOOLS_PYTHON` / `REA_PWNTOOLS_MAX_INPUT_BYTES` | pwntools 解释器与输入上限 |
| `REA_PWNDBG_GDB` / `REA_PWNDBG_VENV_PATH` / `REA_PWNDBG_GDBINIT` | pwndbg 相关 |
| `REA_BINWALK_COMMAND` / `REA_UNBLOB_COMMAND` / `REA_FIRMWARE_PRLIMIT_COMMAND` | 固件 |
| `REA_TSHARK_COMMAND` / `REA_CAPINFOS_COMMAND` / `REA_TSHARK_PRLIMIT_COMMAND` | 数据包（tshark 与 capinfos **都要**） |
| `REA_SIGROK_COMMAND` / `REA_SIGROK_PRLIMIT_COMMAND` | 逻辑信号 |
| `REA_MITMDUMP_COMMAND` | 原生 mitmproxy 抓包 |
| `REA_EVM_PRLIMIT_COMMAND` / `REA_JAVASCRIPT_PRLIMIT_COMMAND` | EVM / JS 子进程的资源限制（Linux） |
| `REA_WAKARU_COMMAND` | JS 分块恢复 |
| `REA_RIZIN_COMMAND` | Rizin |

> **Windows 的硬性要求**：REA 用「自有进程」方式拉起这些工具，`PATH` 里解析出的裸名字会失败
> （`Owned Windows process requires an absolute executable path`）。因此 `*_COMMAND` 必须写**绝对路径**；
> 把目录加进 `PATH` 只在 Linux/macOS 上够用。`apply-env.mjs` 已按此处理。
| `REA_ILSPY_CMD_PATH` | ilspycmd（.NET 辅助） |
| `REA_BROWSER_EXECUTABLE` | 浏览器可执行文件 |
| `REA_REFERENCE_SECRET_PATTERNS_JSON` | 把匹配路径标记为敏感（单独归类为 configured-secret） |

### 内部（不要手改）

`REA_PROCESS_RUN_ID`、`REA_SELECTED_CONTEXT`、`REA_REGISTRATION_CONTEXT`、`REA_PACKAGE_VERSION`、`REA_UPDATE_MARKER`、`REA_NATIVEAOT_FROZEN`、`REA_GHIDRA_CONTEXT`、`REA_GHIDRA_AMBIENT`、`REA_MANAGED_LINUX_HOPPER_LAUNCHER`。

> REA 只快照并传递它需要的变量给子进程（不原样继承整个环境），所以「我在 shell 里设了某变量但子进程没看到」不是 bug —— 检查该变量是否在 REA 的已知清单内。

## 5. 平台矩阵

| 平台 | 状态 | 注意 |
| --- | --- | --- |
| macOS | 一等公民 | Hopper 原生；Apple bundle/ObjC/Swift/LLDB 追踪 |
| Linux x64 | 一等公民 | Ghidra、pwntools、固件、抓包、信号、Termux |
| Windows x64 | Ghidra 为 **P0 受限 profile** | 私有 NTFS 运行时 + 回环 TCP；原生扩展 `rea-windows-x64.node`；历史源码导入不支持 |
| Android / Termux | 可运行 CLI | 浏览器需自备 Android 兼容 Chromium；`PLAYWRIGHT_BROWSERS_PATH` 由入口脚本处理 |
| WSL | 可运行，等价 Linux | 用于历史源码导入等 Windows 原生不支持的能力 |

选型提示：**在 Windows 上做原生逆向，优先用 Ghidra P0；对覆盖要求高的任务，把分析放到 Linux/macOS**，并把平台差异写进结论的限制里。

## 6. 本机安装布局（2026-10-17 实际状态）

Windows 上所有引擎统一放在 `C:\tools\<name>`，便于 `apply-env.mjs` 自动发现：

```
C:\tools\
├─ ghidra_12.1.4_PUBLIC\        GHIDRA_INSTALL_DIR
├─ jadx\jadx-headless-mcp-0.7.1-all.jar   REA_JADX_MCP_JAR
├─ apktool\{apktool.jar,apktool.bat}      REA_APKTOOL_COMMAND
├─ wabt\bin\wasm2wat.exe                  REA_WABT_BIN_DIRECTORY
├─ rizin\bin\rizin.exe                    REA_RIZIN_COMMAND
├─ wireshark\tshark.exe                   REA_TSHARK_COMMAND
├─ mingw64\bin\{gdb,objdump}.exe          走 PATH（REA 无专用变量）
├─ pwntools\venv\Scripts\python.exe       REA_PWNTOOLS_PYTHON
└─ test\                                  自建样本（hello.c/hello.exe）
```

写入与同步：

```bash
node scripts/apply-env.mjs            # 只打印检测结果
node scripts/apply-env.mjs --apply    # setx 写入用户环境（新进程生效）
node scripts/apply-env.mjs --mcp      # 输出可直接粘贴的 env JSON
node scripts/register-mcp.mjs --auto-env   # 把检测结果嵌进 MCP 条目，不依赖客户端继承
```

`apply-env.mjs` 只写**检测到**的变量，不会凭空发明；已存在不同值时不覆盖（`--force` 才覆盖）。

## 7. 健康检查与故障定位

```bash
node scripts/check-env.mjs          # 本技能：Node/引擎/工具/环境变量 一次看全
node scripts/check-env.mjs --json   # 机器可读
node scripts/check-env.mjs --deep   # + npm / pwntools / frida 设备；并连服务器数工具、读 rea --help 做版本断言
rea providers --json                # 已配置的二进制 provider + 支持的操作
rea capabilities --json             # 辅助能力清单
rea doctor --json                   # 生产 MCP 启动诊断（含子进程日志，stderr 最多保留前 64 KiB）
rea doctor --provider ghidra --json # 单引擎；**只接受 hopper|ghidra|ida|jadx**
```

> `rea doctor` 默认是 **audit-wide**：它会检查所有已安装客户端的注册、bundled skill 身份与全部引擎。
> 因此「`healthy: false`」通常只表示「你没有把 REA 注册进所有客户端」，**不代表当前任务不可用**。
> 判断是否可用请看 *你自己* 的 `check-env.mjs` 输出与单引擎 doctor。

**`check-env` 的三种状态必须分开读**（v1.2.0 起）：

| 状态 | 判据 | CLI | MCP |
| --- | --- | --- | --- |
| `OK` | 本进程 env 或 PATH 命中 | 可用 | 可用 |
| `NO-ENV` | 只在文件系统探测到，本进程 env 为空 | **不可用**（需带前缀） | 取决于 `mcp.json` 条目是否内嵌该变量 |
| `MISSING` | 文件系统没探测到，PATH 也没有 | 不可用 | 不可用 |

> v1.1.0 及以前把 `NO-ENV` 也报成 `OK`，只加一句括号说明。那会让体检结论与实际调用能力脱节：
> `rea doctor` 在同一台机器上明确报 `GHIDRA_INSTALL_DIR is not set`，而 `check-env` 报 OK。
> 两个检查器都有各自的正确性——它们量的是**安装**与**可达性**两件不同的事，所以现在分列显示，
> 并在表尾直接给出可粘贴的 CLI 前缀。

排障顺序（**不要跳过诊断直接改配置**）：

```
工具不存在 → 是「注册问题」还是「引擎问题」？
├─ 会话里根本没有 REA 工具
│  ├─ 配置里没有条目 → setup / register-mcp
│  ├─ 有条目但会话看不到 → 重启/重连；doctor 无法证明当前会话已连接
│  └─ 被客户端策略拦截 → 在客户端侧放行，不是改 REA
└─ 工具在但调用失败
   ├─ check-env 报 NO-ENV → shell 没继承变量（不是没装）：带前缀，或重开终端
   ├─ provider_unavailable → 看 details.rejections 与 remediation.action
   ├─ ambiguous → 从 candidate_ids 里显式选一个
   ├─ unsupported_target / unsupported_host → 换引擎或换平台
   └─ timeout → 放大 *_STARTUP_TIMEOUT_MS，或先取 summary 降低单次负载
```

## 8. 常见坑（按出现频率）

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `compiled runtime is missing` | 源码 checkout 未构建 | `npm ci && npm run build:cached` |
| Ghidra 首次查询超时 | 冷启动导入大二进制 | 提高 `REA_GHIDRA_STARTUP_TIMEOUT_MS`；客户端超时不代表 provider 停止，回头看 `analysis_activity` |
| Ghidra 启动失败但目录存在 | 缺 JDK | 设 `JAVA_HOME`，或使用带内嵌 JDK 的发行版 |
| Hopper 卡住 | macOS 首次运行的 demo/激活对话框未被处理 | 在同一用户会话里先手工完成一次 |
| Linux 上进程清理失败 | 缺 procps `ps` | 安装 procps；这是所有权校验的前提 |
| SQLite 工具报不支持 | Node 版本不足 | 升到 24.15+ / 26+，或换机器 |
| 历史源码导入 `unsupported_host` | 原生 Windows | 用 WSL 里的 Linux REA |
| 结果「空气泡」/被截断 | 客户端单帧限制 | `inspect_analysis_view` 或 `export_evidence_bundle`，不要重跑 |
| `--inspect` 连不上 Electron | 打包时 fuse 关掉了 CLI inspect | 先 `inspect_electron_fuses` 确认 |
| 路径含空格/破折号开头的符号 | CLI 位置参数解析歧义 | 用 `--procedure=<name>` / `--query=<text>` 的长等号形式 |
| 设置 `REA_*` 后子进程没生效 | 不在已知清单内 | 查本文第 4 节；不要假设任意变量会透传 |
| `check-env` 报 `rea_version` STALE | REA 已升级，技能清单没跟上 | 按 `known-issues.md` 的记录方式重核工具清单与命令名，`rea_version`/`tool_count`/`cli_command_count` 三个锚点一起改 |

## 9. 更新

```bash
rea update                          # 全局安装
npx rea-agents@latest setup         # npx 形态：刷新注册与 skill
```

更新后必须重启 Agent 才能让新工具/skill 生效。遇到 bug 先升级再报告（新版本通常已修）。
