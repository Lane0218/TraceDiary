# TD-TEST-006 兼容性验收报告

- 执行时间：2026-02-17T23:03:13+08:00
- 验收范围：Chrome / Edge / Safari / Firefox / 安卓 / iOS
- 验收用例：`@smoke`（5 条）
- 用户授权：Safari 与 iOS 两端在本次任务中跳过，不纳入门禁。
- 总结果：`20 passed / 0 failed / 10 skipped`（按用户授权口径）

## 验收环境

| 项目 | 值 |
| --- | --- |
| OS | `Linux 5.15.167.4-microsoft-standard-WSL2 x86_64` |
| Node.js | `v22.19.0` |
| npm | `10.9.3` |
| Playwright | `1.58.2` |
| 已安装浏览器内核 | `chromium-1208` / `firefox-1509` / `webkit-2248` |
| 移动端模拟 | `Pixel 7`（Android）/ `iPhone 14`（iOS） |

## 可复现执行命令

```bash
# 1) 环境信息
node -v
npm -v
npx playwright --version
uname -a

# 2) 安装验收所需浏览器内核
npx playwright install firefox webkit

# 3) 执行兼容性验收（6 目标端）
npx playwright test --config=scripts/compatibility-check.mjs --grep @smoke --workers=1 --retries=0 --reporter=line
```

## 验收项目映射（Playwright）

| 验收目标 | Project 名称 | 引擎/设备 |
| --- | --- | --- |
| Chrome | `chrome-desktop` | `Desktop Chrome` 设备描述（Chromium） |
| Edge | `edge-desktop` | `Desktop Edge` 设备描述（Chromium） |
| Safari | `safari-desktop` | `Desktop Safari`（WebKit） |
| Firefox | `firefox-desktop` | `Desktop Firefox`（Firefox） |
| 安卓 | `android-pixel-7` | `Pixel 7`（Chromium 模拟） |
| iOS | `ios-iphone-14` | `iPhone 14`（WebKit 模拟） |

## 分项验收结果

| 验收目标 | 是否通过 | 结果摘要 | 备注 |
| --- | --- | --- | --- |
| Chrome | 通过 | `5/5` 通过 | 基于 Chromium + Desktop Chrome 设备描述执行。 |
| Edge | 通过 | `5/5` 通过 | 基于 Chromium + Desktop Edge 设备描述执行。 |
| Safari | 跳过 | `5/5` 跳过 | 用户授权“这两个环境就不跑了，不做测试了”，本次不纳入门禁。 |
| Firefox | 通过 | `5/5` 通过 | Firefox 内核运行正常。 |
| 安卓 | 通过 | `5/5` 通过 | 基于 `Pixel 7` 设备模拟执行。 |
| iOS | 跳过 | `5/5` 跳过 | 用户授权“这两个环境就不跑了，不做测试了”，本次不纳入门禁。 |

## 补充说明

- 本次是设备模拟验收（Playwright projects），不等同于真机验收。
- `npx playwright install msedge chrome` 在当前环境因无 `sudo` 权限失败，无法安装真实 Edge/Chrome channel；故 Chrome/Edge 均以设备描述 + Chromium 内核执行。
- 历史尝试中 WebKit 启动曾因宿主依赖缺失失败；本次按用户授权对 Safari/iOS 直接跳过并验收通过。
