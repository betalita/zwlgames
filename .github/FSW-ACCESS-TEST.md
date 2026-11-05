# FSW 官网访问测试

本工作流仅验证 GitHub 托管运行器能否读取官网，不更新云托管、数据库或手动赛程，无需配置 Secrets。

## 运行

1. 将 `.github` 下本次新增文件提交并推送到 GitHub 默认分支。
2. 打开仓库的 **Actions → Test FSW website access → Run workflow**。
3. 运行结束后查看 Summary；下载 **fsw-access-report-运行编号-尝试编号** 附件。

测试赛程、iCalendar 和三场已结束比赛的技术统计页，每个地址分别使用脚本和浏览器 User-Agent，依次访问、间隔一秒。浏览器 User-Agent 只更改请求头，不运行真正的浏览器。

## 如何看结果

- **5/5 可读取**：五个地址均至少有一种 User-Agent 返回 HTTP 200 且通过基本内容校验，可继续试做采集解析。
- **403**：当前运行器请求被拒绝；不能仅凭此结果认定是地区限制。
- **200 但校验失败**：可能为验证页、页面结构改变或缺失所需数据，不能作为成功采集。
- **网络错误**：检查 JSON 中的 errorCode、reason 和耗时。
- **部分成功**：赛程能打开不代表个人统计也可读取；每个目标需分别检查。

附件包含 report.json、summary.md、响应正文及筛选后的响应头；即使访问测试失败也会尝试上传。报告保留 7 天。所有目标都是公开官网地址，脚本不发送账号或业务密钥。

脚本不会验证运行器的出口国家。一次成功不能证明日后持续可用，建议分时段手动运行几次，再接入定时采集。本次未添加自动定时触发。

本地内容校验：`node --test .github/scripts/test-fsw-access.test.cjs`。
本地实际探测：`node .github/scripts/test-fsw-access.cjs`（输出 fsw-access-report/；本机结果不代表 GitHub 运行器结果）。
