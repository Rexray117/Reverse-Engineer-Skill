# 参考文档索引

> **用途**：9 份参考的导航——什么时候该读哪一份。  
> **读者**：Agent（按需加载）/ 维护者（更新时对齐）  
> **更新**：2026-10-17 · REA 6.5.0

## 阅读路径

```
第一次用这条技能
  └─ SKILL.md（硬规则 + 路由表 + 调用方式）
       ├─ 环境没配好？ → environment-setup.md → engine-sources.md
       └─ 开始调查    → routing-matrix.md → workflows.md
                            └─ 写结论前 → evidence-discipline.md
排障
  └─ known-issues.md → provider-playbooks.md → architecture.md
```

## 文件清单

| 文件 | 用途 | 什么时候读 | 体量 |
| --- | --- | --- | --- |
| `routing-matrix.md` | 24 类目标 × 首工具 × 前置依赖 × **不能推出什么** | 每次拿到新目标时 | 中 |
| `tool-inventory.md` | 207 个 MCP 工具 + 153 个 CLI 命令的分域清单 | 需要具体工具名时 | 大 |
| `evidence-discipline.md` | Evidence 四态、空≠不存在、预算分页、比对、未知账本 | **写结论之前** | 中 |
| `environment-setup.md` | 安装形态、环境变量全表、平台矩阵、故障定位树 | 配置环境 / 排障 | 大 |
| `engine-sources.md` | 引擎官方下载来源、版本锚点、安装顺序 | 准备环境 / 确认版本 | 中 |
| `provider-playbooks.md` | 逐引擎配置 + 能力 + 坑 + 危险操作清单 | 接某个引擎时 | 大 |
| `workflows.md` | 六类调查剧本（算法还原 / Electron / APK / 固件 / 流量 / diff） | 执行调查时 | 中 |
| `architecture.md` | 分层、会话模型、资源所有权、二次开发入口 | 维护 / 深度排障 | 中 |
| `known-issues.md` | 已修缺陷、环境缺失、设计限制、验证矩阵 | 判断「为什么不可用」 | 中 |

## 脚本

| 脚本 | 作用 | 典型用法 |
| --- | --- | --- |
| `scripts/check-env.mjs` | 只读体检：安装 / 可达性（NO-ENV）/ 版本对齐 / 双通道能力判定 | `node scripts/check-env.mjs --deep` |
| `scripts/apply-env.mjs` | 探测已装引擎 → 打印 / 写入用户环境变量 / 输出 MCP env | `node scripts/apply-env.mjs --apply` |
| `scripts/rea.mjs` | 统一调用 REA（自动挑运行时与入口，透传参数与退出码） | `node scripts/rea.mjs doctor --json` |
| `scripts/list-tools.mjs` | 从真实服务器 `tools/list` 枚举工具 | `node scripts/list-tools.mjs --grep android` |
| `scripts/register-mcp.mjs` | 幂等注册 MCP 条目（备份 + 原子写 + fail-closed） | `node scripts/register-mcp.mjs --auto-env` |
| `scripts/verify-package.mjs` | 校验技能包自身：名称、引用、版本锚点、清单一致性（不一致退出 1） | `node scripts/verify-package.mjs "<技能目录>"` |
| `scripts/lib/node-runtime.mjs` | 运行时选择（REA_NODE → 已装最高版 → 当前进程） | 被上面脚本复用 |

## 约定

- **每条结论都要能追到 Evidence ID**；文档里的「不能推出」列优先于任何直觉。
- 文档中的路径都是**显式绝对路径**或 `{SKILL_DIR}` 占位符，不含含糊的"某目录"。
- 版本锚点写在正文里（REA 6.5.0 / Ghidra 12.1.x / Unblob 26.6.x …），升级后请同步 `known-issues.md` 的验证矩阵。
