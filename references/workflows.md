# 典型调查剧本

> **用途**：六类典型调查剧本：从目标到工具序列，再到结论写法。  
> **读者**：Agent（执行调查）  
> **更新**：2026-10-17 · REA 6.5.0

## 目录

- [剧本 A：还原某个功能在原生程序里怎么实现](#剧本-a还原某个功能在原生程序里怎么实现)
- [剧本 B：Electron 应用的功能链路（渲染进程 → 主进程）](#剧本-belectron-应用的功能链路渲染进程-→-主进程)
- [剧本 C：APK 取证（这个 App 做了什么）](#剧本-capk-取证这个-app-做了什么)
- [剧本 D：固件解包 + 找服务](#剧本-d固件解包-+-找服务)
- [剧本 E：从流量还原 API（HAR / SAZ / pcap）](#剧本-e从流量还原-apihar-saz-pcap)
- [剧本 F：版本对比 / 行为漂移](#剧本-f版本对比-行为漂移)
- [收尾清单（每个剧本结束前自检）](#收尾清单每个剧本结束前自检)

## 剧本 A：还原某个功能在原生程序里怎么实现

**场景**：用户说「这个 exe 的音量/拖拽/存档逻辑是怎么算的，我想在我项目里做一样的」。

```
1. open_binary(path, provider_id?)            → 记下 subject.sha256 与绑定 provider
2. binary_overview（若 provider 提供）          → 架构、入口、区段、函数规模
3. search_procedures("pan"|"volume"|关键词)     → 或用 list_procedures 分页看命名
4. analyze_function(name_or_address)          → dossier：伪代码/汇编/callers/callees/strings/CFG
   注意 facet_availability：不可用的分面不能当空集
5. 需要上下文时 trace_call_path(entry, goal)    → residual_unknowns 与 truncated 要如实记录
6. read_function_instructions / inspect_native_instruction  → 关键指令的证据级确认
7. 用 compare_functions(原始, 重建)             → 分维度对比，unknown 不等于相等
8. close_binary(snapshot_path?)               → 需要复用时保存快照
```

**要看什么**
- 参数宽度与符号性（`movsx`/`movzx` 提示有符号/无符号扩展）
- 常量是否被编译器折叠成查表
- 浮点：x87 / SSE / soft-float（MIPS 软浮点会走整数寄存器）——ABI 不同结论不同
- 内联：伪代码里没有 `call` 不代表原始源码没有函数调用

**结论写法**
> 观察：`0x4012a0` 处的 `analyze_function`（Evidence `ev_…`）显示以 `(x - 640)/2` 计算声像偏移，Ghidra x86-64 profile。
> 推断：原始实现可能是 `pan = (x - width/2) / 2`，因为无法排除内联与常量传播。
> 未知：未观察任何运行时调用，无法确认调用频率与边界值行为。

**验证重建**：`build_reconstruction_obligation_ledger` → `evaluate_reconstruction_coverage` → `verify_reconstruction`，
并用原程序的输入输出用例对拍（数量写清楚，例如「3,205 个 x 值」）。

---

## 剧本 B：Electron 应用的功能链路（渲染进程 → 主进程）

**场景**：用户说「Notion 的剪贴板为什么能粘富文本，我想在我 Electron 应用里做」。

```
1. analyze_javascript_application(<解包目录或 asar>, detail:"summary")
2. inspect_analysis_view(parent_evidence_id, kind:"page", collection:"modules")   → 分页看模块
3. trace_application_feature(seed_module_node_id, 方向)                          → 只沿需要的边扩展
4. 找到 renderer 侧 API → preload → ipcMain 的通道名
5. 需要确认主进程实现时：inspect_electron_fuses → list_electron_targets → inspect_electron_page
6. 需要确认实际数据形状：capture_electron_scenario 或 observe_web_execution
7. compare_application_versions(旧目录, 新目录)  → 版本漂移
```

**要看什么**
- `contextBridge.exposeInMainWorld` 暴露了什么（这是安全边界）
- IPC 通道名与 `invoke` / `send` 的对应关系
- preload 是否被 sandbox 限制
- 富文本格式来自主进程还是渲染进程（决定你复刻时放哪一层）

**坑**
- 大应用 Evidence 可能几百 MB：先 `summary`，再按 `node_id` 取模块，不要一次拉全图。
- 双向 trace 会把无关的 containment 关系也展开 —— 用方向参数收窄。
- 同一个文件路径可能对应多个图角色，必须用返回的 `node_id` 选择。

---

## 剧本 C：APK 取证（这个 App 做了什么）

```
1. inspect_artifact(apk)                     → 清单/签名/资源清单（零引擎）
2. inspect_android_package(apk)              → manifest 组件、权限、类清单
3. search_android_classes("Http"|"Crypto")   → 定位关注点
4. inspect_android_method(class, method)     → 反编译方法体
5. trace_android_references(method)          → 谁调它（静态引用，不是运行时调用）
6. decode_android_resources(apk)             → 字符串表/locale/版本事实
7. identify_flutter_build(apk)               → 如果是 Flutter，改走 inspect_dart_aot
```

**结论边界**：静态引用 ≠ 运行时调用；没有 JADX 时方法级不可用，只能说「清单层面观察到 X」。

---

## 剧本 D：固件解包 + 找服务

```
1. inspect_firmware_regions(firmware)        → 区域与识别结果（不改文件）
2. extract_firmware(firmware, out_dir)       → out_dir 必须不存在；读 extraction_gaps
3. 从返回的原生文件里选一个 → open_binary     → 交给 Ghidra
4. search_strings("httpd"|"telnetd") → xrefs  → 定位服务入口
5. 需要时 trace_call_path 从 handler 到 dispatch
```

**必写限制**：解压偏移 ≠ 原文件地址；某些区域可能因缺提取器而未解（`extraction_gaps` 有清单）；未执行任何固件代码。

---

## 剧本 E：从流量还原 API（HAR / SAZ / pcap）

```
1. inspect_web_network_capture(file, format:"har"|"saz")   → 记录数、时间范围、来源 digest
2. 按 kind 分页看 host / path 模板 / 状态码分布
3. inspect_packet_capture（原生抓包）先 inspect_packet_fields 发现字段
4. 需要具体请求体：按记录序号选原记录序号（original record ordinals）
5. 汇总成 API 面：method + origin + path 模板 + 观察到的参数名
```

**必写限制**：查询值/header/body 被有意排除；推断出的 API 面不是完整接口；不证明网络完整性。

---

## 剧本 F：版本对比 / 行为漂移

| 比什么 | 怎么比 | 注意 |
| --- | --- | --- |
| 单个函数 | `analyze_function` ×2 → `compare_functions` | 任一侧分面 unavailable → 该维度 unknown |
| 归档/安装包 | `inspect_artifact` ×2 → `compare_artifacts` | 必须 `coverage.scope` 一致（root vs container-entries） |
| JS 应用 | `compare_application_versions` | 静态差异不推出运行时行为 |
| 静态 vs 运行时 | `correlate_static_and_runtime` / `reconcile_javascript_runtime` | 覆盖到的脚本 ≠ 全部执行路径 |
| 进程行为 | `capture_process_scenario` ×2 → `compare_process_captures` | 会执行目标；输出是观察 |
| 历史源码 vs 打包产物 | `import-reference-source` → `compare_source_to_bundle` | 需 Linux/macOS；Git HEAD 与工作树是否一致仍未知 |
| 找行为变化 | `find_changed_behavior` | 需要两侧 Evidence |

结论模板：
> 静态对比显示 `report()` 增加了 2 个分支（Evidence A/B），产物 SHA-256 不同。
> **未**观察到运行时行为差异；静态相等也不能推出运行时不变。

---

## 收尾清单（每个剧本结束前自检）

- [ ] 每条结论都挂了 Evidence ID？
- [ ] 观察 / 推断 / 未知 分开写了？
- [ ] 覆盖范围与限制（`limitations`、`coverage`、`facet_availability`）转述了？
- [ ] 未验证的平台/版本组合明确标注了？
- [ ] 自己开的会话都关了（`close_binary` / `close_*_session`）？
- [ ] 有未解决问题时写进 `record_unknown`，而不是含糊带过？
