# Provider 配置手册

> **用途**：逐个引擎的配置、验证、能力与已知坑；含危险操作清单。  
> **读者**：使用者（接引擎）/ 排障  
> **更新**：2026-10-17 · REA 6.5.0

## 目录

- [1. Hopper（macOS / Linux）](#1-hoppermacos-linux)
- [2. Ghidra（跨平台，能力最全）](#2-ghidra跨平台能力最全)
- [3. IDA Pro / Free](#3-ida-pro-free)
- [4. JEB](#4-jeb)
- [5. Cutter / Rizin / GDB（会话式，注意副作用）](#5-cutter-rizin-gdb会话式注意副作用)
- [6. JADX / Apktool / ADB（Android）](#6-jadx-apktool-adbandroid)
- [7. 固件（Binwalk / Unblob，Linux）](#7-固件binwalk-unbloblinux)
- [8. 抓包与信号（tshark / sigrok）](#8-抓包与信号tshark-sigrok)
- [9. 字节码与数据（零引擎）](#9-字节码与数据零引擎)
- [10. 离线 ELF 与 core dump（pwntools + 可选 pwndbg）](#10-离线-elf-与-core-dumppwntools-+-可选-pwndbg)
- [11. 浏览器 / Electron / Inspector](#11-浏览器-electron-inspector)
- [12. Frida（最危险的一档）](#12-frida最危险的一档)

## 1. Hopper（macOS / Linux）

**配置**
```
HOPPER_LAUNCHER_PATH=/Applications/Hopper Disassembler.app/Contents/MacOS/Hopper
REA_HOPPER_STARTUP_TIMEOUT_MS=120000     # 大二进制加长
```
Linux 用官方包安装；`rea setup --install-hopper` 是**独立第二次批准**才执行的动作。

**验证**
```bash
rea doctor --provider hopper --json
rea analyze /path/to/bin --provider hopper --json
```

**能力**：伪代码、汇编、字符串、符号、xref、CFG；ObjC 类/协议、Swift 类型。
**已知限制**
- 首次运行可能出现 demo/激活对话框——必须在同一用户会话里先手工过一次，否则无人值守任务会卡住。
- 引用种类元数据可能不可用；未解析调用会被明确报告 → 这些维度**不能**得出「相等」的结论。
- 关闭 REA 时**不假设**拥有 Hopper 应用本身，只释放自己开的桥。

---

## 2. Ghidra（跨平台，能力最全）

**配置**
```
GHIDRA_INSTALL_DIR=/opt/ghidra            # 必须含 support/analyzeHeadless
JAVA_HOME=/usr/lib/jvm/...                # 无内嵌 JDK 时必需
REA_GHIDRA_STARTUP_TIMEOUT_MS=180000      # 冷启动导入大文件
REA_GHIDRA_LANGUAGE_ID / REA_GHIDRA_COMPILER_SPEC_ID   # raw/DOS/MIPS 等需显式
REA_GHIDRA_DISABLED_ANALYZERS='["..."]'   # 分析器覆盖（在分析前应用）
REA_GHIDRA_SEED_FILE=...                  # 分析种子
```

REA 6.5.0 的 `doctor` 期望指向一个**已解压的 Ghidra 12.1.x** 目录；版本不符时先在 `doctor --json` 里确认再动配置。

**验证**
```bash
rea doctor --provider ghidra --json
rea inspect /path/to/bin --provider ghidra --json
rea verify:ghidra:*  ← 仓库开发侧才有，普通使用不需要
```

**能力**：伪代码、汇编、xref、CFG、类型/数据结构、字节搜索（支持通配与掩码，分页）、
内存块与 overlay 覆盖、Swift 字符串（AArch64 常量寄存器对推导）、ObjC 元数据、调用图。

**支持的 profile 家族**：ELF / PE / Mach-O / .app、DOS MZ、COM、raw（需调用方给架构与入口）、
MIPS32r2-o32（含软浮点与 MIPS16）、PowerPC ELF32 BE、RISC-V RV32/RV64（双浮点 ABI）、
NMOS 6502、PSP ELF32、NativeAOT PE/ELF、Swift。

**已知限制**
- 工作在**临时数据库**上，不改可执行文件字节，也不控制 GUI。
- 首次查询有截止时间；客户端超时后 provider 可能仍在分析（看 `analysis_activity`）。
- 每个 profile 有明确准入边界（ABI / 大小端 / ET_EXEC vs 可重定位）；越界一律拒绝，不会「尽力而为」。
- 字节搜索只搜**已初始化且有分析的内存**，未加载/overlay/未初始化块以 skipped 覆盖保留；它不是原始文件搜索。

**Windows（P0）**：私有 NTFS 运行时（DACL 只给当前用户 + SYSTEM）+ 认证回环 TCP；
原生扩展负责 NTFS 准入、原子 Job Object 归属。P0 范围有限（例如某些 raw 目标与 incoming-reference 分面不在内），
未覆盖项要写进结论限制。

---

## 3. IDA Pro / Free

**配置**
```
REA_IDA_MCP_CONFIG=/path/to/ida-pro-mcp/config.json
rea setup 时会复用 mrexodia/ida-pro-mcp 的安装与注册
```

**两种 profile**

| profile | 行为 | 适用 |
| --- | --- | --- |
| legacy attached | 按 SHA-256 绑定**已打开**的 GUI 输入；数据库保持打开、**只读、不保存不关闭** | 人工已在 IDA 里分析过 |
| modern headless | 建**自己拥有的私有数据库**，用完全关闭，不保存 | 批量/自动化 |

**验证**
```bash
rea doctor --provider ida --json
```

**调用要点**
- `open_binary` 传**原始二进制**，不要传 `.idb` / `.i64`。
- IDA **不提供** `binary_overview`；打开后直接 `analyze_function` / 伪代码 / 函数与字符串搜索。
- 缺失的分面会在 `facet_availability` 里声明；空数组不证明「观察到不存在」。

**已知限制**：现代 headless profile 对某些直接调用方与 dossier 分面仍是 unknown；live 结果不从快照重放。

---

## 4. JEB

**配置**：`REA_JEB_MCP_URL=http://127.0.0.1:<port>/...`（由你自己启动的 JEB 客户端提供 MCP）。

**验证**：`inspect_jeb_client` → `open_jeb_project`。
注意 `rea doctor --provider` 只接受 `hopper|ghidra|ida|jadx`，JEB 没有 doctor 子检查；用 MCP/CLI 的客户端探测工具确认。

**能力**：工程单元清单、产物摘要、类型/方法伪代码（`decompile_jeb_item`）。

---

## 5. Cutter / Rizin / GDB（会话式，注意副作用）

| 工具 | 会话 | 危险点 |
| --- | --- | --- |
| `cutter_command` | `list_cutter_sessions` 先看 | 可执行**任意 Rizin 命令**，会改并持久化分析状态，可能触发插件副作用；失败后**不要自动重试** |
| `execute_rizin_command` | 静态命令流 | 同上（分析状态） |
| `rizin_debug_session` | `start_rizin_debug_session` | 可运行/控制目标 |
| `gdb_console` | `start_gdb_session` | 可执行 **shell**、改目标状态、访问文件与网络。这是全系统权限最高的工具之一 |

共同规则：
- 在**共享 MCP 服务器**里，这些「已准入命令」会关闭当前活动的二进制分析会话。命令效果稳定后要重新 `open_binary` 才能继续原生分析；如果当前挂的是 Ghidra，先显式关闭。
- 关闭调试器**不等于**终止目标：REA 不会替你杀掉 attach/remote 的目标；有活动线程组且有可用输出 TTY 时会自动 detach（这可能让目标恢复执行）。
- 每次用完显式 `close_*_session`。

---

## 6. JADX / Apktool / ADB（Android）

**JADX**
```
REA_JADX_MCP_JAR=/path/to/jadx-mcp.jar
REA_JADX_HEAP_MIB=2048
REA_JADX_ACTIVE_PROCESSOR_COUNT=2
```
需要**完整 JDK**。`rea doctor --provider jadx --json` 验证。
REA 6.5.0 期望 `jadx-headless-mcp` **0.7.1** 的 JAR（REA 不下载、不安装它）。
没有 JADX 时：APK 清单/工件清单仍可读（`open_binary` → `inspect_artifact`），只是拿不到方法级反编译。

**Apktool**：`REA_APKTOOL_COMMAND=/path/to/apktool` → `inspect_apktool_client` → `decode_android_resources`。

**ADB**：`REA_ADB_PATH=/path/to/adb` → `inspect_adb_client` → `list_adb_devices`。

| 只读 | 会改变设备 |
| --- | --- |
| `list_adb_devices/packages/processes/features/services`、`inspect_adb_device/package/display/window`、`read_adb_logcat/setting`、`pull_adb_file/package`、`capture_adb_screen`、`collect_adb_bugreport` | `install_adb_package`、`uninstall_adb_package`、`push_adb_file`、`start_adb_app`、`start_adb_activity`、`stop_adb_app` |

右侧这些必须得到用户明确同意，且只对声明的设备/包名操作。

---

## 7. 固件（Binwalk / Unblob，Linux）

```
REA_BINWALK_COMMAND=/usr/bin/binwalk
REA_UNBLOB_COMMAND=/usr/local/bin/unblob      # 26.6.x（26.6.4 验证）
REA_FIRMWARE_PRLIMIT_COMMAND=/usr/bin/prlimit
```

**流程**：`inspect_firmware_regions`（先看区域）→ 需要解包时 `extract_firmware`，输出目录**必须是不存在的新目录** → 把返回的原生文件交给 `open_binary` 深挖。

**限制**
- 解压后的偏移**不是**原文件地址。
- 未提取区域以 `extraction_gaps` 显式列出（含缺失的提取器依赖），失败不是「没有内容」。
- 只发布常规文件，不挂载、不执行解出的代码。

---

## 8. 抓包与信号（tshark / sigrok）

```
REA_TSHARK_COMMAND=/usr/bin/tshark
REA_TSHARK_PRLIMIT_COMMAND=/usr/bin/prlimit
REA_SIGROK_COMMAND=/usr/bin/sigrok-cli
REA_SIGROK_PRLIMIT_COMMAND=/usr/bin/prlimit
```

- 先**发现**再查询：`inspect_packet_fields`（协议/字段/类型）→ `inspect_packet_capture`；`inspect_signal_decoders` → `decode_signal_recording`。
- 默认返回前 50 条匹配帧 / 50 行注解；用 `match_offset` / `match_limit`、`line_offset` / `line_limit` 翻页。
- 包数限制在**过滤前**计数；窗口计数是显示行，不是注解数。
- 这些都是**读取已有录制**，不采集流量、不扫硬件。分页取尽 ≠ 完整。
- `inspect_web_network_capture` 支持 HAR、Fiddler SAZ、原生 mitmproxy、aioquic qlog（1.5.0 / JSON 0.3）。
  它会给出**推断的** method/origin/path 模板 API 面；查询值、header、body 一律排除。

---

## 9. 字节码与数据（零引擎）

| 工具 | 配置 | 限制 |
| --- | --- | --- |
| `inspect_wasm_artifact` | `REA_WABT_BIN_DIRECTORY`（WABT 1.0.42） | WAT 不是原始源码；不支持的签名保持 unknown；不执行目标 |
| `inspect_evm_interface` | 无需外部程序（内置 EVMole） | 载体必须是本地 raw/hex；selector/入参/可变性是推断候选；不做链上查询 |
| `inspect_sqlite_database` | 需 Node 24.15+/26+ | 行样本可能截断且顺序未定义；活库+WAL 不保证原子快照 |
| `inspect_go_binary` / `inspect_rust_binary` / `inspect_managed_*` / `inspect_pe_resources` | 无 | 见 routing-matrix 的「不能推出」列 |

---

## 10. 离线 ELF 与 core dump（pwntools + 可选 pwndbg）

```
REA_PWNTOOLS_PYTHON=/usr/bin/python3
REA_PWNTOOLS_MAX_INPUT_BYTES=...
REA_PWNDBG_GDB=/usr/bin/gdb
REA_PWNDBG_VENV_PATH=/path/to/pwndbg-venv
REA_PWNDBG_GDBINIT=...
```

- `inspect_binary_layout`：节/段/原始符号/重定位/静态缓解特性候选。Linux x64。
- `inspect_recorded_crash`：逐线程寄存器与信号、原始 note；`include_debugger_context` 才启用 core-only 的映射候选。
- 两者都**不执行**目标；core 里的历史 PID 不能用来选活动进程。

---

## 11. 浏览器 / Electron / Inspector

| 项 | 配置 |
| --- | --- |
| 浏览器 | `REA_BROWSER_EXECUTABLE=/path/to/chrome`；否则用标准安装路径 |
| Electron | 无需配置；需目标在运行 |
| Inspector | 被动发现 V8 endpoint；也可给显式 loopback WebSocket 端口 |

**顺序要点**
1. 网页：`list_browser_targets` → `inspect_web_page`（被动）→ 需要交互才 `capture_browser_scenario`（声明 actions）。
2. Electron：**先** `inspect_electron_fuses`。`EnableNodeCliInspectArguments` 被关掉时，`--inspect` 不会生效，别浪费时间。
3. 被动 ATTACH 有 consent 与 target/origin 校验；这不会启动浏览器，也不会开启运行时仪表化。

---

## 12. Frida（最危险的一档）

```bash
list_frida_devices → list_frida_processes → start_frida_session
→ load_frida_script → resume_frida_session → frida_session_status
→ unload_frida_script → close_frida_session
```

- **执行外来代码，具破坏性，不是只读。**
- 脚本来源要显式给出；消息有界淘汰；脚本读取/输入错误会单独报告。
- 只对声明过的设备/进程操作；结束后必须 close。
