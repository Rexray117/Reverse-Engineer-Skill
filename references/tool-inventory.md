# 工具清单

> **用途**：REA 6.5.0 的全部 207 个 MCP 工具与 155 个 CLI 命令的分域清单。  
> **读者**：Agent（找工具名）/ 维护者（对齐版本）  
> **更新**：2026-10-17 · REA 6.5.0 · 技能 v1.2.0
>
> **计数口径**：分节数字 = 本节列出的工具数。§9 / §12 / §14 含交叉索引（同一工具在两处出现），
> 因此分节之和（210）**大于** 207；去重后的权威总数由 SKILL.md frontmatter 的 tool_count 字段
> 与 list-tools 的 --count 输出断言，不靠人工加总。

## 目录

- [0. 必记的 12 个](#0-必记的-12-个)
- [1. 会话与生命周期（4）](#1-会话与生命周期4)
- [2. 原生分析（64）](#2-原生分析64)
- [3. Android 包分析（7）](#3-android-包分析7)
- [4. Android 设备 / ADB（24）](#4-android-设备-adb24)
- [5. .NET 托管程序集（7）](#5-net-托管程序集7)
- [6. JavaScript 应用（12）](#6-javascript-应用12)
- [7. Web / 浏览器（14）](#7-web-浏览器14)
- [8. Electron（4）](#8-electron4)
- [9. 调试、命令与会话（20）](#9-调试命令与会话20)
- [10. 进程行为（2）](#10-进程行为2)
- [11. 工件 / Apple / Flutter / JEB / 固件（19）](#11-工件-apple-flutter-jeb-固件19)
- [12. 字节码与离线数据（10）](#12-字节码与离线数据10)
- [13. 数据包与信号（6）](#13-数据包与信号6)
- [14. 证据 / 比对 / 未知账本（17）](#14-证据-比对-未知账本17)

## 0. 必记的 12 个

| 工具 | 一句话 |
| --- | --- |
| `open_binary` | 绑定目标到某个深度引擎；后续所有原生分析都基于它 |
| `binary_session` | 看当前绑定、provider、**工具可用性与不可用原因** |
| `analyze_function` | 函数 dossier：伪代码/汇编/调用者/被调/引用/字符串/CFG + 逐分面可用性 |
| `procedure_pseudo_code` | 只要伪代码 |
| `read_function_instructions` | 只要汇编 |
| `search_procedures` / `search_strings` | 按名字找函数 / 找字符串 |
| `trace_call_path` | 有界静态调用路径追踪（结果里的 residual_unknowns 字段记录未解部分） |
| `inspect_analysis_view` | 分页读保留证据（summary / section / module / page）——结果过大时的第一反应 |
| `export_evidence_bundle` | 把整个会话证据流式落盘 |
| `compare_functions` | 函数级对比（分维度，unknown ≠ 相等） |
| `close_binary` | 释放会话，可顺带保存快照 |

## 1. 会话与生命周期（4）

`open_binary` `close_binary` `binary_session` `open_jeb_project`

## 2. 原生分析（64）

**入口与总览**
`binary_overview` `binary_session` `list_procedures` `list_segments` `list_names` `list_strings` `list_documents` `list_bookmarks` `current_document`

**函数与指令**
`analyze_function` `batch_decompile` `procedure_pseudo_code` `procedure_assembly` `read_function_instructions`
`procedure_info` `procedure_address` `procedure_callers` `procedure_callees` `procedure_references`
`inspect_native_instruction` `inspect_native_data_type` `inspect_native_api` `inspect_native_dispatch_metadata`
`inspect_native_load_image` `resolve_native_call_targets` `annotate_native_function`

**搜索与引用**
`search_procedures` `search_strings` `search_bytes` `read_bytes` `xrefs` `find_xrefs_to_name`
`resolve_containing_procedure` `address_to_file_offset` `address_name`

**导航与标注（引擎侧改动）**
`goto_address` `next_address` `prev_address` `current_address` `current_procedure`
`set_address_name` `set_addresses_names` `set_comment` `comment` `set_inline_comment` `inline_comment`
`set_bookmark` `unset_bookmark` `get_navigation_context` `inspect_address_context`

**调用图与追踪**
`get_call_graph` `trace_call_path` `build_call_path` `trace_feature` `trace_native_values` `trace_dylib_resolution`

**语言/平台专用**
`get_objc_classes` `get_objc_protocols` `analyze_swift_types` `demangle_swift`
`observe_native_ui` `capture_native_ui_scenario` `trace_native_ui_action` `observe_native_calls`
（GDB/Rizin/Cutter 的 10 个 session 工具列在 §9，本节不重复列出）

## 3. Android 包分析（7）

`inspect_android_package` `search_android_classes` `inspect_android_class` `inspect_android_method`
`trace_android_references` `decode_android_resources` `project_android_application_graph`

## 4. Android 设备 / ADB（24）

**只读**：`inspect_adb_client` `list_adb_devices` `inspect_adb_device` `list_adb_packages` `list_adb_processes`
`list_adb_features` `list_adb_services` `list_adb_directory` `inspect_adb_package` `inspect_adb_display`
`inspect_adb_window` `read_adb_logcat` `read_adb_setting` `collect_adb_bugreport` `capture_adb_screen`
`pull_adb_file` `pull_adb_package` `resolve_adb_packages`

**改变设备状态**：`install_adb_package` `uninstall_adb_package` `push_adb_file` `start_adb_app`
`start_adb_activity` `stop_adb_app`

## 5. .NET 托管程序集（7）

`inspect_managed_artifact` `inspect_managed_members` `inspect_managed_native_boundaries`
`compare_managed_members` `verify_managed_native_boundaries` `import_managed_reconstruction`
`project_managed_application_graph`

## 6. JavaScript 应用（12）

`analyze_javascript_application` `analyze_web_bundle` `trace_application_feature` `trace_javascript_semantics`
`compare_application_versions` `compare_source_to_bundle` `compare_javascript_export_shapes`
`recover_javascript_sources` `observe_javascript_runtime` `reconcile_javascript_runtime`
`correlate_static_and_runtime` `list_javascript_runtime_targets`

## 7. Web / 浏览器（14）

`list_browser_targets` `inspect_web_page` `inspect_web_event_listeners` `capture_browser_scenario`
`observe_web_execution` `observe_web_session` `trace_web_module_imports` `trace_web_source_location`
`export_web_scripts` `capture_web_screenshot` `compare_web_captures` `compare_web_screenshots`
`discover_webmcp_tools` `inspect_web_network_capture`

## 8. Electron（4）

`list_electron_targets` `inspect_electron_page` `inspect_electron_fuses` `capture_electron_scenario`

## 9. 调试、命令与会话（20）

| 组 | 工具 |
| --- | --- |
| GDB | `start_gdb_session` `gdb_console` `gdb_session_status` `close_gdb_session` |
| Rizin 调试 | `start_rizin_debug_session` `rizin_debug_command` `rizin_debug_session_status` `close_rizin_debug_session` |
| Rizin 静态 | `execute_rizin_command` |
| Cutter | `list_cutter_sessions` `cutter_command` |
| Frida | `list_frida_devices` `list_frida_processes` `start_frida_session` `load_frida_script` `resume_frida_session` `unload_frida_script` `frida_session_status` `close_frida_session` `instrument_with_frida` |

## 10. 进程行为（2）

`capture_process_scenario`（执行一次有界进程抓取）`compare_process_captures`（对比两次抓取）

## 11. 工件 / Apple / Flutter / JEB / 固件（19）

**工件**：`inspect_artifact` `extract_artifact` `inspect_asset_catalog` `inspect_keyed_archive`
**Apple**：`inspect_macho` `inspect_plist` `inspect_signature` `list_architectures` `decode_interface_builder` `project_apple_application_graph`
**Flutter / Harmony**：`identify_flutter_build` `inspect_dart_aot` `project_harmony_application_graph`
**JEB**：`inspect_jeb_client` `list_jeb_units` `decompile_jeb_item`
**Apktool**：`inspect_apktool_client`
**固件**：`inspect_firmware_regions` `extract_firmware`

## 12. 字节码与离线数据（10）

`inspect_binary_layout` `inspect_recorded_crash` `inspect_go_binary` `inspect_rust_binary`
`inspect_pe_resources` `inspect_wasm_artifact` `compare_wasm_interfaces` `inspect_evm_interface`
`inspect_sqlite_database` `inspect_with_objdump`

## 13. 数据包与信号（6）

`inspect_packet_fields` `inspect_packet_capture` `inspect_pcap_capture` `inspect_pcap_client`
`inspect_signal_decoders` `decode_signal_recording`

## 14. 证据 / 比对 / 未知账本（17）

**证据存取**：`get_evidence_bundle` `import_evidence_bundle` `export_evidence_bundle` `inspect_analysis_view`
**比对**：`compare_functions` `compare_artifacts` `compare_bundles` `compare_process_captures`
`compare_wasm_interfaces` `find_changed_behavior`
**未知账本**：`record_unknown` `update_unknown` `list_unknowns` `verify_unknown_resolution`
**重建账本**：`build_reconstruction_obligation_ledger` `evaluate_reconstruction_coverage` `verify_reconstruction`

---

# CLI 命令（155 个）

权威清单：`rea --help`、`rea <cmd> --help`。命令名与 MCP 工具**不是一一对应**，例如：

| CLI | 对应 MCP 操作 |
| --- | --- |
| `rea analyze` / `rea inspect` | `binary_overview` |
| `rea function` | `analyze_function` |
| `rea decompile` | `procedure_pseudo_code` |
| `rea instructions` | `read_function_instructions` |
| `rea search` | `search_strings` + `search_procedures` |
| `rea trace` | `trace_feature` |
| `rea capture-process` | `capture_process_scenario` |
| `rea compare-bundles`（别名） | `compare_bundles` |

**分组速览**

| 组 | 代表命令 |
| --- | --- |
| 安装与诊断 | `setup` `doctor` `uninstall` `update` `providers` `capabilities` |
| 通用分析 | `analyze` `inspect` `function` `decompile` `instructions` `xrefs` `trace` `search` |
| 字节与地址 | `read-bytes` `search-bytes` `address-to-file-offset` `inspect-native-instruction` `resolve-native-call-targets` |
| 原生扩展 | `annotate-native-function` `inspect-native-api` `inspect-native-data-type` `inspect-native-load-image` `inspect-native-dispatch-metadata` `trace-native-values` `trace-dylib-resolution` `trace-native-ui-action` `observe-native-ui` `observe-native-calls` `capture-native-ui-scenario` `demangle-swift` `inspect-macho` `inspect-signature` `inspect-plist` `list-architectures` `inspect-asset-catalog` `decode-interface-builder` `inspect-keyed-archive` |
| 工件与固件 | `inspect-artifact` `extract-artifact` `inspect-firmware-regions` `extract-firmware` |
| JS / Web | `analyze-javascript-application` `analyze-web-bundle` `trace-application-feature` `trace-javascript-semantics` `compare-application-versions` `compare-source-to-bundle` `compare-javascript-export-shapes` `recover-javascript-sources` `observe-javascript-runtime` `reconcile-javascript-runtime` `list-browser-targets` `inspect-web-page` `capture-browser-scenario` `observe-web-execution` `observe-web-session` `export-web-scripts` `capture-web-screenshot` `compare-web-captures` `compare-web-screenshots` `inspect-web-network-capture` `inspect-web-event-listeners` `trace-web-module-imports` `trace-web-source-location` `discover-webmcp-tools` `inspect-electron-page` `inspect-electron-fuses` `capture-electron-scenario` `list-electron-targets` `list-javascript-runtime-targets` |
| .NET / Android / Flutter | `inspect-managed-artifact` `inspect-managed-members` `inspect-managed-native-boundaries` `compare-managed-members` `verify-managed-native-boundaries` `import-managed-reconstruction` `project-managed-application-graph` `inspect-android-package` `search-android-classes` `inspect-android-class` `inspect-android-method` `trace-android-references` `decode-android-resources` `identify-flutter-build` `inspect-dart-aot` `inspect-apktool-client` `inspect-jeb-client` `open-jeb-project` `list-jeb-units` `decompile-jeb-item` |
| ADB | `inspect-adb-client` `list-adb-devices` `inspect-adb-device` `list-adb-packages` `list-adb-processes` `list-adb-directory` `list-adb-features` `list-adb-services` `inspect-adb-package` `inspect-adb-display` `inspect-adb-window` `read-adb-logcat` `read-adb-setting` `collect-adb-bugreport` `capture-adb-screen` `pull-adb-file` `pull-adb-package` `resolve-adb-packages` `install-adb-package` `uninstall-adb-package` `push-adb-file` `start-adb-app` `start-adb-activity` `stop-adb-app` |
| 离线格式 | `inspect-go-binary` `inspect-rust-binary` `inspect-pe-resources` `inspect-binary-layout` `inspect-recorded-crash` `inspect-wasm-artifact` `compare-wasm-interfaces` `inspect-evm-interface` `inspect-sqlite-database` `inspect-with-objdump` `list-objdump-architectures` |
| 抓包与信号 | `inspect-packet-fields` `inspect-packet-capture` `inspect-pcap-capture` `inspect-pcap-client` `inspect-signal-decoders` `decode-signal-recording` |
| 调试与命令 | `execute-rizin-command` `list-cutter-sessions` `cutter-command` `debug-with-gdb` `debug-with-rizin` `instrument-with-frida` `list-frida-devices` `list-frida-processes` |
| 进程 | `capture-process` `compare-process-captures` |
| 证据 | `evidence-import` `evidence-export` `compare` `inspect-analysis-view` `inspect-evidence-bundle` `import-reference-source` |
| 重建与图 | `build-reconstruction-obligation-ledger` `evaluate-reconstruction-coverage` `project-android-application-graph` `project-apple-application-graph` `project-harmony-application-graph` |

**MCP 有、CLI 没有独享入口的工具**：引擎侧导航与标注（`goto_address`、`set_comment`、`list_names` 等）、
会话管理（`open_binary`/`close_binary`/`binary_session`）、证据账本（`record_unknown` 等）。
它们通过 `rea analyze --snapshot` 等间接使用，或只在 MCP 会话里有意义。
