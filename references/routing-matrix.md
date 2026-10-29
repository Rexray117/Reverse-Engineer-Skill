# 目标路由矩阵

> **用途**：把「用户给的目标」映射到「第一个该用的工具」，并写出每类目标的能力边界。  
> **读者**：Agent（每次调查的入口）  
> **更新**：2026-10-17 · REA 6.5.0

## 目录

- [0. 先做一次分诊](#0-先做一次分诊)
- [1. 原生二进制](#1-原生二进制)
- [2. 托管产物与语言元数据](#2-托管产物与语言元数据)
- [3. 移动端](#3-移动端)
- [4. JavaScript / Electron / Web](#4-javascript-electron-web)
- [5. 归档、固件、抓包、信号](#5-归档固件抓包信号)
- [6. 字节码与数据](#6-字节码与数据)
- [7. 运行时行为](#7-运行时行为)
- [8. 会话与证据（所有路径共用）](#8-会话与证据所有路径共用)

## 0. 先做一次分诊

```
用户给的东西是什么？
├─ 一个路径...
│  ├─ 目录 / .asar             → analyze_javascript_application
│  ├─ .dll / .exe（.NET?）      → inspect_managed_artifact（零引擎）
│  ├─ .apk / .ipa / .zip / .msix / .dmg / .hap
│  │                           → open_binary → inspect_artifact
│  ├─ .apk 但要看代码           → inspect_android_package
│  ├─ .wasm                    → inspect_wasm_artifact
│  ├─ .bin/.img（固件）         → inspect_firmware_regions / extract_firmware
│  ├─ .db / .sqlite            → inspect_sqlite_database
│  ├─ .pcap/.pcapng            → inspect_pcap_capture（摘要）/ inspect_packet_capture（字段）
│  ├─ .sr / 逻辑信号            → decode_signal_recording
│  ├─ ELF / PE / Mach-O / .app → open_binary（需深度引擎）
│  └─ .core / core.<pid>       → inspect_recorded_crash
├─ 一个 URL / 已打开的网页       → list_browser_targets
├─ 一个 Electron 应用（在运行）  → list_electron_targets（先 inspect_electron_fuses）
├─ 一段 EVM 字节码（raw/hex）    → inspect_evm_interface
├─ 一份 HAR / SAZ / qlog        → inspect_web_network_capture
└─ 什么都没有（"我的 app"）      → 先问清是哪个 app、路径在哪；不要随便挑示例
```

## 1. 原生二进制

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| ELF / PE / Mach-O / .app | `open_binary` | `binary_overview` → `list_procedures` / `search_procedures` → `analyze_function` → `procedure_pseudo_code` / `read_function_instructions` → `trace_call_path` / `get_call_graph` | Hopper / Ghidra / IDA | 伪代码是**推断**，不等于原始源码；静态调用图不含虚调用/间接跳转的运行时目标 |
| 单函数算法还原 | `analyze_function` | 汇编 + xref + 类型；`compare_functions` 验证重建 | 同上 | 编译器优化可能已消除原始结构；浮点/整数语义需按 ABI 复核 |
| 离线 ELF 布局、符号、重定位、静态缓解 | `inspect_binary_layout` | `audit_residual_unknowns` | 自备 pwntools，Linux x64 | 不是反汇编；不证明运行时加载布局 |
| Linux core dump | `inspect_recorded_crash` | 需要映射候选时 `include_debugger_context` | 自备 pwntools，x86-64 / AArch64 | 历史 PID 不选活动进程；寄存器值是录制瞬间 |
| PE 资源（树/图标） | `inspect_pe_resources` | — | 无 | 资源载荷不透明时只保留文件范围与 SHA-256 |
| DOS / COM / raw / MIPS / PPC / RISC-V / 6502 | `open_binary`（选对应 Ghidra profile） | 同原生 | Ghidra + 对应语言 profile | 每个 profile 有明确的 ABI/格式准入边界，跨边界一律拒绝 |

## 2. 托管产物与语言元数据

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| .NET PE/CLI | `inspect_managed_artifact` | `inspect_managed_members --type X` → `compare_managed_members` | **无（纯静态）** | 不解包 single-file host，不解 IL2CPP；NativeAOT 方法体要走原生分析 |
| NativeAOT PE/ELF | 原生 Ghidra 分析 | 可选 NativeAOT 元数据恢复 | Ghidra（+ 可选 JAR） | 元数据恢复有 host/layout 边界 |
| Go 二进制 | `inspect_go_binary` | — | **无** | 缺元数据 ≠ 不是 Go；未解析文本保持显式 |
| Rust 二进制 | `inspect_rust_binary` | — | **无** | 缺 `.dep-v0` 是 null，不是「没有依赖」；rustc commit 是从路径**推断** |
| Apple bundle / plist / 签名 / 架构 / Swift 符号 | `inspect_macho` / `inspect_plist` / `inspect_signature` / `list_architectures` / `demangle_swift` | `decode_interface_builder`、`inspect_keyed_archive`、`inspect_asset_catalog` | 无 / macOS 增强 | 签名检查不证明运行时完整性 |

## 3. 移动端

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| APK 清单/组件/权限 | `inspect_android_package` | `search_android_classes` / `inspect_android_class` / `inspect_android_method` / `trace_android_references` | 自备 headless JADX + 完整 JDK（方法级） | 静态引用不等于运行时调用 |
| APK 资源（Manifest 解码、字符串表、locale） | `decode_android_resources` | `inspect_apktool_client` 查版本 | 自备 Apktool | 解码结果不带原始语义 |
| Flutter 应用 | `identify_flutter_build` | `inspect_dart_aot` | **无（静态 APK 解析）** | Dart pool 覆盖仍是 partial |
| HarmonyOS HAP/HSP/App Pack | `inspect_artifact` → `project_harmony_application_graph` | — | 无 | 已安装包与真实 HSP/App Pack 覆盖未验证 |
| Android 设备 | `list_adb_devices` → `inspect_adb_device` | `list_adb_packages` / `read_adb_logcat` / `capture_adb_screen` / `pull_adb_package` / `list_adb_processes` | 自备 adb | `install_adb_package` / `push_adb_file` / `start_adb_app` / `uninstall_adb_package` / `stop_adb_app` **会改变设备状态** |

## 4. JavaScript / Electron / Web

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| 已解包 JS / ASAR | `analyze_javascript_application`（大目标先 `detail:"summary"`） | `inspect_analysis_view` 分页 → `trace_application_feature` → `compare_application_versions` | Node + npm；Linux 需 `ps` | AST 投影不是运行时语义；未选中的文件保持 unknown 覆盖 |
| 与运行时的对账 | `observe_javascript_runtime` → `reconcile_javascript_runtime` | `correlate_static_and_runtime` | V8 Inspector 可达 | 覆盖到的脚本不代表全部执行路径 |
| Electron 能否被 Inspector 连上 | `inspect_electron_fuses` | `list_electron_targets` / `inspect_electron_page` / `capture_electron_scenario` | 无（读 fuse 字节）/ 目标在运行 | fuse 关闭 ≠ 无其它启用路径 |
| 网页结构/脚本/网络 | `list_browser_targets` → `inspect_web_page` | `observe_web_execution`、`inspect_web_event_listeners`、`trace_web_source_location`、`trace_web_module_imports`、`capture_web_screenshot` | Chrome 系浏览器 | 被动观测不改目标；截图是时点快照 |
| 需要 Agent 操作网页 | `capture_browser_scenario`（声明 actions） | `compare_web_captures` / `compare_web_screenshots` | 同上 | 只执行声明的 action，不得扩大目标 |
| JS 源码还原 | `recover_javascript_sources` | `export_web_scripts`、`compare_javascript_export_shapes` | 可选 Wakaru | 还原结果是候选，不等于原始工程 |
| 历史源码 vs 打包产物 | `import-reference-source`（CLI）→ `compare_source_to_bundle` | — | 需 Linux/macOS 安全 no-follow open | 映射身份与推断、未知要分开 |

## 5. 归档、固件、抓包、信号

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| ZIP/APK/IPA/MSIX/AppX/DMG/ASAR 清单 | `open_binary` → `inspect_artifact` | `compare_artifacts`、`extract_artifact`、`inventory_artifact` | 无 | 覆盖 `root` vs `container-entries` 不同；FIFO/socket/device 不打开；静态相等 ≠ 运行时相同 |
| 固件 | `inspect_firmware_regions` | `extract_firmware`（需指定**不存在**的输出目录）→ 把产物交给 `open_binary` | Binwalk / Unblob，Linux + prlimit | 解压后偏移不是原文件地址；未提取区域以 `extraction_gaps` 保留 |
| HAR / SAZ / mitmproxy / qlog | `inspect_web_network_capture` | 选定记录序号 / kind 分页 | 原生 mitmproxy 需 mitmdump（Linux） | 不抓活流量；不证明网络完整；qlog 仅支持 aioquic 1.5.0 JSON 0.3 |
| pcap 字段级 | `inspect_packet_fields` 先发现 → `inspect_packet_capture` | `match_offset` / `match_limit` 分页 | TShark 4.x + prlimit（Linux） | 包数限制在过滤**前**计数；不是活抓包 |
| pcap 摘要 | `inspect_pcap_capture` | kind 分页 | tshark + capinfos | 分页取尽 ≠ 网络完整 |
| 逻辑信号 | `inspect_signal_decoders` → `decode_signal_recording` | `line_offset` / `line_limit` 分页 | sigrok-cli 0.7.2 + prlimit | 窗口计数是显示行，不是注解/样本数；不采集硬件 |

## 6. 字节码与数据

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| WASM | `inspect_wasm_artifact`（可 `detail:"summary"`） | `compare_wasm_interfaces` | WABT 1.0.42 | WAT 不是原始源码；不支持签名保持 unknown |
| EVM 字节码 | `inspect_evm_interface`（`raw`/`hex`） | 用 `parent_evidence_id` 取函数页 | 无 | selector/入参/可变性是**推断候选**；不做链上查询、不执行 |
| SQLite | `inspect_sqlite_database` | `--table` + `columns` 取行；`schema_scope:"database"` 取全库结构 | Node 24.15+ / 26+ | 行样本有截断且顺序未定义；活库 + WAL 非原子快照 |

## 7. 运行时行为

| 目标 | 第一工具 | 关键后续 | 前置依赖 | 不能推出 |
| --- | --- | --- | --- | --- |
| 命令行程序行为 | `prepare_bounded_process_capture` / `capture_process_scenario` | `compare_process_captures` | Linux/macOS 原生 PTY | 会执行目标；终端输出是观察，不是退出后的状态 |
| 调试 | `start_gdb_session` → `gdb_console` / `gdb_session_status`；`start_rizin_debug_session` → `rizin_debug_command` | `close_gdb_session` / `close_rizin_debug_session` | 自备 gdb / rizin | `gdb_console` 可执行 shell、改目标状态、访问文件与网络；**极危险** |
| 仪表化 | `list_frida_devices` / `list_frida_processes` → `start_frida_session` → `load_frida_script` → `resume_frida_session` | `frida_session_status` / `unload_frida_script` / `close_frida_session` | Frida 17.x | **执行外来代码且具破坏性，非只读** |
| 任意引擎命令 | `execute_rizin_command` / `cutter_command` | — | Rizin / Cutter 会话 | 会改分析状态或触发插件副作用；共享 MCP 中会关闭活动的二进制会话 |

## 8. 会话与证据（所有路径共用）

| 目的 | 工具 |
| --- | --- |
| 看当前绑定/可用性 | `binary_session`（`{}` 取 `tool_availability`） |
| 切换/显式选引擎 | `open_binary` 的 `provider_id` |
| 复用历史快照 | `open_binary` 的 `snapshot_path`；`close_binary` + `overwrite:true` 保存 |
| 释放 | `close_binary`（只释放自己拥有的资源） |
| 结果太大 | `inspect_analysis_view`（summary/section/page）或 `export_evidence_bundle` |
| 检索历史证据 | `get_evidence_bundle` with `detail:"summary"` + filters |
| 比对 | `compare_functions` / `compare_artifacts` / `compare_bundles` / `find_changed_behavior` |
| 未知管理 | `record_unknown` / `update_unknown` / `list_unknowns` / `verify_unknown_resolution` / `audit_residual_unknowns` |
| 重建完成度 | `build_reconstruction_obligation_ledger` / `evaluate_reconstruction_coverage` / `verify_reconstruction` |
