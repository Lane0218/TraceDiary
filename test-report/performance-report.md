# TD-TEST-005 性能验收报告

## 执行命令

```bash
npm run lint
npm run test:unit
npm run test:integration
npx playwright test e2e/specs/performance-acceptance.spec.ts --project=chromium --retries=0
```

## SPEC 阈值与实测结果

| 指标 | SPEC 阈值 | 实测值 | 是否通过 |
| --- | ---: | ---: | --- |
| 首次加载时间（firstLoadMs） | ≤ 3000ms | 501ms | 通过 |
| 切换日期响应（dateSwitchMs） | ≤ 200ms | 4.9ms | 通过 |
| 往年今日查询（onThisDayQueryMs） | ≤ 1000ms | 9.4ms | 通过 |
| 编辑器输入延迟 P95（inputLatencyP95Ms） | ≤ 50ms | 12.96ms | 通过 |

补充观测（非门禁阈值项）：

- 输入延迟平均值（inputLatencyAvgMs）：8.34ms
- 输入延迟最大值（inputLatencyMaxMs）：12.96ms
- 100 文件导入耗时（`src/services/__tests__/import.performance.test.ts`）：1ms（阈值 ≤ 3000ms）

## 结论

- 本次 TD-TEST-005 性能验收四项门禁指标全部通过（`firstLoad=true`、`dateSwitch=true`、`onThisDayQuery=true`、`inputLatency=true`）。
- 实测结果显著优于 SPEC 阈值，可判定该项验收通过。
