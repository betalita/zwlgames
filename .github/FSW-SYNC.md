# FSW 定时采集和云托管同步

独立公开仓库：https://github.com/betalita/zwlgames ，默认分支 master。采集脚本只依赖 Node 内置模块，复制 .github 目录即可运行，不需要上传小程序或 backend 源码。

## GitHub 端

- 将完整 `.github` 目录放到仓库根目录，保留目录名。采集工作流依赖 `scripts/fsw-collector.cjs`、`fsw-details.cjs`、`fsw-publication.cjs`、`fsw-collection-gate.cjs`、对应测试、`fixtures/fsw-albany.cjs` 和 `fsw-games.json`，这些文件均不能漏传。
- 工作流名为 **Collect FSW schedule**。手动运行、脚本推送，以及 UTC 21:40、11:40（北京时间 05:40、19:40）执行全量核对。额外在每小时第 7、17、27、37、47、57 分钟唤起赛后检查：仅当某场尚未确认完赛且已知开赛时刻距今 2～6 小时时，访问官网采集该场；已确认 Final 的场次立即退出赛后高频采集。无符合场次时直接退出，不访问官网或生成新快照。时间待定不推算结束时间。GitHub 可能延迟执行。
- 赛后唤起先读取检出的索引判断窗口；无待采集比赛时，跳过测试、采集、提交和附件上传，仅产生短暂的 runner 启动/检出开销。采集脚本仍会再次检查窗口。工作流并发最多 1 个，作业限时 15 分钟；数据文件提交不在 push 触发路径中，不会循环触发自身。
- `permissions: contents: write` 授予本工作流提交数据的权限。仓库 Settings → Actions → General → Workflow permissions 可检查默认权限；通常保留只读默认并使用工作流显式授权即可。不需要创建 PAT 或勾选批准 PR。
- 每次从官网赛程和 iCalendar 核对 UID/球队，读取已开赛比赛在官网列出的 Box Score 链接。只有明确 Final 且身份匹配才录入赛果；采集双方球员的分钟、投篮/三分/罚球、进攻/防守/总篮板、助攻、抢断、盖帽、失误、犯规及得分，并读取球队合计。官网提供 Team Stats 时，另取经过比赛身份核对的命中率、利用失误/二次进攻/内线/快攻/替补得分及最大领先。
- 官网赛程已标记 Final，但 Box Score 尚未公布或暂时不可用时，按该场完整 UID、对手和胜负关系核实赛程比分，发布 `result.sourceType='schedule'` 的仅比分赛果。来源为该场 `schedule?eid=<UID>`，分节数组为空、个人统计为 null，不读取 Recap 推测技术统计。后续全量采集可升级为完整 Box Score；仅比分结果不会替换已有完整赛果和技术统计。
- 缺失值使用 `null`，不补零、不推定 DNP。投篮得分关系、篮板关系及球员合计与球队合计互相核验；全员 MIN=1、失误小于对方抢断、零犯规但对方有罚球等异常字段不录入。只在官网明确分组且首发恰为 5 人时保留首发/替补标签，否则统一列为“球员”。独立 Team Stats 请求失败不影响已核实的球员和基本球队统计。
- 赛程或 iCalendar 请求失败时中止并保留旧文件；单场详情请求或解析失败时保留该场原有完赛记录，其他场次继续。先写详情再写索引，各文件通过临时文件原子替换；同一次 Git 提交包含索引及单场文件。索引 generatedAt 是本次赛程检查时间；详情不写入每次运行时间，内容未变化时哈希保持不变。
- 默认只维护 fsw-games.json 映射的 28 场。UID 和 id 对应原手动赛程，不凭日期生成新 ID；新增比赛需人工扩充映射及后端手动清单后部署。
- `data/fsw-2026-27.json` 是 schemaVersion=2 的赛程索引，含日期、对手、已核实比分及 `detail: {path, sha256}`；未完赛场次 result/detail 为 null。每场完赛详情独立保存到 `data/fsw-2026-27/games/<比赛ID>.json`，包含该场身份、比分、分节比分、赵维伦个人统计及双方完整球员/球队统计。Actions snapshot 附件包含索引和全部已有单场文件。
- 每个文件采用紧凑 JSON，发布前分别按 UTF-8 字节检查 512 KiB 上限。Actions 摘要显示索引实际大小和本次写入的单场文件数。小程序通过云托管按场读取数据库，不直接下载 GitHub 文件。

Raw 地址：https://raw.githubusercontent.com/betalita/zwlgames/master/data/fsw-2026-27.json

## 云托管端

服务环境变量 `NJCAA_SNAPSHOT_URL` 设置为以上 Raw 地址，启用读取。无需 GitHub token，也无需 COS。原 06:00/20:00 NJCAA 赛程任务先读取索引，仅下载新增或哈希变化的完赛详情；单场刷新只检查目标比赛。兼容旧 schemaVersion=1 单文件，以便先部署后端再升级 GitHub。

后端校验 season=2027、official-fsw、官网来源、28 场原有 ID、UTC 与场地日期、比分和统计。索引最多 512 KiB、年龄最多 72 小时；单场文件各最多 512 KiB，请求超时 12 秒、下载并发最多 3。详情路径必须恰为该比赛在固定仓库中的路径，内容 SHA-256、球队、比赛 ID、日期、开赛时间、比分必须与索引一致。只访问同一公开仓库；Raw 连接失败或哈希不符时通过 GitHub Contents API 重试，不跟随跳转。单场失败只跳过该场，下次继续尝试。

仅比分模式要求索引和单场文件均携带 `result.sourceType='schedule'`，且单场来源 URL 必须绑定同一 UID；不接受分节或个人数据混入该模式。须先部署支持此格式的后端，再发布采集脚本及新快照，旧后端会拒绝新格式。赵维伦统计状态从赛前改为缺失，已有 ready/DNP 数据继续保留。

只对启用 GitHub 来源且时刻已知的 NJCAA 比赛增加赛后窗口：从开赛后 2 小时 10 分起，每 5 分钟读取索引并按哈希决定是否下载该场，直到开赛后 6 小时 30 分。一旦已确认 Final 并写入数据库，立即取消该场高频检查，不再因统计缺失继续轮询；迟到统计和更正由每天 06:00/20:00 全量核对补齐。窗口后仍未确认赛果时改为每 6 小时检查，最多至开赛后 48 小时，此后交给每日全量核对。数据库持久化成功应用的 `detailSha256`，仅在比赛、双方详情和赵维伦数据均写入成功后更新，失败不会误标为已同步。TBA 不进入高频检查，其他联赛及手动来源不采用此策略。

NJCAA 比赛详情接口只读取数据库，缺失统计不会因打开或刷新小程序而触发下载。未完赛场次后台成功、失败均安排下次检查时间，不立即重新入队；完赛场次直接清除下次检查时间；恢复调度保留正常等待时间，超过截止时间不重新启动。已确认完赛的场次不再安排高频检查；始终未确认结束的场次，标准自动窗口最多 52 次索引检查，再最多 7 次低频检查。此计数不含每天两次全量核对或管理员主动同步。单次文件请求仅 Raw 和 API 各最多一次，均失败后返回兜底，不在当前调用中循环重试。全量、定时单场和管理员同步共用 NJCAA 数据库锁，防止并发重复下载。

内部 schedules 结果包括 `njcaa.source`、`format`、`snapshotGeneratedAt`、`detailFetched`、`detailSkipped`、`detailErrors`；`detailGames` 是本次实际应用详情的场数。哈希不变时只读索引，官网更正造成哈希变化时每日核对仍会导入。

Github 下载/校验失败时保留已成功写入的自动数据；手动清单只补缺，不回退覆盖自动数据。将 backend/src/njcaa-manual-schedule.js 对应项设为 `manualOverride: true` 并修正手动时刻/赛果后部署，可明确锁定该场。去掉该标记恢复自动更新。已保存的个人数据不会因官网暂时没有球员行而被清空。

完赛结果的可选 `result.details.school/opponent` 保存分组球员及球队统计。后端再次校验字段、范围和身份，映射为比赛详情已有的 `boxscore`、`teamStats`，按数据库实际球队 ID 关联；复用现有 JSON 列，无需数据库迁移或小程序界面改动。旧版 JSON 没有详情仍可同步，暂缺一方或整个详情区块时保留该区块原有数据；新快照已明确排除的异常单元格显示“—”。每次同步的 `njcaa.detailGames` 记录实际应用详情的场次数。

清空 NJCAA_SNAPSHOT_URL 可停止新下载；已有自动数据仍保留。没有数据文件或无法访问 GitHub 时同步继续采用手动兜底，不能将这种结果视为自动链路已验证。

## 验证

- 本地：`node --test .github/scripts/*.test.cjs`；后端：在 backend 目录运行 `npm test`。
- GitHub：运行 Collect FSW schedule，检查生成的 JSON 和 Commit JSON snapshot 步骤。
- 云端：使用已有受保护 POST /internal/sync/schedules 后检查 sync-runs 的 result_json.schedules.njcaa，source=github 且快照时间正确；再核对赛程和赵维伦详情。
