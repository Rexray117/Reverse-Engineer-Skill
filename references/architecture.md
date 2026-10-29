# 内部架构（供排障与二次开发）

> **用途**：内部分层、会话模型、资源所有权、生成物归属与二次开发入口。  
> **读者**：维护者 / 深度排障  
> **更新**：2026-10-17 · REA 6.5.0

## 目录

- [1. 分层](#1-分层)
- [2. 双入口](#2-双入口)
- [3. 会话模型（最需要理解的三个对象）](#3-会话模型最需要理解的三个对象)
- [4. Evidence 与语义身份](#4-evidence-与语义身份)
- [5. 资源所有权（可靠性地基）](#5-资源所有权可靠性地基)
- [6. 桥接（bridge/）](#6-桥接bridge)
- [7. 生成物所有权](#7-生成物所有权)
- [8. 测试与 CI（为什么它敢声称「验证过」）](#8-测试与-ci为什么它敢声称「验证过」)
- [9. 想改什么，先看哪里](#9-想改什么先看哪里)
- [10. 值得借鉴的设计取向](#10-值得借鉴的设计取向)

## 1. 分层

```
domain/        纯函数、无副作用：Evidence、canonical digest、binary target、
               analysis profile/snapshot、错误代数(Result)、artifact graph、call path
contracts/     对外 Zod schema（约 40 个模块聚合为全部工具契约）+ errorSchemas
<provider>/    各引擎适配器（hopper/ ghidra/ ida/ jeb/ objdump/ rizin/ gdb/ frida/
               dotnet/ go/ rust/ wasm/ evm/ sqlite/ android/ apktool/ adb/ firmware/
               pcap/ signals/ browser/ inspector/ flutter/ harmony/ …）
process/       提供者进程基础设施：进程组与 run-token 归属、私有运行时目录、
               deadline、有界读取、清理、诊断脱敏；windows/ 为 Windows 边界
application/   共享工作流（CLI 与 MCP 都调用）：binary session、snapshot 缓存、
               investigation records、javascript 重建、各能力 service
composition/   组合根：每次调用新建有类型的 provider + session 工厂；可选 provider 惰性加载
server/        MCP 适配：createServer、register*Tools、toolResult 交付
cli/ + main/   一次性 CLI（153 命令）/ 长驻 MCP stdio（配置、会话、生命周期）
```

**依赖只能向内流动**。`scripts/verify/architecture-guards.mjs` 与 `verify-module-boundaries.mjs` 在 CI 强制。

## 2. 双入口

```
scripts/rea.mjs
├─ args == "mcp" | "--mcp"  → dist/mcp/main.js        （长驻，会话有状态）
└─ 其它                     → dist/cli-runtime/cli.js （一次性，每次独立进程）
```

`main.ts` 启动链：`snapshotEnvironment` → `parseConfig`（Zod）→ `createBinarySession` →
`openInitialTarget` → `startMcpTransport` → `createShutdown`（SIGINT/SIGTERM/stdin end 幂等）。
入口异常只输出固定文案 `SERVER_START_FAILED`，不泄漏内部细节。

## 3. 会话模型（最需要理解的三个对象）

| 对象 | 职责 |
| --- | --- |
| `BinarySession` | 进程生命周期内唯一；一个目标一个**不可变**深度绑定 |
| `SessionProviderRouter` | 深绑定与辅助能力**不相交**路由，可并行 |
| `AnalysisProviderRegistry` | 候选排序 + 确定性选择；多候选必须显式，**无静默回退** |

`AnalysisSnapshotCache` 精确命中条件：目标字节 + 操作 + 参数 + provider + settings。
变更类与游标类调用不入缓存；元数据写操作**即使失败**也使缓存失效（provider 可能已应用）。

## 4. Evidence 与语义身份

`analysis_profile` 参与语义身份：profile 变了，旧结果不能当新结果用。
`subject.digest.sha256` 定义「同一个目标」；换一个字节就是另一个 subject。
`coverage.scope`（root / container-entries）与 `coverage.status`（complete / unknown）独立。

## 5. 资源所有权（可靠性地基）

核心主张：**PID + 可执行路径不足以证明退出后的归属**。

| 原语 | 作用 |
| --- | --- |
| `ProcessOwnership` + `REA_PROCESS_RUN_ID` | 每个受管进程组带随机 run token；清理时**每个存活成员都要 token 证明**才允许发信号 |
| `ProcessOwnershipProcessTree` | 扫进程表找同 token 后代；「观察到」≠「有权限处理」 |
| `PrivateRuntimeRoot` | 私有运行时目录（Ghidra 项目、缓存、home） |
| `ProviderDeadline` | 统一截止时间 |
| `ExecFileBoundedOutput` / `BoundedFileBytes` | 有界输出与读取 |
| `ProviderDiagnosticRedaction` | 只脱传输凭据与显式标记，不猜 |

Windows 侧由 C++ Node-API 扩展（`native/windows/src/`）提供 NTFS 准入、受保护 DACL、
原子 Job Object 归属 —— 这是 Windows Ghidra 能用回环 TCP 的前提。

## 6. 桥接（bridge/）

| 引擎 | 文件 | 语言 | 通信 |
| --- | --- | --- | --- |
| Hopper | `hopper_bridge.py` | Python | POSIX Unix socket + 每会话随机能力令牌 |
| Ghidra | `ghidra/ReaGhidraBridge.java` + 8 个辅助类 | Java（HeadlessScript） | POSIX socket；Windows 认证回环 TCP |
| IDA | 复用 `mrexodia/ida-pro-mcp` | — | legacy 附着 GUI / modern headless 私有库 |
| Cutter | `cutter/rea_bridge.py` | Python | 会话制 |
| Android | `android/ReaJadxBridge.java` | Java | 无头 JADX |
| macOS | `native/ReaNativeUI.swift`、`rea_lldb_tracer.py` | Swift/Python | LLDB |
| 离线 | `pwntools/*.py`、`pwndbg/*.py` | Python | 子进程 |
| 抓包 | `mitmproxy/capture.py` | Python | mitmproxy |

原则：**桥接只做适配，不重写上游 parser**（上游 ABI 结构与 mapping API 保持不变，便于对照）。

## 7. 生成物所有权

| 生成物 | 来源 | 提交 |
| --- | --- | --- |
| `skills/**` | `.agents/skills/reverse-engineer-anything/**` | 否 |
| `.cache/mcp-tool-catalog.json` | `scripts/generate-mcp-tool-catalog.mjs` | 否 |
| `docs/public/product-catalog.json` | `scripts/generate-product-catalog.mjs` | 否 |
| `docs/verification/managed-conformance-*.json` | `scripts/generate-completion-ledger.mjs` | 否 |
| `docs/error-contract.schema.json` | `scripts/generate-error-schema.mjs` | 是（需 `--check`） |
| `src/generatedPackageMetadata.ts` | `scripts/generate-package-metadata.mjs` | 是 |

改能力 = 先改 `src/contracts/**` 与 `.agents/skills/**`，再重新生成。**不要手改生成物。**

## 8. 测试与 CI（为什么它敢声称「验证过」）

- 12 个 vitest project：`domain` `services` `adapters` `composition` `conformance` `evaluation`
  `boundary` `cli-boundary` `process-boundary` `mcp-boundary` `acceptance` `process-global`
- 变异测试（Stryker，含独立语义配置）、`jscpd` 重复检测、`knip` 死代码、`oxlint`/`oxfmt`
- 26 条 CI workflow，其中 `real-*` 是**真实引擎 lane**（hopper/ghidra-windows/cutter/browser/
  web-runtime/web-source-map/web-network-captures/javascript-recovery/packet-capture/
  signal-recording/recorded-crash/binary-layout/go-binary/evm-interface/termux…）
- CHANGELOG 每条都声明「录制覆盖到哪个平台/版本，哪里未验证」——**模拟 provider 不能证明真实 provider 行为**

## 9. 想改什么，先看哪里

| 目标 | 起点 |
| --- | --- |
| 新增 MCP 工具 | `src/contracts/<域>/*ToolContracts.ts` → `toolContracts.ts` 聚合 → `src/server/register<域>Tools.ts` → `src/application/<域>/*Service.ts` → `src/composition/<域>.ts` |
| 新增深度引擎 | 参考 `src/hopper/`（BridgeLauncher + Client + protocol）、`src/ghidra/`；在 `AnalysisProviderRegistry` 注册；写 `*ProviderCapabilities` |
| 改 Evidence 结构 | `src/domain/evidence.ts` + `analysisProfile.ts`（等于改语义身份，需同步 snapshot 兼容） |
| 改错误语义 | `src/domain/analysisError*.ts` + `src/contracts/errorSchemas.ts` → `npm run docs:error-schema` |
| 改进程清理 | `src/process/ProcessOwnership*.ts`、`PrivateRuntimeRoot.ts`、`ProviderDeadline.ts` |
| 改响应预算/分页 | `src/config/mcpResponseBudget.ts`、`src/server/toolResult.ts`、`src/application/analysisView/` |
| 改 Agent 指令 | `.agents/skills/reverse-engineer-anything/SKILL.md` + `references/*` → `npm run artifacts:skills` |

## 10. 值得借鉴的设计取向

1. **Evidence 是一等类型**：可信度编码进数据结构，而不是写在散文里。
2. **空 ≠ 不存在**：`available:false + reason` 与「观察到空集」严格区分。
3. **确定性选择、禁止静默回退**：回退会制造「看起来成功」的假象。
4. **所有权与有效性解耦**：能证明「这是我的」和能证明「它有效」是两件事。
5. **在 owning boundary 归一化一次**：不在下游反复修补表征。
6. **fail-closed 集成规则**：scope/authority/side-effect/verification 任一未澄清就不合入。
7. **性能优化次序写死**：① Agent token/上下文 ② 分析时间 ③ CPU/内存；并且要求实测，不接受「字节变少 = token 变少」。
