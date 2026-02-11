# TraceDiary 本地测试执行策略

## 1. 目标

- 在保证关键质量门禁的前提下，缩短本地反馈时间。
- 采用“默认分层、关键场景全量”的执行模型。

## 2. E2E 标签约定

- `@smoke`：核心主链路，适合日常快速回归。
- `@slow`：长耗时或复杂时序场景。
- `@remote`：依赖真实远端（如 Gitee API）的场景。

## 3. 命令选择决策表

| 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 日常开发快速反馈 | `npm run test:e2e:fast` | 仅执行 `@smoke`，优先速度。 |
| 代码已改动，需按变更范围回归 | `npm run test:e2e:changed` | 基于 Git 改动自动筛选。 |
| 修复失败后二次确认 | `npm run test:e2e:last-failed` | 仅回归上次失败集。 |
| 调试长耗时问题 | `npm run test:e2e:slow` | 聚焦 `@slow` 用例。 |
| 验证远端集成稳定性 | `npm run test:e2e:remote` | 聚焦 `@remote` 用例。 |
| 合并主分支前 / 发布前 | `npm run test:e2e:full` | 全量 E2E 门禁。 |

## 4. 本地提速实践

### 4.1 常驻预热服务

终端 A（常驻）：

```bash
npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

终端 B（反复跑测试）：

```bash
npm run test:e2e:fast
```

### 4.2 本地分片并行

终端 A：

```bash
npm run test:e2e:local-shard:1
```

终端 B：

```bash
npm run test:e2e:local-shard:2
```

## 5. 默认测试流水线

建议顺序：

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e:fast
```

若命中全量门禁（主分支合并前、发布前、认证/同步/加解密跨模块高风险改动）：

```bash
npm run test:e2e:full
```

## 6. 记录规范

- `TODO.md` 的 `测试记录` 必须写明：
  - 实际执行命令；
  - 通过/失败摘要；
  - 未执行项及原因；
  - 若有用户授权裁剪，需写明授权依据。
