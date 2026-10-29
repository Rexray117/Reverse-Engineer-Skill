# 已知问题与实测记录

> **用途**：本机实测记录：已修缺陷、环境安装现状、设计限制、验证矩阵与未验证清单。  
> **读者**：使用者（判断「为什么不可用」）/ 维护者  
> **更新**：2026-10-17 · REA 6.5.0 · 技能 v1.2.0

## 目录

- [1. 已在测试中修复的缺陷](#1-已在测试中修复的缺陷)
- [2. 环境安装现状](#2-环境安装现状)
- [3. 本机仍然不可用的能力](#3-本机仍然不可用的能力)
- [4. 设计层面已知限制](#4-设计层面已知限制)
- [5. 验证矩阵](#5-验证矩阵)
- [6. 还没验证到的](#6-还没验证到的)

## 1. 已在测试中修复的缺陷

### 1.1 Frida 被误报为「未安装」

- **现象**：`check-env.mjs` 显示 `Frida MISSING`，但 Frida 实际可用。
- **原因**：探测只看 `PATH` 上的 `frida` 可执行文件与 `NODE_PATH`。而 Frida 是 `rea-agents` 的 **optionalDependency**，装在 `<node>/node_modules/rea-agents/node_modules/frida`，两者都命中不了。
- **修复**：改为在「选中的 Node 运行时」下探测内嵌模块；`--deep` 时真正调用 `enumerateDevices()` 验证。
- **验证**：`Frida OK … · 3 个设备`。

### 1.2 Windows 下 `.cmd` 直接 spawn 失败（EINVAL）

- **现象**：`spawnSync('…\rea.cmd')` 抛 `spawnSync EINVAL`。
- **原因**：Node 22+ 不允许无 shell 执行 `.cmd`/`.bat`；而 MCP 客户端启动子进程时不带 shell。
- **修复**：解析 shim 同级的 JS 入口（`node_modules/rea-agents/scripts/rea.mjs`、`node_modules/npm/bin/npx-cli.js`），用选中的 `node.exe` 直接运行。
- **验证**：`rea.mjs --version` → `6.5.0`；MCP 握手正常。

### 1.3 文档写错 `doctor --provider jeb`

- **现象**：`rea doctor --provider sqlite` 返回 `VALIDATION_ERROR`，合法值只有 `hopper|ghidra|ida|jadx`。
- **修复**：`provider-playbooks.md` 与 `environment-setup.md` 已改为正确取值集合，并说明其它适配器没有 doctor 子检查。

### 1.4 Node 版本不足导致 SQLite 不可用

- **现象**：Node 22.22.2 下「SQLite 能力 = N/A」。
- **修复**：安装 Node 24.22.0 LTS 并把它前置到 PATH（机器 + 用户两级），REA 重新全局安装于其下；`pickRuntime()` 优先选 ≥24.15。
- **验证**：`inspect_sqlite_database` 返回 engine SQLite 3.53.4、表 `items`、类型化行值。

### 1.5 环境变量清单不全（漏了 5 个）

- **现象**：按文档只设 9 个变量后，`inspect-with-objdump` 失败（`Owned Windows process requires an absolute executable path`），pcap 摘要报 capinfos 相关错误。
- **根因**：从 `dist` 里实际检索到的 `*_COMMAND` 还有：`REA_CAPINFOS_COMMAND`、`REA_OBJDUMP_COMMAND`、`REA_GDB_COMMAND`、`REA_EVM_PRLIMIT_COMMAND`、`REA_JAVASCRIPT_PRLIMIT_COMMAND`。
- **修复**：`apply-env.mjs` 补上 capinfos / objdump / gdb 的探测与写入；`environment-setup.md` 的环境变量表同步补齐。
- **附带结论**：**Windows 上 `PATH` 不够**，这些工具必须走 `*_COMMAND` 绝对路径。

### 1.6 CLI 没有 `--detail`（文档写错）

- **现象**：`rea analyze-javascript-application … --detail summary` → `UNKNOWN Unknown flag: --detail`。
- **根因**：`detail` 是 MCP 输入字段，不是 CLI 选项。
- **修复**：`SKILL.md` 与 `evidence-discipline.md` 改为「CLI 落盘 + `inspect-analysis-view` 投影」，并给出实测可用的 jq 配方。

### 1.7 capinfos 在 Windows 上不报版本 → pcap 摘要不可用

- **现象**：`inspect-pcap-capture` 报 `The selected tool …capinfos.exe cannot report its version`。
- **实测（v1.2.0 修正归因）**：`capinfos -v` 在 Windows 构建（4.6.9 / 4.7.4）上**标准输出为空且进程异常退出**——
  REA 侧记录到的 `exit_code` 是 `3221226505`（`0xC0000409`，`STATUS_STACK_BUFFER_OVERRUN`）。
  早期记录写成「空输出 exit 0」不准确：不是静默返回，是**崩溃**。`-h` 同样异常，只有无参数时才打印 usage。
  而 `capinfos sample.pcap` **能正常解析**（1 packet / Ethernet），`tshark -v` 正常。
- **结论**：REA 用 `capinfos` 的版本探测作为能力前置条件，这一步在 Windows 构建上无法通过 → `inspect_pcap_capture`（pcap 摘要）在 Windows 不可用。
  这是**本地 Wireshark 构建的缺陷**，不是 REA 的平台限制——契约里写的是「Windows uses owned Job Objects」，即设计上支持 Windows。
- **未采用的做法**：写一个 `-v` 时伪造版本号的 wrapper。那会让 REA 认为能力就绪，属于污染能力判断，不做。
- **仍可用**：`tshark` 本身可独立验证样本；`inspect_packet_capture`（字段级）本就要求 Linux。

### 1.8 体检把「已安装」当成「可调用」（v1.2.0 已修）

- **现象**：`check-env.mjs` 对 Ghidra / JADX / objdump / gdb / tshark / WABT 一律报 `OK`，
  但同一台机器上 `rea doctor` 报 `GHIDRA_INSTALL_DIR is not set`，`rea decompile` 也真的失败。
- **根因**：脚本先做「文件系统探测」，命中后把 `missing` 直接**升格为 `ok`**，只在备注里加一句括号说明。
  能力判定又用 `state === "ok"`，于是 CLI 口径被写成了「装了就算能用」。
- **修法**：新增 `NO-ENV` 状态 + 每行 `provenance` 字段（`env` / `path` / `fs` / `none`）。
  只有 `missing` 会升格为 `NO-ENV`（`broken` 保留为错误，因为那说明变量设了但指向错的路径）。
  能力判定拆成两套：`capabilities`（CLI 口径，保守）与 `capabilitiesViaMcp`（读取 `mcp.json` 条目内嵌的变量）。
  输出尾部直接打印「仅文件系统可见」清单与**可粘贴的 bash / PowerShell 前缀**。
- **验证**：无 env → Ghidra `NO-ENV`、`原生深度分析 ✗`；带 `GHIDRA_INSTALL_DIR` 前缀 → `OK`、`✓`。同一脚本、同一机器，结论随通道变化。

### 1.9 清单/计数类断言缺失（v1.2.0 已补）

- **现象**：`tool-inventory.md` 里写了一个**不存在的工具** `prepare_bounded_process_capture`；
  §9 声明 14 个却列了 20 个；§12 / §14 各差 1；CLI 命令数写 153（实测 155）；把返回字段 `residual_unknowns` 当工具名。
  这些都不会让功能坏掉，但会让「按清单找工具」的 Agent 撞空，且升级后无人发现。
- **修法**：
  1. frontmatter 新增三个锚点 `rea_version` / `tool_count` / `cli_command_count`；
  2. `verify-package.mjs` 做**离线**一致性检查（唯一工具名 vs `tool_count`、清单 CLI 数 vs 锚点），不一致退出码 1；
  3. `check-env.mjs` 每次比对 `rea --version`，`--deep` 再连服务器数工具、读 `rea --help` 数命令；
  4. 清单本身订正：删幽灵名、把字段名移出反引号、分节计数改为「本节列出的工具数」，并在文档头说明交叉索引导致分节之和大于 207。
- **验证**：`verify-package.mjs` → 通过（207/207、155/155）；注入一个假工具名 → 未通过、exit 1；
  把 `rea_version` 改成 6.4.0 → `check-env` 报 STALE。

## 2. 环境安装现状

2026-10-17 补齐后的实际状态（Windows 11 x64）：

| 能力 | 工具 | 版本 | 位置 | 验证方式 |
| --- | --- | --- | --- | --- |
| 原生深度分析 | **Ghidra** | 12.1.4 | `C:\tools\ghidra_12.1.4_PUBLIC` | `doctor --provider ghidra` healthy；实测分析 notepad.exe / hello.exe |
| APK 方法级 | jadx-headless-mcp | 0.7.1 | `C:\tools\jadx\jadx-headless-mcp-0.7.1-all.jar` | `doctor --provider jadx` healthy（JAR 校验通过） |
| APK 资源 | Apktool | 3.0.3 | `C:\tools\apktool\apktool.bat` | `apktool --version` |
| WASM | WABT | 1.0.42 | `C:\tools\wabt\bin` | `wasm2wat --version` |
| Rizin 会话 | Rizin | 0.9.1 | `C:\tools\rizin\bin\rizin.exe` | `rizin -v` |
| 离线反汇编 | GNU objdump | 2.47 | `C:\tools\mingw64\bin`（已入 PATH） | `objdump --version` |
| 调试 | GNU gdb | 18.1 | 同上 | `gdb --version` |
| pcap 摘要 | tshark / capinfos | 4.7.4 | `C:\tools\wireshark` | `tshark -v` |
| JS 分块恢复 | Wakaru | 1.14.0 | Node 全局（`<node>/wakaru.cmd`） | `wakaru --help` |
| 离线 ELF / core | pwntools | 4.15.0 | `C:\tools\pwntools\venv` | `from pwn import version` |
| 运行时仪表化 | Frida | 17.23.2 | rea-agents 内嵌 | `enumerateDevices()` → 3 设备 |
| Android 设备 | adb | 既有 | `%LOCALAPPDATA%\Android\Sdk\platform-tools` | `check-env` OK |
| 浏览器观测 | Chrome | 既有 | `C:\Program Files\Google\Chrome` | `check-env` OK |
| 编译测试样本 | gcc | 16.2（winlibs） | `C:\tools\mingw64\bin` | 编译 hello.exe 并运行 |

安装总量约 **2.5 GB**（Ghidra 876 MB、MinGW 942 MB、Wireshark 299 MB、pwntools 204 MB、其余 ~150 MB）。下载缓存已清理。

**环境变量**（已 `setx` 写入用户环境，新进程生效，共 **12** 个）：

```
GHIDRA_INSTALL_DIR, JAVA_HOME, REA_JADX_MCP_JAR, REA_APKTOOL_COMMAND,
REA_WABT_BIN_DIRECTORY, REA_RIZIN_COMMAND, REA_TSHARK_COMMAND, REA_CAPINFOS_COMMAND,
REA_OBJDUMP_COMMAND, REA_GDB_COMMAND, REA_PWNTOOLS_PYTHON, REA_WAKARU_COMMAND
```

**PATH 变更**：

1. `C:\Users\ASUS\.workbuddy\binaries\node\versions\24.22.0` 已前置到 **机器 + 用户** 两级 PATH
   （机器 PATH 优先，所以要动机器级才能压过 `D:\work2\node.js\`）。改前备份：`C:\tools\path-backup-20261017-122607.txt`。
2. `C:\tools\mingw64\bin` 追加到用户 PATH（供人手动用 gcc/gdb；REA 自己走 `*_COMMAND` 绝对路径，不依赖它）。

## 3. 本机仍然不可用的能力

| 能力 | 缺什么 | 为什么补不上 |
| --- | --- | --- |
| 固件（区域/提取） | Binwalk / Unblob | REA 的固件适配器**要求 Linux 主机**（依赖 util-linux `prlimit`）。本机 WSL 被安全策略禁用（`wsl.exe` 在黑名单），无法提供 Linux 环境 |
| 逻辑信号解码 | sigrok-cli | 同上，要求 Linux + `prlimit`；Windows 版装了也不会被接受 |
| pcap **字段级** | — | `inspect_packet_capture` 要求 Linux；tshark 已装但该能力在 Windows 不可用 |
| pcap **摘要** | — | `inspect_pcap_capture` 需要 capinfos 能报版本；**Windows 构建的 capinfos 对 `-v` 会崩溃退出**（`0xC0000409`，4.6.9 / 4.7.4 实测），REA 据此判定能力不可用。见 §1.7。capinfos 本身解析文件正常 |
| 离线 ELF / core dump | — | pwntools 已装，但 `inspect_binary_layout` / `inspect_recorded_crash` 要求 Linux x64，REA 会直接拒绝 |
| Hopper | — | 仅 macOS / Linux 有发行版 |
| IDA | 授权 + idalib | 商业软件，需自有 license 与 `ida-pro-mcp` 注册；未安装 |
| ilspycmd | .NET SDK | 可选辅助（.NET 静态分析不依赖它）；需要 `Microsoft.DotNet.SDK` |
| JEB | 商业 license | 需自有客户端 + `REA_JEB_MCP_URL` |

> 这些不是技能缺陷，是**平台与授权边界**。结论里必须如实写「未覆盖」，不能用「分析完成」糊过去。

## 4. 设计层面已知限制

### 4.1 `rea doctor` 默认 audit-wide，`healthy: false` 具误导性

- 它会检查「所有已安装客户端的 REA 注册」「bundled skill 身份」「全部引擎」。
- 只注册了 WorkBuddy、且用的是本技能（不是 REA 自带 skill）时必然报 `config_drift`。
- **正确用法**：`rea doctor --provider ghidra --json` 看单引擎；日常看 `check-env.mjs`。
- 两者量的是不同东西，不要拿一个否证另一个：`doctor` 读**进程环境变量**（这正是 CLI 的真实前置条件），
  `check-env` 同时报告**安装**（文件系统）与**可达性**（env / PATH）。v1.2.0 起后者用 `NO-ENV` 明确区分，
  并在表尾给出补全前缀——所以「doctor 说 MISSING、check-env 说 NO-ENV」现在是同一个事实的两种写法，
  不再出现「一个说 OK、一个说 MISSING」的矛盾。

### 4.2 证据体积极大

- 4 文件的玩具工程 `--json` 约 150 KB（含 progress 事件流）；真实应用可达数百 MB。
- **必须**：`--json > file` 后只取需要的字段；MCP 侧用 `detail:"summary"` + `inspect_analysis_view`。

### 4.3 字段位置与直觉不同

- `analyze_javascript_application`：模块在 `normalized_result.graph.nodes`，**没有**顶层 `modules`。
- `inspect_sqlite_database`：结构在 `normalized_result.schema.{tables,…}`，行在 `rows`。
- `binary_overview`：`procedure_count` / `string_count` 是**数字**，不是列表。
- `procedure_pseudo_code`：`normalized_result` 本身就是**字符串**（伪代码正文）。

### 4.4 技能目录名含空格与大写（按要求保留）

- 名称：`Reverse Engineer-20261017`。已实测含空格路径下脚本、MCP 启动、子进程 spawn 全部正常。
- **残余风险**：少数加载器会对目录名做 slug 规范化，可能在「下一次会话发现该技能」时出问题。
- 若发现技能不出现：改用 kebab-case 目录名（`reverse-engineer-20261017`），`name` 字段保持不变即可。

### 4.5 MCP 条目绑定绝对路径

- 入口写死 `<versions>/24.22.0/node.exe` 与 `rea.mjs` 绝对路径；删除/升级运行时会让启动失败。
- **修复**：重跑 `node scripts/register-mcp.mjs --auto-env`（幂等、自动备份、自动选当前最佳运行时）。

## 5. 验证矩阵

| # | 项目 | 命令 | 结果 |
| --- | --- | --- | --- |
| 1 | 环境体检（文本） | `check-env.mjs` | ✅ 选中 v24.22.0，SQLite OK |
| 2 | 环境体检（JSON） | `check-env.mjs --json` | ✅ 合法 JSON |
| 3 | 深度体检 | `check-env.mjs --deep` | ✅ npm 11.19.1 / Frida 3 设备 |
| 4 | 工具枚举 | `list-tools.mjs --count` | ✅ 207 |
| 5 | 工具过滤 | `list-tools.mjs --grep sqlite` | ✅ 1 项 |
| 6 | 包装器透传 | `rea.mjs --version` | ✅ 6.5.0 |
| 7 | MCP 注册幂等 | `register-mcp.mjs` ×3 | ✅ added→updated→unchanged |
| 8 | MCP 握手 | JSON-RPC 探针 | ✅ `rea 6.5.0` / `2024-11-05` |
| 9 | SQLite 端到端 | `inspect-sqlite-database --table users` | ✅ engine SQLite 3.53.4 |
| 10 | JS 静态分析 | `analyze-javascript-application` | ✅ `ev_…`，graph 10 节点 |
| 11 | Ghidra 诊断 | `doctor --provider ghidra` | ✅ healthy，12.1.4 / win32 x64 |
| 12 | **Ghidra 真实分析（PE）** | `inspect notepad.exe --provider ghidra` | ✅ `ev_9c8e08…`，binary_overview，3m42s（首次导入） |
| 13 | **Ghidra 反编译（自编译 exe）** | `decompile hello.exe main` | ✅ `ev_23f1d24b…`，伪代码含 `printf("%d\n",0x2b)`（0x2b=43，与运行输出一致），42s |
| 14 | JADX 诊断 | `doctor --provider jadx` | ✅ healthy，JAR 校验通过 |
| 15 | Apktool | `apktool --version` | ✅ 3.0.3 |
| 16 | WABT / Rizin / tshark / wakaru | 各自 `--version` | ✅ 1.0.42 / 0.9.1 / 4.7.4 / 1.14.0 |
| 17 | objdump / gdb | `--version` | ✅ 2.47 / 18.1 |
| 18 | gcc 编译样本 | `gcc -O1 -o hello.exe hello.c` | ✅ 61 KB，运行输出 43 |
| 19 | pwntools | `from pwn import version` | ✅ 4.15.0 |
| 20 | 技能包自检 | `verify-package.mjs` | ✅ 名称一致、引用齐全 |
| 21 | **MCP 侧引擎可用性** | 通过最终配置启动服务器 → `open_binary(hello.exe, ghidra)` | ✅ 无错误；打开后可用工具组 39/75 → **52/74**，原生工具组（25 个）转为 available |
| 22 | PATH 前置生效 | 由注册表合成「新登录 shell」的 PATH 后解析 | ✅ `node`/`rea` 均解析到 `versions\24.22.0`，`node -v`=24.22.0、`npm -v`=11.19.1、`rea`=6.5.0 |
| 23 | objdump 链路 | `rea inspect-with-objdump hello.exe symbols` | ✅ `ev_7b1e97…`，stdout 含 `pei-x86-64` 符号表 |
| 24 | WASM 链路 | `rea inspect-wasm-artifact empty.wasm` | ✅ `ev_711ee1b7…`（8 字节最小模块） |
| 25 | Ghidra 复测（新 PATH） | `rea decompile hello.exe main` | ✅ 41s，同一 Evidence `ev_23f1d24b…`，`printf("%d\n",0x2b)` |
| 26 | CLI 证据投影 | `--json > file` + `inspect-analysis-view` | ✅ 67 KB 证据 → summary 投影，`parent_evidence_id` 指向原证据 |
| 27 | pcap 摘要 | `rea inspect-pcap-capture sample.pcap` | ❌ capinfos 版本探测失败（见 §1.7）；`capinfos` 单独解析样本正常 |
| 28 | **NO-ENV 状态** | 无 env 跑 `check-env.mjs` | ✅ Ghidra/JADX/objdump/gdb/tshark/capinfos/WABT 报 `NO-ENV`，`原生深度分析 ✗`，尾部给出 9 条 CLI 前缀 |
| 29 | **环境前缀翻转** | 带 `GHIDRA_INSTALL_DIR` + `REA_JADX_MCP_JAR` 复跑 | ✅ Ghidra 转 `OK`，`原生深度分析 ✓`、`APK方法级反编译 ✓` |
| 30 | **版本断言（正向）** | `check-env.mjs --deep` | ✅ `rea_version` 6.5.0 一致；`tool_count` 207/207 实测；`rea --help` 155/155 |
| 31 | **版本断言（负向）** | 临时把 `rea_version` 改 6.4.0、`tool_count` 改 206 | ✅ 两行报 `STALE`，尾部输出「技能需要对齐」 |
| 32 | **离线断言（负向）** | 向清单注入假工具名 `ghost_tool_name` | ✅ `verify-package.mjs` 报 208≠207，退出码 1 |
| 33 | 包自检（增强后） | `verify-package.mjs` | ✅ 身份/引用/三锚点/清单一致性全过，退出码 0 |

## 6. 还没验证到的

- JADX 对**真实 APK** 的端到端（只有 JAR 校验，没有样本）。
- 固件 / 信号 / pcap 字段级 / 离线 ELF：平台不支持，无法在本机验证。
- IDA / JEB / Hopper：未安装。
- 浏览器与 Electron 场景捕获：需要具体目标与用户授权。
- 下一会话中「技能是否被 WorkBuddy 正常发现并加载」（4.4 的风险点）。
- 非 Windows 平台行为。
