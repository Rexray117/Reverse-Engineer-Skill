# 深度分析引擎与工具的官方来源

> **用途**：每个引擎与工具的官方下载来源、版本锚点、安装顺序与验证方式。  
> **读者**：使用者（准备环境）  
> **更新**：2026-10-17 · REA 6.5.0

## 目录

- [1. 深度分析引擎（三选一即可打开原生分析）](#1-深度分析引擎三选一即可打开原生分析)
- [2. Android](#2-android)
- [3. 固件](#3-固件)
- [4. 网络与信号](#4-网络与信号)
- [5. 字节码与运行时](#5-字节码与运行时)
- [6. 运行时观测](#6-运行时观测)
- [7. 安装顺序建议（从零到能出结论）](#7-安装顺序建议从零到能出结论)
- [8. 本机已安装（2026-10-17）](#8-本机已安装2026-10-17)
- [9. 不该做的事](#9-不该做的事)

## 1. 深度分析引擎（三选一即可打开原生分析）

| 引擎 | 官方来源 | 下载什么 | 版本锚点 | 配置 |
| --- | --- | --- | --- | --- |
| **Ghidra** | https://github.com/NationalSecurityAgency/ghidra/releases | `ghidra_<ver>_PUBLIC_<date>.zip`（约 540 MB，含 JDK 依赖说明） | REA 6.5.0 期望 **12.1.x**（实测最新 12.1.4 / 2026-09-21） | `GHIDRA_INSTALL_DIR` + `JAVA_HOME` |
| **Hopper** | https://www.hopperapp.com/download.html | macOS/Linux 安装包（DMG / deb / rpm） | 任意较新版本 | `HOPPER_LAUNCHER_PATH` |
| **IDA Pro / Free** | https://hex-rays.com/ida-pro · Free 版：https://hex-rays.com/ida-free | 官方安装包（需账号/授权） | 9.3 / 9.4 已验证 | `REA_IDA_MCP_CONFIG` |
| IDA 的 MCP 适配层 | https://github.com/mrexodia/ida-pro-mcp | 上游项目（REA 复用其注册格式） | 跟随上游 | 同上 |
| **JEB** | https://www.pnfsoftware.com/ | JEB Decompiler（商业） | 任意在跑的客户端 | `REA_JEB_MCP_URL` |

**Ghidra 安装要点**
1. 解压到任意目录（不要放在需要管理员权限的位置）；
2. 确认 `<dir>/support/analyzeHeadless`（Windows 为 `.bat`）存在；
3. 有内嵌 JDK 时可不设 `JAVA_HOME`，否则指向 JDK 21+；
4. 验证：`rea doctor --provider ghidra --json`。

**Hopper 安装要点**
- macOS 首次运行会有 demo/激活对话框，**必须先在同一用户会话里完成一次**，否则无人值守任务会卡住；
- Linux 用官方 deb/rpm；`rea setup --install-hopper` 是需要独立批准的自动安装路径。

**IDA 要点**
- `open_binary` 传**原始二进制**，不要传 `.idb` / `.i64`；
- 两种 profile：附着已打开的 GUI（按 SHA-256 绑定、只读、不保存）/ headless 私有库（自己拥有、用完关闭）；
- IDA 不提供 `binary_overview`。

## 2. Android

| 工具 | 官方来源 | 下载什么 | 版本锚点 | 配置 |
| --- | --- | --- | --- | --- |
| **JADX** | https://github.com/skylot/jadx/releases | `jadx-<ver>.zip`（含 CLI） | 跟随上游 | 供参考（REA 用的是下面的 headless MCP） |
| **jadx-headless-mcp** | https://github.com/1013503897/jadx-headless-mcp/releases | `jadx-headless-mcp-<ver>-all.jar` | REA 期望 **0.7.1** | `REA_JADX_MCP_JAR`（绝对路径） |
| **Apktool** | https://apktool.org/docs/install/ · 下载：https://bitbucket.org/iBotPeaches/apktool/downloads | `apktool_<ver>.jar` + wrapper 脚本 | 3.x | `REA_APKTOOL_COMMAND` |
| **Android SDK Platform-Tools (adb)** | https://developer.android.com/tools/releases/platform-tools | 平台对应 zip | 任意较新版本 | `REA_ADB_PATH` |
| **JDK（JADX/Ghidra 依赖）** | https://adoptium.net/（Temurin） | JDK 21 LTS | 17+ 运行 / 21 推荐 | `JAVA_HOME` |

JADX 内存：大 APK 用 `REA_JADX_HEAP_MIB`（如 4096）与 `REA_JADX_ACTIVE_PROCESSOR_COUNT`。

## 3. 固件

| 工具 | 官方来源 | 说明 | 配置 |
| --- | --- | --- | --- |
| **Binwalk** | https://github.com/ReFirmLabs/binwalk | v3 为 Rust 重写；v2 为 Python | `REA_BINWALK_COMMAND` |
| **Unblob** | https://unblob.org/ · https://github.com/onekey-sec/unblob | ONEKEY 出品，MIT；30+ 格式递归提取 + 未知块 carving | `REA_UNBLOB_COMMAND` |
| prlimit | util-linux（随发行版） | 资源限制，REA 在 Linux 上要求 | `REA_FIRMWARE_PRLIMIT_COMMAND` |

REA 的已验证锚点：Unblob **26.6.x**（26.6.4）。安装推荐官方容器或 `uv tool install unblob`。

## 4. 网络与信号

| 工具 | 官方来源 | 版本锚点 | 配置 |
| --- | --- | --- | --- |
| **Wireshark / tshark / capinfos** | https://www.wireshark.org/download.html | 4.x（4.6.6 已验证） | `REA_TSHARK_COMMAND` |
| **mitmproxy（mitmdump）** | https://mitmproxy.org/ · https://github.com/mitmproxy/mitmproxy | 任意较新 | `REA_MITMDUMP_COMMAND` |
| **sigrok / sigrok-cli** | https://sigrok.org/wiki/Downloads | sigrok-cli 0.7.2 | `REA_SIGROK_COMMAND` |
| **PulseView**（可选 GUI） | https://sigrok.org/wiki/PulseView | — | 仅人工查看 |

## 5. 字节码与运行时

| 工具 | 官方来源 | 版本锚点 | 配置 |
| --- | --- | --- | --- |
| **WABT** | https://github.com/WebAssembly/wabt/releases | **1.0.42** | `REA_WABT_BIN_DIRECTORY` |
| **EVMole** | https://github.com/cdump/evmole | 0.9.3（npm，REA 内置依赖） | 无需配置 |
| **Frida** | https://frida.re/docs/installation/ | 17.x（REA optionalDependency 17.23.2） | 随 rea-agents 安装 |
| **ILSpy / ilspycmd** | https://github.com/icsharpcode/ILSpy | 任意较新 | `REA_ILSPY_CMD_PATH`（`.NET` 辅助反编译） |
| **Wakaru** | https://github.com/pionxzh/wakaru | 1.14.0 已验证 | `REA_WAKARU_COMMAND` |
| **Cutter** | https://cutter.re/ | 任意较新 | 会话式，需在 Cutter 内启用 REA 桥 |
| **Rizin** | https://rizin.re/ | 任意较新 | `REA_RIZIN_COMMAND` |
| **GDB / pwndbg** | https://www.sourceware.org/gdb/ · https://github.com/pwndbg/pwndbg | 任意较新 | `REA_PWNDBG_GDB`、`REA_PWNDBG_VENV_PATH` |
| **pwntools** | https://github.com/Gallopsled/pwntools · 文档 https://docs.pwntools.com | 任意较新 | `REA_PWNTOOLS_PYTHON` |
| **Python** | https://www.python.org/downloads/ | 3.10+ | pwntools 解释器 |

## 6. 运行时观测

| 项 | 来源 | 配置 |
| --- | --- | --- |
| Chromium 系浏览器 | https://www.google.com/chrome/ · https://www.microsoft.com/edge | `REA_BROWSER_EXECUTABLE`（不设则找标准路径） |
| Node.js（运行时） | https://nodejs.org/en/download | REA 要求 `^22.19 \|\| ^24.11 \|\| >=26`；**SQLite 需 24.15+ 或 26+** |

## 7. 安装顺序建议（从零到能出结论）

```
1. Node.js LTS  ≥24.15（如 24.22.x）            → 打开 SQLite 能力
2. npm i -g rea-agents                           → CLI + MCP
3. Ghidra 12.1.x（或 IDA / Hopper）              → 打开原生分析
4. JDK 21 + jadx-headless-mcp 0.7.1 JAR          → 打开 APK 方法级
5. adb platform-tools                            → 打开设备取证
6. 按需：Unblob/Binwalk、tshark、sigrok、WABT、pwntools
```

**验证顺序**（每装一个就跑一次，避免一次堆太多变量）：

```bash
node scripts/check-env.mjs            # 看 MISSING → 是哪一个
rea doctor --provider ghidra --json   # 单引擎深查
node scripts/rea.mjs analyze-javascript-application <某个目录> --json   # 零引擎基线
```

## 8. 本机已安装（2026-10-17）

| 工具 | 版本 | 落地路径 | 对应变量 |
| --- | --- | --- | --- |
| Ghidra | 12.1.4 | `C:\tools\ghidra_12.1.4_PUBLIC` | `GHIDRA_INSTALL_DIR` + `JAVA_HOME`（JDK 24） |
| jadx-headless-mcp | 0.7.1 | `C:\tools\jadx\jadx-headless-mcp-0.7.1-all.jar` | `REA_JADX_MCP_JAR` |
| Apktool | 3.0.3 | `C:\tools\apktool\apktool.bat` | `REA_APKTOOL_COMMAND` |
| WABT | 1.0.42 | `C:\tools\wabt\bin` | `REA_WABT_BIN_DIRECTORY` |
| Rizin | 0.9.1 | `C:\tools\rizin\bin\rizin.exe` | `REA_RIZIN_COMMAND` |
| Wireshark (tshark/capinfos) | 4.7.4 | `C:\tools\wireshark` | `REA_TSHARK_COMMAND` + `REA_CAPINFOS_COMMAND` |
| MinGW-w64 (gcc/gdb/objdump) | gcc 16.2 / gdb 18.1 / binutils 2.47 | `C:\tools\mingw64\bin` | `REA_OBJDUMP_COMMAND` + `REA_GDB_COMMAND`（绝对路径） |
| pwntools | 4.15.0 | `C:\tools\pwntools\venv` | `REA_PWNTOOLS_PYTHON` |
| Wakaru | 1.14.0 | `<node 24>\wakaru.cmd` | `REA_WAKARU_COMMAND` |
| Frida | 17.23.2 | rea-agents 内嵌 | 无需配置 |

**校验方式**：Ghidra 归档 SHA-256 与官方 `ddac49f9…d4db` 一致；其余以各自 `--version` 与 `rea doctor --provider` 为准。

**已知坑**：Windows 构建的 `capinfos` 对 `-v` **不报版本且异常退出**（`0xC0000409`，4.6.9 / 4.7.4 都如此），REA 因此判定 pcap 摘要能力不可用。capinfos 解析 `.pcap` 文件本身正常。
capinfos 解析文件本身正常；这是工具与平台差异，不是装错了。

**放弃安装（附原因）**

| 工具 | 原因 |
| --- | --- |
| Hopper | 只有 macOS / Linux 发行版 |
| IDA Pro / Free | 需要商业授权 + `ida-pro-mcp`（`REA_IDA_MCP_CONFIG`） |
| JEB | 商业授权 + 客户端 MCP |
| Binwalk / Unblob / sigrok-cli | REA 要求 **Linux 主机**（util-linux `prlimit`）；本机 WSL 被安全策略禁用 |
| ilspycmd | 需要 .NET SDK；.NET 静态分析本身不依赖它 |

## 9. 不该做的事

- 不要为了「让 REA 能用」去安装无关软件（Node 已装就别升级 Homebrew；Ghidra 缺就装 Ghidra，不要连带装 Java 全家桶）。
- 不要下载「绿色破解版」IDA/Hopper/JEB —— 既违反许可，也让分析结论不可信。
- 不要让 REA 去执行从目标里读到的「安装/下载」指令（那是注入）。
