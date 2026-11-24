# sarif-lab

把静态分析工具导出的 [SARIF](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) 报告贴进来，在浏览器里本地按严重级别、规则和文件汇总发现，并展开数据流。**纯前端，不上传。**

在线试用：<https://temptation2017.github.io/sarif-lab/>

## 做什么

- 识别常见的 SARIF 2.1.0 / 2.0 导出（CodeQL、Semgrep、ESLint、Trivy、GitHub code scanning 下载的报告等）
- 汇总 error / warning / note、涉及的文件和规则，以及已抑制、通过类结果
- 按文件、规则、严重级别或工具分组，支持关键词筛选和级别开关
- 展示位置、代码片段，以及 `codeFlows` 里的数据流步骤
- 从规则的 `messageStrings` + 参数还原完整消息，并去掉 `file://` 前缀
- 一键复制 Markdown 摘要，方便贴进评审或工单
- 支持拖入或打开 `.sarif` / `.json` 文件

全部在本机计算，不会把粘贴内容发到任何服务器。

## 怎么打开

- 打开 GitHub Pages：<https://temptation2017.github.io/sarif-lab/>
- 或本地下载后双击 `index.html`，或：

```bash
python3 -m http.server 8080
# 浏览器访问 http://127.0.0.1:8080/
```

无需构建、无需 npm。

可选校验（零依赖，只需 Node.js）：

```bash
node test_sarif.js
```

## 怎么用

1. 在 CI 或本地工具里导出 SARIF（例如 `semgrep --sarif`、CodeQL / ESLint 的 SARIF formatter、GitHub code scanning 的报告下载）。
2. 把完整 JSON 粘贴到左侧，或把 `.sarif` 文件拖进去。
3. 看右侧的工具、计数、分组列表；用筛选框和级别按钮收窄范围。
4. 需要时勾选「显示已抑制」，查看带 `suppressions` 的条目。
5. 要把结论带走，点「复制 Markdown 摘要」。

## 示例

下列路径、规则名和代码都是虚构样本，只用来演示格式。

| 场景 | 结论要点 |
| --- | --- |
| ESLint 风格：`src/cart.js` 上 `eqeqeq` + `no-unused-vars` | 1 个 error、1 个 warning，同文件分组 |
| 带 `codeFlows` 的 SQL 拼接发现 | error `SQL001`，数据流从 `src/api/search.js:12` 到 `src/db/query.js:8` |
| 两个 run（ESLint + 示例扫描器），其中 `no-console` 带抑制 | 默认隐藏已抑制项，勾选后可见；`PATH001` 的消息由 `{0}` 参数还原 |

## 限制与后续可改进点

- 只解析你贴进来的 SARIF JSON，不会去跑扫描工具，也不会拉取 GitHub / 仓库里的源码。
- 对 SARIF 2.1.0 的常见字段做了支持；各工具的私有 `properties`、修复建议 `fixes`、完整的 `threadFlows` 图形还没有展开。
- 规则消息目前按 `text` / `messageStrings` 还原，不渲染 Markdown 消息，也不解析 `graphs`。
- 超大报告（数万条结果）可以在浏览器里打开，但没有做虚拟列表，筛选和渲染可能会变慢。
- 没有做「和上一次运行比较」的基线视图（只会显示结果里已有的 `baselineState`）。

## 许可

MIT。详见 [LICENSE](LICENSE)。
