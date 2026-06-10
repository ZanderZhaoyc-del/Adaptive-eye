# Adaptive Eye 对比度主题批量审计设计

**日期：** 2026-06-04

## 背景

`adaptive-eye` 当前已经具备两项核心能力：

1. 对单个页面执行 WCAG 色彩对比度审计。
2. 为单页审计结果生成带标注的截图报告。

当前缺少的是“系统主题维度”的批量审计能力。用户希望在执行页面审计前，先将 Windows 系统切换到指定的 `Contrast themes` 配置，再分别输出每个主题下的审计结果，以便横向比较页面在不同系统对比度主题下的表现。

第一版范围限定如下：

- 平台仅支持 Windows。
- 主题范围支持：
  - `none`，表示显式关闭对比度主题。
  - `aquatic`
  - `desert`
  - `dusk`
  - `night-sky`
- 如果未指定主题列表，则默认按以下顺序执行全部主题：
  - `none`
  - `aquatic`
  - `desert`
  - `dusk`
  - `night-sky`

## 目标

新增一个独立 CLI 命令，在单次执行中按顺序切换多个 Windows 对比度主题，并为每个主题分别生成现有的页面审计报告；如用户显式开启，还要为每个主题生成带标注的截图报告；全部结束后恢复用户执行前的原始系统主题。

## 非目标

第一版不包含以下内容：

- 非 Windows 平台支持。
- 用户自定义对比度主题的发现、列举或执行。
- 多页面爬取或多 URL 批处理。
- 通过视觉模型补充当前 DOM 审计结果。
- 在真实测试环境中自动验证系统主题确已在 UI 层生效的端到端校验。

## 用户体验

新增命令：

```bash
adaptive-eye themes <url> [options]
```

支持参数：

```bash
--themes <list>          逗号分隔的主题列表，可选值：none,aquatic,desert,dusk,night-sky
--report <json|markdown|both>
--out-dir <path>
--annotate               对每个主题的 JSON 结果追加 annotated screenshot
--no-open                透传给底层审计/标注流程，跳过 browser-use open
--no-screenshot          透传给底层页面审计流程，跳过 fallback screenshot
--script <path>          透传给底层页面审计流程，指定 browser eval script
```

示例：

```bash
adaptive-eye themes https://www.baidu.com
adaptive-eye themes https://www.baidu.com --themes none,dusk
adaptive-eye themes https://www.baidu.com --themes aquatic,night-sky --annotate
```

命令行为约束：

- 若未传 `--themes`，默认测试全部 5 个主题，顺序固定为 `none,aquatic,desert,dusk,night-sky`。
- 若传入 `--themes`，按用户给出的顺序执行。
- 每个主题执行前都要显式切换，不依赖当前系统状态。
- 执行结束后，无论成功失败，都尝试恢复执行前的原始系统主题。

## 设计概览

整体设计采用“高层 orchestration + 底层复用”的结构：

- 现有 `runPageAudit()` 继续负责单次页面审计。
- 现有 `runAnnotation()` 继续负责单次标注流程。
- 新增 `themes` 命令作为编排层，负责：
  - 解析主题列表。
  - 保存与恢复系统主题状态。
  - 顺序切换主题。
  - 为每个主题调用单次审计。
  - 按需追加标注。
  - 生成批量汇总报告。

这样可以保持现有单页能力不被“批量主题执行”污染，也为后续可能的其他批处理场景保留干净边界。

## 架构与模块拆分

建议新增或修改如下模块：

### 1. `adaptive-eye-cli/src/cli-options.js`

新增 `themes` 命令解析逻辑：

- 识别 `adaptive-eye themes <url> [options]`
- 解析 `--themes`
- 校验主题名称合法性
- 生成标准化后的主题执行列表
- 为帮助文案补充新命令与新参数

### 2. `adaptive-eye-cli/src/cli.js`

新增 `themes` 命令分支：

- 调用新的 `runThemeAuditBatch(options)`
- 输出批量执行摘要
- 输出总览报告路径
- 输出每个主题的结果摘要与警告

### 3. `adaptive-eye-cli/src/theme-runner.js`

新增批量执行主模块，负责：

- 平台校验
- 创建总输出目录
- 保存原始主题状态
- 循环执行目标主题列表
- 调用系统主题切换模块
- 调用 `runPageAudit()`
- 根据 `--annotate` 调用 `runAnnotation()`
- 收集每个主题的执行结果
- 生成 `index.json` 和 `index.md`
- 在 `finally` 中恢复原始主题

这是第一版的核心编排文件。

### 4. `adaptive-eye-cli/src/windows-contrast-theme.js`

新增 Windows 主题切换模块，职责单一：

- 定义支持的逻辑主题名：
  - `none`
  - `aquatic`
  - `desert`
  - `dusk`
  - `night-sky`
- 将逻辑主题名映射到 Windows 对应的切换动作
- 读取当前系统主题状态，作为恢复点
- 应用指定主题
- 等待主题切换稳定
- 执行恢复

该模块不关心审计逻辑，只关心系统主题状态。

### 5. `adaptive-eye-cli/src/report-generator.js`

补充“批量主题汇总报告”生成能力，但不改动现有单页报告语义：

- 新增批量执行结果的 Markdown 生成函数
- 可选新增批量执行结果的标准化 JSON 结构帮助函数

### 6. 现有 `adaptive-eye-cli/src/audit-runner.js`

尽量不改其核心职责。只允许做最小改动，例如：

- 保持现有参数透传能力。
- 保持单次运行的输出结构与返回值稳定。

### 7. 现有 `adaptive-eye-cli/src/annotator.js`

不修改主流程，只由 `theme-runner` 在单个主题的 JSON 报告生成后按需调用。

## 主题切换策略

第一版采用“显式应用 Windows 系统主题/对比度主题”的方式，而不是把主题切换逻辑混进浏览器或页面层。

实现原则：

- `none` 表示显式关闭对比度主题，而不是“保持当前状态不变”。
- 其余 4 个主题表示显式切换到对应内置对比度主题。
- 每轮执行前都调用一次切换动作，即使当前系统已经处于目标主题，也不省略。
- 批量执行结束后恢复到命令启动前的原始状态，而不是停留在最后一个测试主题。

为了提高稳定性，主题切换模块需要具备以下能力：

1. **读取原始状态**
   在批量任务开始前读取当前系统主题相关信息，形成一个可恢复对象。

2. **执行切换**
   为 `none` 和 4 个内置对比度主题分别执行对应系统动作。

3. **等待稳定**
   切换后等待短时间，并用系统状态检查做轻量确认，避免切换刚发出就开始审计。

4. **恢复原状态**
   在 `finally` 中执行恢复，即使中途某个主题失败也不跳过。

## 主题枚举与顺序

支持主题常量：

```text
none
aquatic
desert
dusk
night-sky
```

默认执行顺序：

```text
none -> aquatic -> desert -> dusk -> night-sky
```

顺序设计理由：

- `none` 作为基线，最适合放在第一个执行。
- 后续 4 个内置对比度主题再作为主题对比维度。
- 若用户显式传入 `--themes`，则用户顺序优先，不再强制重排。

## 报告目录结构

一次 `themes` 命令执行只生成一个总输出目录。目录下按实际测试主题建立子目录。

默认全量执行时，目录结构如下：

```text
reports/adaptive-eye-YYYY-MM-DD-HHMM/
  index.json
  index.md
  none/
    contrast-report-....json
    contrast-report-....md
    contrast-report-....-annotated.png
  aquatic/
    ...
  desert/
    ...
  dusk/
    ...
  night-sky/
    ...
```

若用户只执行子集，例如 `--themes none,dusk`，则仅创建：

```text
reports/adaptive-eye-YYYY-MM-DD-HHMM/
  index.json
  index.md
  none/
    ...
  dusk/
    ...
```

约束：

- 总输出目录继续复用现有 `adaptive-eye-YYYY-MM-DD-HHMM` 命名风格。
- 每个主题目录内部仍复用现有单页报告命名逻辑。
- 汇总索引文件放在总输出目录根部。

## 汇总报告结构

### `index.json`

应包含：

- 批量任务元数据：
  - `auditType`
  - `pageUrl`
  - `generatedAt`
  - `platform`
  - `requestedThemes`
  - `executedThemes`
  - `restoredOriginalTheme`
- 原始主题恢复信息：
  - `originalTheme`
  - `restoreError`（若存在）
- 每个主题的结果对象数组：
  - `theme`
  - `status`，例如 `success`、`audit_failed`、`theme_switch_failed`、`annotation_failed`
  - `summary`
  - `reportPaths`
  - `warnings`
  - `errorMessage`

### `index.md`

应对人类可读，至少包含：

- URL
- 执行时间
- 实际执行主题列表
- 原始主题恢复状态
- 每个主题的摘要表格：
  - Theme
  - Result
  - Issues Found
  - Critical
  - Warning
  - JSON Report
  - Markdown Report
  - Annotated Screenshot
- 警告与失败信息

## 执行流程

`runThemeAuditBatch(options)` 的建议顺序如下：

1. 校验 `process.platform === 'win32'`
2. 解析并标准化目标主题列表
3. 计算总输出目录并创建目录
4. 读取并保存原始系统主题状态
5. 初始化批量结果数组
6. 按顺序遍历主题列表，对每个主题执行：
   - 创建主题子目录
   - 切换到目标主题
   - 等待主题稳定
   - 调用 `runPageAudit()`，并将 `outDir` 指向当前主题子目录
   - 若 `--annotate` 开启且当前主题已生成 JSON 报告，则对该 JSON 结果执行 `runAnnotation()`
   - 整理主题级返回结果，写入批量结果数组
7. 根据结果数组生成 `index.json`
8. 根据结果数组生成 `index.md`
9. 在 `finally` 中恢复原始主题
10. 返回批量执行结果给 CLI

## 错误处理策略

第一版采用“尽量产出部分结果”的策略。

### 主题切换失败

- 标记当前主题为 `theme_switch_failed`
- 记录错误信息
- 不执行该主题的审计与标注
- 继续后续主题

### 页面审计失败

- 标记当前主题为 `audit_failed`
- 记录错误信息
- 不阻断后续主题

### 标注失败

- 标记当前主题结果为 `annotation_failed` 或在 `warnings` 中记录
- 保留已经生成的 JSON / Markdown 报告
- 不阻断后续主题

### 汇总写入失败

- 如果主题级结果已经存在，尽量仍向 CLI 返回内存中的结果摘要
- 但最终命令应以失败退出，避免用户误认为汇总文件已经生成

### 原始主题恢复失败

- 必须在最终 CLI 输出中明确提醒
- 将恢复失败信息写入 `index.json`
- 若 `index.md` 已能生成，也要包含恢复失败说明

## CLI 输出建议

`cli.js` 中的 `themes` 分支建议输出：

- 批量任务完成或部分完成状态
- 总览索引路径：
  - `index.json`
  - `index.md`
- 每个主题一行摘要：
  - 主题名
  - 执行状态
  - issue 数量
  - 报告路径
- 若恢复原始主题失败，输出高优先级警告

## 测试设计

第一版以单元测试和依赖注入为主，不做真实系统主题切换的自动化集成测试。

### `adaptive-eye-cli/test/cli-options.test.js`

新增测试：

- `themes` 命令可正确解析 URL
- 默认主题列表为 `none,aquatic,desert,dusk,night-sky`
- `--themes none,dusk` 可正确解析为指定顺序
- 非法主题值会抛出错误
- 空的 `--themes` 值会抛出错误

### `adaptive-eye-cli/test/theme-runner.test.js`

新增测试：

- 按默认顺序执行全部主题
- 按用户指定顺序执行子集主题
- 每个主题会获得独立子目录
- 页面审计返回结果会被正确汇总
- `--annotate` 开启时会在 JSON 报告存在后调用标注
- 单个主题切换失败时仍继续后续主题
- 单个主题审计失败时仍继续后续主题
- 无论成功失败都尝试恢复原始主题
- 恢复失败会写入结果对象

### `adaptive-eye-cli/test/windows-contrast-theme.test.js`

新增测试：

- 逻辑主题名到系统动作的映射正确
- `none` 走关闭对比度主题路径
- 4 个内置对比度主题走各自路径
- 读取原始状态函数可产出恢复对象
- 恢复逻辑使用原始状态对象
- 等待稳定逻辑可被注入和 mock

### `adaptive-eye-cli/test/report-generator.test.js`

新增测试：

- 批量索引 Markdown 能正确渲染主题摘要
- 缺失某些路径时不会生成损坏表格
- 恢复失败信息能出现在总览报告中

## 可维护性要求

- 单页审计与批量主题执行必须分层，避免 `runPageAudit()` 承担主题管理职责。
- Windows 主题切换逻辑必须集中到单文件中，避免散落在 CLI 和 runner 中。
- 所有新逻辑尽量通过依赖注入隔离外部副作用，以便测试中 mock：
  - 主题切换
  - 文件读写
  - 目录创建
  - 时间
  - 子进程执行

## 风险与缓解

### 风险 1：系统主题切换存在机器差异

缓解：

- 第一版将 Windows 主题切换封装为独立模块，便于后续替换具体实现。
- 引入“切换后等待稳定 + 轻量状态检查”。

### 风险 2：切换过快导致浏览器页面尚未响应新主题

缓解：

- 每次主题切换后统一等待固定时长。
- 等待逻辑抽成可配置函数，后续可微调。

### 风险 3：中途失败导致用户系统停留在测试主题

缓解：

- 必须使用 `try/finally`。
- 恢复失败必须显式上报。

### 风险 4：全量 5 主题加标注导致运行时间偏长

缓解：

- `--annotate` 默认关闭，由用户显式开启。
- 报告摘要中清楚标明哪些主题已产出标注图。

## 兼容性与演进

此设计为后续扩展留出空间：

- 未来可扩展到用户自定义主题。
- 未来可扩展到“主题 × 多页面”的双层批处理。
- 未来可为 `index.md` 增加跨主题差异对比摘要。
- 未来可在真正需要时增加 Windows 主题切换的备用实现。

## 验收标准

当以下条件全部满足时，可视为第一版完成：

1. `adaptive-eye themes <url>` 可在 Windows 上执行。
2. 默认情况下会依次执行 `none,aquatic,desert,dusk,night-sky`。
3. `--themes` 可控制实际执行主题集合与顺序。
4. 每个主题都会生成独立输出目录和单页报告。
5. `--annotate` 开启时，每个主题可生成带标注截图。
6. 执行结束后会尝试恢复原始系统主题。
7. 即使部分主题失败，也能继续输出其他主题的结果。
8. 会生成可读的 `index.json` 和 `index.md` 汇总文件。
