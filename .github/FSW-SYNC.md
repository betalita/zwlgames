# FSW 定时采集和云托管同步

独立公开仓库：https://github.com/betalita/zwlgames ，默认分支 master。采集脚本只依赖 Node 内置模块，复制 .github 目录即可运行，不需要上传小程序或 backend 源码。

## GitHub 端

- 上传 `.github/workflows/collect-fsw.yml`、`.github/scripts/fsw-collector.cjs`、`.github/scripts/fsw-collector.test.cjs`、`.github/scripts/fsw-games.json`。
- 工作流名为 **Collect FSW schedule**。支持手动触发，脚本/配置推送后触发，以及 UTC 21:40、11:40（北京时间 05:40、19:40）定时触发；GitHub 可能延迟执行。
- `permissions: contents: write` 授予本工作流提交数据的权限。仓库 Settings → Actions → General → Workflow permissions 可检查默认权限；通常保留只读默认并使用工作流显式授权即可。不需要创建 PAT 或勾选批准 PR。
- 每次从官网赛程和 iCalendar 核对 UID/球队，读取已开赛比赛在官网列出的 Box Score 链接。只有明确 Final 且身份匹配才录入赛果；个人统计还校验投篮得分关系。MIN 全员为 1 的占位统计不录入分钟。
- 任一必要请求或校验失败，会中止，保留上次成功 JSON。先写临时文件再原子替换，提交范围仅为 data/fsw-2026-27.json。新 generatedAt 表示本次成功采集时间，每次成功运行记录一次检查。
- 默认只维护 fsw-games.json 映射的 28 场。UID 和 id 对应原手动赛程，不凭日期生成新 ID；新增比赛需人工扩充映射及后端手动清单后部署。
- 成功后 JSON 位于 `data/fsw-2026-27.json`；可在 Actions 下载该次 snapshot 附件。

Raw 地址：https://raw.githubusercontent.com/betalita/zwlgames/master/data/fsw-2026-27.json

## 云托管端

服务环境变量 `NJCAA_SNAPSHOT_URL` 设置为以上 Raw 地址，启用读取。无需 GitHub token，也无需 COS。原 06:00/20:00 NJCAA 赛程任务与单场刷新复用此入口。

后端严格校验 schemaVersion=1、season=2027、official-fsw、官网来源、28 场原有 ID、UTC 与场地日期、比分和统计，并限制下载大小 512 KiB、超时 12 秒和快照年龄 72 小时。只访问配置好的公开 Raw 地址，不跟随跳转。比赛元数据记录 dataSource 和 snapshotGeneratedAt，内部 schedules 同步结果记录 njcaa.source、snapshotGeneratedAt 或 snapshotError。

Github 下载/校验失败时保留已成功写入的自动数据；手动清单只补缺，不回退覆盖自动数据。将 backend/src/njcaa-manual-schedule.js 对应项设为 `manualOverride: true` 并修正手动时刻/赛果后部署，可明确锁定该场。去掉该标记恢复自动更新。已保存的个人数据不会因官网暂时没有球员行而被清空。

清空 NJCAA_SNAPSHOT_URL 可停止新下载；已有自动数据仍保留。没有数据文件或无法访问 GitHub 时同步继续采用手动兜底，不能将这种结果视为自动链路已验证。

## 验证

- 本地：`node --test .github/scripts/*.test.cjs`；后端：在 backend 目录运行 `npm test`。
- GitHub：运行 Collect FSW schedule，检查生成的 JSON 和 Commit JSON snapshot 步骤。
- 云端：使用已有受保护 POST /internal/sync/schedules 后检查 sync-runs 的 result_json.schedules.njcaa，source=github 且快照时间正确；再核对赛程和赵维伦详情。
