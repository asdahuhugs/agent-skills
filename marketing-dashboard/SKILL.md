---
name: marketing-dashboard
description: 从「营销中心数据大盘_专业版.xlsx」提取询盘、销售业绩、网站流量和广告投放数据，生成并验证带诊断层的响应式网页数据大屏。当用户要求更新、重做、刷新、运行或检查营销中心数据大屏时使用。
---

# 营销中心数据大屏

使用本 Skill 维护当前目录中的营销数据大屏。优先复用已有生成器，不要重新手工分析整份 Excel 或重写页面。

> ## ⚡ 首要原则：快（用户 2026-11-10 明确要求）
>
> **「数据更新了」= 一条命令，约 1.5 秒，然后原样把它的报告发给用户。**
>
> ```
> python run.py            # 自动取 数据源/ 里最新一期源表
> python run.py 数据源/11月10日.xlsx   # 或指定
> ```
>
> `run.py` 内部：`daily_sync.py`（同步六块 + 精确自检 + 重建大屏）→ `build-dashboard.py`（拿达成率）→ `today_delta.py`（本期新增业绩），最后打印一份可直接复述的报告（含「谁开单、涨多少」）。
> **耗时实测 1.4~1.6 秒**；跑到 `退出码 0` 就直接把报告贴给用户，不必自己再算一遍。
>
> - **不要**打开浏览器、不要跑 DOM 探针、不要截图、不要逐格核实、不要手工跑 `pivot_read.py` 对账 —— 全都在 `run.py` 里了。
> - **不要**在报告前做"抽查"（第 E 节只在用户质疑数字时才用）。
> - 报告必须包含 **H 节「今日新增业绩」**（谁涨了、涨多少、开了多少单）—— 用户 2026-11-10 明确要求，不能省。`run.py` 已经算好了。
> - 只有三种情况才升级：用户明确要求验证、`run.py` 退出码非 0、用户说"大屏有问题"。
>
> 下方的 DOM 探针（F 节）**仅在用户明确要求验证前端时**才执行。

## 固定文件

- 数据源：`数据源/营销中心数据大盘_专业版.xlsx`（多 sheet 大盘工作簿）
- 临时源数据：`数据源/<M月D日>.xlsx`（用户每日给的销售透视表，**仅含销售额 + 部门 + 产品类型 + 负责人 + 月**，必须先同步到大盘工作簿才能用）
- **一键入口**：`run.py`（项目根目录，`python run.py` 完成同步+构建+新增业绩，打印最终报告，1.5 秒）
- 透视表读取器：`pivot_read.py`（项目根目录，直接读 pivotCache 原始明细，**与透视表当前布局/筛选无关**）
- 新增业绩对比器：`today_delta.py`（项目根目录，`python today_delta.py` 自动取最近两期源表相减，输出每人/每部门的当月新增与累计新增）
- 生成器：`build-dashboard.py`（项目根目录）
- 最终页面：`报表/营销中心数据大屏.html`
- 布局参考（历史版本，勿覆盖）：`报表/营销中心数据大屏1.html`

生成器内部按脚本自身位置解析路径，从任意工作目录调用都能正确读写。

**不生成任何预览图片。** 验证一律用下方的 DOM 探针方式 —— **但仅限用户明确要求验证前端时**（见上方首要原则）。

## 入口判断：先看用户要哪种动作

| 用户原话 | 走哪条路径 |
|---------|-----------|
| 「数据更新了」「同步了X.xlsx」「把今天的数据更新进去」「谁开单了」 | **`python run.py`** → 把报告贴给用户 |
| 「重新生成」「刷新」「跑一下」「重做」 | **`python build-dashboard.py`** → 报达成率 |
| 「大屏有问题」「诊断」「告警」 | **C. 看诊断层**（跳到第 4 节） |
| 「改图表/改布局」 | **D. 改前端**（先调用 `dataviz` skill，再走第 7 节） |

用户没明说时默认 `run.py`。**只要用户给了新的 `<M月D日>.xlsx`，就跑一次 `run.py`**，让它内部的精确对账决定哪些格子真的要改 —— 全 0 变化也是有效结论。

## 每次同步的标准动作（就一步）

```
python run.py          # 1.5 秒，自动找最新源表，跑完直接出报告
```

1. 等它跑完，看 `退出码 0`
2. **把报告原样贴给用户**（它已经包含：新增业绩 / 改了几格 / 各部门达成率 / 文件路径）
3. 只有在 `退出码非 0` 时才需要看详细输出定位问题

> `run.py` = `daily_sync.py`（A.1~A.7 全部逻辑：pivotCache 解析、部门映射、六块更新、公式保护 113/110、P78 源表总额口径、AS_OF 自动更新）+ `build-dashboard.py` + `today_delta.py`。
> **不要再手工重复这些步骤**，也不要拆开单跑。
> 下方 A 节保留为参考文档：仅在 `daily_sync.py` 报错、或需要理解某个口径为什么这么算时查阅。

---

## A. 同步源数据 → 重建大屏

适用：用户提供了一张新的销售透视表 `数据源/<M月D日>.xlsx`，需要把里面的销售数据并入大盘工作簿，再生成大屏。

透视表只含**销售额（人民币）+ 部门 + 产品类型 + 负责人 + 月**，不含：询盘条数、官网流量、百度/微信/抖音广告、GEO 数据、订单明细。所以同步后只能刷新「业绩达成」「整体合计」「产品分析」，流量/广告模块要等用户给其他数据源。

### A.1 读源数据 —— 用 `pivot_read.py` 读 pivotCache，不要读渲染出来的透视表

**核心事实：透视表文件里的 `xl/pivotCache/` 存着全部原始明细记录（含 公司部门 / 产品类型 / 负责人 / 下单日期 / 销售额 等 24 个字段），与透视表当前摆成什么行列、筛了什么，完全无关。**

所以：

- **不需要**让用户去调整透视表的行/列/筛选。用户摆成「产品类型」还是「业务员」都无所谓，想要哪个维度自己聚合。
- **也无法**用 officecli 去调整 —— officecli 没有任何透视表能力，`refresh` 只支持 Word。改 `pivotTable1.xml` 的布局 XML 不会重算已渲染的单元格，只有 Excel 本身能重算。**不要尝试，会白费时间。**

用项目根目录的 `pivot_read.py`：

```bash
PYTHONIOENCODING=utf-8 python pivot_read.py "数据源/<M月D日>.xlsx"           # 部门/产品类型/负责人 三张表
PYTHONIOENCODING=utf-8 python pivot_read.py "数据源/<M月D日>.xlsx" 产品类型   # 单个维度
```

输出每个维度的「1..N月（元）+ 累计 + 换算成万的整数行」，最后一行 `→万(四舍五入)` 就是可以直接填进大盘的数。

**Windows 上必须带 `PYTHONIOENCODING=utf-8`**，否则中文字段名输出成乱码。

解析 pivotCache 的四个坑（`pivot_read.py` 里都已处理，自己另写解析时务必照抄）：

1. **`下单日期` 字段存的是月份数字 1-12，不是日期**。sharedItems 就是 `<n v="1"/>..<n v="8"/>` 加一个 `<m/>`。当成 Excel 日期序列号去转会把所有记录都算进 1 月。
2. **字段名带尾随空格**：`'销售额（人民币） '`（注意末尾空格），且是**全角括号**。查字典前先 `.strip()`。业务员字段叫 **`负责人`**，不叫「业务员」。
3. **cache 比渲染出来的透视表多**，必须复刻透视表的隐含筛选，否则对不上：
   - 排除 `研发` 部门（cache 里有，透视表筛掉了）
   - 排除 `下单日期` 为空（`<m/>`）的记录（本次 7 条，约 270 万）
   - 不排的话总额会是 97,787,128 而不是正确的 95,069,044
4. **每格都是 `<x>` 共享项索引**，包括金额字段 —— 要回查该字段的 sharedItems 池，不能直接读 `v`。

**自检**：`pivot_read.py` 输出的「总计」行必须等于渲染透视表最后一行的总计。不等就是筛选没复刻对，先查清楚再往下走，不要硬填。

单位：源表是**元**，大盘是**万**，`万 = round(元 / 10000)`。

### A.2 部门映射

| 源（透视表） | 目标（大盘工作簿） |
|---|---|
| 国际 | 南海国际 |
| 国内 | 南海国内 |
| 军品 | 军工部 |
| 尚海 | 尚海国际 |
| 研发 | **无对应，排除** |

业务员维度注意：**马吉辉同时出现在 国际 和 尚海 两个部门**，做业务员级对比时必须用 `(部门, 负责人)` 复合键，只按 `负责人` 聚合会把两个部门的业绩合并。

### A.3 核对目标工作簿的「部门合计」行

`营销中心总览` sheet 里业绩达成块的行号（**会随用户整体上下移动，必须先 view 一遍确认**）：

| 部门合计 | 目标行 | K 列（8月 完成）| P 列（累计） |
|---------|--------|----------------|-------------|
| 南海国内 | 29（目标）/ **30（完成）** | K30 | P30 |
| 南海国际 | 49（目标）/ **50（完成）** | K50 | P50 |
| 尚海国际 | 69（目标）/ **70（完成）** | K70 | P70 |
| 军工部 | 75（目标）/ **76（完成）** | K76 | P76 |
| 整体合计 | 77（目标）/ **78（完成）** | K78 | P78 |

可以用 `officecli view "数据源/营销中心数据大盘_专业版.xlsx" text --range "营销中心总览!A29:Q78"` 一次性看完 50 行。

### A.4 对账：算出全部应填值，再挑出差异

**不要只盯着最新月份那一列。** 每次都把 1..N 月整行按 `round(元/10000)` 算出来，和大盘现值逐格比。历史月份也可能因为源表重新统计而变（本次 7 月就少了 21 万）。

每次同步必须更新 **5 个区块**（用户原话："数据大屏更新就要全面更新，不要只更新一部分"）：

| 区块 | sheet | 位置 | 内容 |
|---|---|---|---|
| ① 部门合计 | `营销中心总览` | 行 30/50/70/76，D..O 列 | 4 个部门完成行的月度 |
| ② 整体合计 | `营销中心总览` | 行 78，D..O 列 | 公司整体月度（取源表 →万 行） |
| ③ 业务员明细 | `营销中心总览` | 行 32/34/36/38/40/42/44/46/48（南海国际）/52/54/56/58/60/62/64/66/68（尚海国际）/72/74（军工部），D..K+P | 17 个业务员 + 1 个"其他"/"新人"兜底行 |
| ④ 产品分析 模块1 | `产品分析` | 行 6-19，E 列累计 | 13 个产品线 + 合计 |
| ⑤ 产品分析 模块2 | `产品分析` | 行 24-58，C..K 列 + 总计 | 公司部门 × 产品类型 × 月度 + 总计行 |
| ⑥ 新增订单 sheet | `新增订单` | 行 3 起，每行 部门/负责人/金额 | 从 pivot 8月 records 聚合每（部门, 业务员）的金额 |

**④⑤⑥ 三块前面 skill 漏写了，是 2026-08-14 用户纠正后补的必做项。**

**产品分析是元、不是万**，且 N 列累计 = `SUM(B:M)`；产品行的口径是**全部部门加总后按产品类型**，直接用 `pivot_read.py 产品类型` 的输出。

### 产品分类映射（用户 2026-08-13 调整）

分产品业绩趋势卡片按 **5 大类**呈现：**主营（护舷 / 气囊 / 浮体 / 其他）+ 外购**。映射规则由用户指定，见 `build-dashboard.py` 的常量：

```python
PRODUCT_FENDER   = ('充气护舷','实体护舷','泡沫护舷','漂浮式护舷','轮胎护舷')     # → 护舷
PRODUCT_AIRBAG   = ('船用气囊','工程气囊','拉移气囊')                            # → 气囊
PRODUCT_FLOAT    = ('助浮气囊','泡沫浮标')                                       # → 浮体
PRODUCT_OTHER    = ('护套','其他')                                              # → 其他
PRODUCT_PURCHASED= ('外购',)                                                    # → 外购（顶层大类）
```

**跟随部门筛选联动**（这是用户 2026-08-13 第二次明确的需求）：
- `parse_product_module()` 同步输出每个大类的 `aggregate` 月度数据 + 每个部门的 `byDept[].monthly`
- `renderProduct()` 按 `state.department` 挑选：「全部」= 跨部门聚合；指定部门 = `byDept[].monthly` 单部门数据
- 某部门对该大类无贡献时（`byDept` 里缺位或累计=0），**这条线自动不画**，避免空线误导
- 表格 caption 同步显示「全公司 / 南海国际 / 尚海国际 / 南海国内 / 军工部」+ 当前期间

未列入上述清单的模块 1 大类（`其他产品`、`气盾坝/围油栏`、`浮标` 等）在模块 2 没有明细，**分类图不绘制**，不要塞进 `其他` 或新增兜底桶。
新增产品线时必须先更新上面的 5 个元组（不要写 `'气囊' in name` 这种泛匹配 —— `助浮气囊` 是浮体不是气囊）。
颜色映射在 `renderProduct` 的 `styles` 表里，顺序固定为 `护舷/气囊/浮体/外购/其他`（实线蓝橙紫绿 + `其他` 灰色虚线），调色板为项目默认的三色 + `--purple`。

#### 三条硬约束（违反其一，`build-dashboard.py` 就报 `[错误]` 或数字自相矛盾）

**① 每个部门的月度行相加，必须等于该部门的 P 列累计。**
这是生成器唯一会**硬报错**的检查（`尚海国际 完成口径冲突：月度 1-8 月合计 2391 ≠ 部门合计 P 列 2392`）。
因为月度是各自四舍五入的，「源表累计÷万」和「各月四舍五入后相加」可能差 1-2。**以行相加为准去凑**：把该部门整行换成 `pivot_read.py` 算出的月度值，相加自然就等于 P 列。

**② 整体合计行（78 行）不是四个部门的四舍五入之和，而是 `round(源表当月总额/10000)`。**
用 `pivot_read.py 公司部门` 输出的 `→万(四舍五入)` 那一行直接填。本次 = `663 600 1132 1188 1758 1827 1449 891`，P78 = 9507。
分部门四舍五入再相加会得到 1187/1757 等，与源表总额舍入结果差 1 —— **以源表总额为准**。

**③ 某部门整行相加已经等于它的 P 列时，就别去动那一行的 ±1 万噪声。**
动了会连锁触发 78 行公式重算，把本来对的整体合计带歪（本次 E30 一改，E78 就从 600 被算成 599，得手动改回）。
**判定顺序：先算"这一行相加 == P 列吗"，等于就整行不动；不等才整行替换成源表值。**

#### 改完必查

```bash
officecli view "数据源/营销中心数据大盘_专业版.xlsx" text --range "营销中心总览!A29:R78" | grep -E "row\[(30|50|70|76|78)\]"
```

逐行心算「D..K 相加 == P 列」，以及 78 行是否还等于 `pivot_read.py` 的 `→万` 行。**改任何一格月度值之后都要重查 78 行**，因为它是 `=D30+D50+D70+D76` 这类公式，会被连锁重算。

### A.5 用 officecli 写入单元格

**先确认文件没被 Excel 占用**。若报 `The process cannot access the file ... being used by another process`，直接告诉用户「请关闭 Excel」，不要试图绕过。

**关键路径格式**：用直接单元格路径 `/<sheet>/<CellRef>`，**不要用** `/row[N]/c[@r='K50']`（会报「Invalid path index '@r=K50'」）。

```bash
officecli set "数据源/营销中心数据大盘_专业版.xlsx" /营销中心总览/K50 --prop value=172
officecli set "数据源/营销中心数据大盘_专业版.xlsx" /产品分析/I15 --prop value=5160942.667
officecli close "数据源/营销中心数据大盘_专业版.xlsx"           # flush 到磁盘
```

**坑 #1：公式覆盖与缓存**。月度格和 P 列大量是共享公式（`si="7"`）或 `SUM`。
- 用 `--prop value=` 覆盖公式单元 → **公式被替换为字面值**，下游引用它的格子缓存不刷新
- 但 **SUM 公式在新值写入后会重算**：实测改了 H72=44，P72（=SUM(D72:K72)）自动从 134 → 135。改 G74=8 后 P74（=SUM(D74:K74)）自动从 8 → 9
- 所以：改了月度格**如果 P 列是 SUM(D:K) 公式就自动重算**，但如果 P 列是 `=SUM(D78:O78)` 这种跨多行的引用，或者根本是 plain value（无 `<f>` 节点），就必须手动 set
- `N15`（产品分析累计）=`=SUM(B15:M15)`，改了 B..M 必须手动 set N
- `P78` 是 **plain value**（raw XML 里没有 `<f>` 节点），改了 K78 必须手动 set
- 「改了哪一格 → 重查下游引用」的清单要看单元格公式，不是看 cell 内容类型

**坑 #2：覆盖公式的 warning 是预期的**。`Warning: Cell K50 has formula "="; replacing with literal value.` 按工作流就是要替换。**不要**回退到 `--prop formula=...` —— 大盘只读缓存值，不依赖公式重算。

**坑 #3：改动会连锁**。78 行、N 列这些聚合格在你改上游后**有时会自动重算、有时不会**，两种都遇到过。唯一可靠做法是**改完再 view 一遍**，按 A.4 的三条硬约束核对，而不是假设它刷新了或没刷新。

### A.5.b 业务员明细行（必须更新，前面 skill 漏了）

`营销中心总览` sheet 里业务员明细 17 个完成行（不含「其他/新人」兜底）的 D..K 和 P 列都要同步**整个换掉**，不要只盯着 P 列是否等于部门合计。

数据源：`pivot_read.py 负责人`（按部门 × 业务员 拆），每个业务员 1-8 月 + 累计。南海国内没有业务员明细行（结构上就没拆）。

| 部门 | 业务员明细行 | D..K + P 来源 |
|---|---|---|
| 南海国际 | 32/34/36/38/40/42/44/46/48 | `pivot_read.py 负责人` 国际 dept（注意马吉辉在两个部门都有） |
| 尚海国际 | 52/54/56/58/60/62/64/66/68 | `pivot_read.py 负责人` 尚海 dept |
| 军工部 | 72/74 | `pivot_read.py 负责人` 军品 dept |

写完后用 `officecli view text --range "营销中心总览!A30:R68"` 抽样核对几个「pivot 数据比工作簿值大很多的」行——通常会发现马吉辉/赵爱心/郭亚会这种当月有大单的。

### A.5.c 产品分析 模块 2（公司部门 × 产品类型 交叉）

A.4 表里只列了模块 1，实际还有模块 2（行 22-58）：**公司部门 × 产品类型 × 月度**，列是 C..J=1-8月，K=总计。

`pivot_read.py` 默认只输出 3 个单维度（部门/产品类型/负责人）。**公司部门 × 产品类型 的交叉表需要单独跑（**`pivot_read.py` 用 `zipfile`+`ElementTree` 直接读 pivotCache，自己扩展 `tabulate` 函数传 `dimension=('公司部门','产品类型')` 或加一个交叉维度的 helper）。

交叉表的合计行 = 模块 1 的合计列，二者要对得上（都是源表总额）。

### A.5.d 新增订单 sheet（订单横幅数据源）

`新增订单` sheet 每行 = （部门, 业务员, 金额）。**每次同步都要重写**，行数 = pivot 8月 records 中所有非空 (部门, 业务员) 组合去重后的数量。

数据源：pivot 8月 records 按 (公司部门, 负责人) 聚合销售额（元）。**金额字段名带尾随空格** `'销售额（人民币） '`，`pivot_read.py` 已 `.strip()` 处理，自己扩展时务必照抄。

写完后用 `officecli view text --range "新增订单!A1:C20"` 核对：
- 金额之和 = `pivot_read.py 公司部门` 输出的 8月合计 = `pivot_read.py 产品类型` 输出的 8月合计（这两个口径必相等，因为都是源表总额）
- 行数 ≥ 上次同步的行数（新增订单是单调增加的）

### A.6 更新生成器时间戳

```bash
# 编辑 build-dashboard.py 第 22-23 行
AS_OF       = '2026-08-10'   # 数据截至日，源表文件名里的日期
AS_OF_DAY   = 10             # 最新月份已走完的天数；月份自然天数为 AS_OF_MONTH_DAYS=31
```

判定规则：
- `AS_OF` = 源数据文件名里的日期（`8月10日.xlsx` → `2026-08-10`）
- `AS_OF_DAY` = 该日期的「日」（1-31）。未走完的月份用真实天数，避免分母用满月导致日均失真
- `ACTUAL_MONTHS` = 当前所在月份（8 月就 = 8）
- `AS_OF_MONTH_DAYS` 通常不变 = 31

### A.7 校验 + 生成

接着进入下方第 2 节生成大屏，跑完后必须用 `view text --range` 抽查 K/P 列已更新：

```bash
officecli view "数据源/营销中心数据大盘_专业版.xlsx" text --range "营销中心总览!A29:Q78" | grep -E "部门合计|整体合计"
```

期望看到的数字应与源表透视表一致（误差 ≤ 1 万）。

---

## B. 重建大屏

确认 A 已完成（或大盘数据本来就是新的），直接跑生成器：

```bash
python build-dashboard.py
```

成功标志：脚本最后一行输出 `校验通过`。脚本只用 Python 标准库（`zipfile` + `xml.etree`）直接读 XLSX 的 OOXML，无需任何依赖。

构建结果会同时打印在 stdout：
- `inquiry / sales / perf / sources / traffic / ads` 各类条数
- `google_ads[<dept>]` 各谷歌账户条数与缺失月份
- `companyAnnual=target=… completed=… rate=…` 公司年度累计
- `empty=N -> <模块名>, …` 未接入模块清单
- 「部门口径」段：4 个部门 1-N 月 / 全年达成率
- 「对账」段：`[通过]` / `[错误]` 标记
- `dataNotes` 数量 + 摘要
- 最终 `校验通过`

如果出现 `[错误]`，必须回到 A.5 修源表后重跑，不得带错误发布。

### B.1 整体合计 KPI 必须用 companyAnnual，不要 sum-of-depts

**这是 2026-08-14 用户纠正后的硬规则：** 头版「销售业绩」KPI 必须显示源表「整体合计」P78 的值（如 9,867 万），不能是部门 P 列四舍五入之和（如 9,803 万）。

**为什么：** 源表部门行 D..O 是各自 round(元/10000) 后的整数，相加会引入 ±N 万的舍入噪声；公司「整体合计」行 P78 是源表总额四舍五入后的官方数字。两者差 64 万（8月14日数据），不修复就是 KPI 误导。

**实现位置：** `build-dashboard.py` 的 `renderKpis()` 和 `renderSales()` caption：
```js
// renderKpis: 全部+期间口径优先用 companyAnnual
if (state.department === '全部' && state.months >= 7 && state.months < 12) {
  periodTarget = perfDepts.reduce((s, g) => s + (g.ytd.target || 0), 0)
  periodComplete = DATA.companyAnnual.completed      // 不是 sum-of-depts
  annualTarget = perfDepts.reduce((s, g) => s + (g.annualTarget || 0), 0)
  annualComplete = DATA.companyAnnual.annualCompleted
} else {
  /* 部门筛选态 / 全年态走原来的 forEach */
}

// renderSales caption: 同样
caption = '... 部门合计 ' + fmt(state.department === '全部' ? DATA.companyAnnual.completed : sumPeriodDone) + ' ...'
```

**校验：** DOM 探针里 `kpi:...9,867 万...` 必须命中整体合计口径，不是 9,803。

### B.2 部门合计 ≠ 业务员相加 是已知数据口径，**不要试图去消除**

每次同步后必然出现 3 条 dataNote：
- 南海国内 · 部门合计 ≠ 业务员相加（南海国内没拆业务员明细，但源表里有 → 差额无法消除）
- 南海国际 · 部门合计 ≠ 业务员相加（业务员明细 8 个 + 其他兜底 1 个，源表里实际有 11 个，差额 = 张恒 296 + 苏兆浩 14 + 陈文康 16 ≈ 36 万）
- 尚海国际 · 部门合计 ≠ 业务员相加（同上，差额 ≈ 29 万）

这些差额来自源表四舍五入，不是 bug。**不要为了让 dataNote 消失去强行凑数。**

---

## C. 数据口径（必读，每次更新都要核对自己没违反）

- 当前工作簿以 `AS_OF` 所在月作为最新月份；`> ACTUAL_MONTHS` 的月份必须标记为 `isFuture`，**不能**把占位 0 当作实际零完成。
- 空白及 `-` 转为 `None`，**不能**转成 0。
- 询盘和业绩汇总由月度基础数据重新计算，**不依赖**可能为空的 Excel 公式缓存（见 build-dashboard.py 第 939 行 `# 累计直接读 P 列，不再由月度累加` —— 所以 P 列必须准确，公式和值都行）。
- 空白模块显示「未接入」，**不能**伪造指标。
- 尚海国际谷歌广告的展现与花费单位为「万」，生成器内部已换算成「次 / 元」。
- 达成率**必须同时呈现**「期间达成率」与「全年达成率」两个口径，只给一个会误导。
- 部门 / 公司指标一律取源表「部门合计」行，业务员明细只用于个人排行（不参与 KPI 聚合）。

---

## D. 诊断层不要写死结论

`build_analytics()` 里的所有告警、洞察文案、预警数字都必须从数据实算。新增诊断时写检测规则，**不要**硬编码本期的具体数值 —— 数据一更新就会失真。现有检测器见 `README.md` 的「诊断层的自动检测规则」。

---

## E. 快速抽查 —— ⚠️ 按需，默认不跑

> `daily_sync.py` 的自检是**逐格精确比对**（793 + 341 + 新增订单全量），比人工抽查严格得多。
> 本节只在用户质疑某个数字时才执行 —— 用来定位"用户看到的数和你算的数为什么不一样"。

必要时核对三个不同模块的值：

1. 总表中的某个部门询盘月度完成值。
2. 总表中的某位业务员月度完成值。
3. 南海国内中的某个月 PV/UV 或百度推广数据。

抽查值应同时出现在生成页面内嵌的 `dashboardData` JSON 中（在 HTML 里搜 `dashboardData =` 后的对象字面量）。

---

## F. 渲染与交互验证（DOM 探针，不出图）—— ⚠️ 按需，默认不跑

> **默认跳过。** 只有以下情况才执行本节：
> - 用户明确说「验证一下」「看看有没有报错」「检查前端」
> - 用户说「大屏有问题」但诊断层（C 节）看不出原因
> - 你**改动了 `build-dashboard.py` 里的 HTML/JS/CSS 模板**（改数据不动模板，不需要）
>
> 日常「数据更新了」**不要**跑本节。开了慢十倍，且没有新增信息 —— `daily_sync.py` 的自检已经保证数字正确。

### F.1 JS 语法检查（改模板后必跑，最便宜）

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('报表/营销中心数据大屏.html','utf8');
const i=h.lastIndexOf('<script>'),j=h.lastIndexOf('</script>');
try{new Function(h.slice(i+8,j));console.log('JS OK')}catch(e){console.log('JS 错误:',e.message)}"
```

### F.2 生成探针页面

用 `node -e` 把一个同步 IIFE 注入 `</body>` 前，写入 `<pre id="__probe">`。**必须用同步 IIFE**，不要用 `setTimeout` —— `--dump-dom` 不等待定时器。iframe 方式也不可行（file:// 下拿不到 contentDocument）。

**宽度/结构探针**（保存为 `_probe.html`）：

```javascript
const fs = require('fs');
let h = fs.readFileSync('报表/营销中心数据大屏.html', 'utf8');
const probe = `
<script>
(function(){
  var out = [];
  out.push('doc:' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight);
  out.push('view:' + window.innerWidth + 'x' + window.innerHeight);
  out.push('horizOverflow:' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
  out.push('canvasCount:' + document.querySelectorAll('canvas').length);
  out.push('canvasDims:' + Array.from(document.querySelectorAll('canvas')).map(c => c.width + 'x' + c.height).join(','));
  var overflow = Array.from(document.querySelectorAll('.card,.kpi,.alert,.cov-item,.callout,.chart'))
    .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.classList.contains('kpi')).length;
  out.push('overflowElements:' + overflow);
  ['departmentFilter','rangeFilter','themeButton'].forEach(id => {
    var e = document.getElementById(id);
    out.push('has#' + id + ':' + (e ? (e.tagName + (e.tagName === 'SELECT' ? '(' + e.options.length + ')' : '')) : 'missing'));
  });
  out.push('viewToggles:' + document.querySelectorAll('.view-toggle').length);
  var pre = document.createElement('pre');
  pre.id = '__probe';
  pre.style.cssText = 'position:fixed;top:0;left:0;background:#fff;color:#000;padding:8px;font:11px monospace;z-index:99999;max-width:100%;white-space:pre-wrap;';
  pre.textContent = out.join(' ;; ');
  document.body.appendChild(pre);
})();
</script>
`;
h = h.replace('</body>', probe + '</body>');
fs.writeFileSync('_probe.html', h);
```

**交互探针**（部门 / 期间筛选 + 主题 + view-toggle + 错误捕获）：

```javascript
const probe = `
<script>
(function(){
  var errs = [];
  window.addEventListener('error', e => errs.push(e.message));
  function snap(){ return Array.from(document.querySelectorAll('.kpi .kpi-value')).map(e => e.textContent.trim()); }
  var out = ['kpiBefore:' + snap().join(' / ')];
  var df = document.getElementById('departmentFilter');
  if (df) { df.value = '南海国际'; df.dispatchEvent(new Event('change')); out.push('kpiAfterDept:' + snap().join(' / ')); }
  var rf = document.getElementById('rangeFilter');
  if (rf) { rf.value = '6'; rf.dispatchEvent(new Event('change')); out.push('kpiAfterRange:' + snap().join(' / ')); }
  var tb = document.getElementById('themeButton');
  if (tb) { tb.click(); out.push('theme:' + document.documentElement.getAttribute('data-theme')); tb.click(); }
  var hits = [];
  Array.from(document.querySelectorAll('.view-toggle')).slice(0, 8).forEach((b, i) => {
    try { b.click(); hits.push((i+1) + ':' + (b.closest('.card')?.querySelector('h2')?.textContent?.slice(0, 14) || '?')); }
    catch (e) { hits.push((i+1) + ':err'); }
  });
  out.push('toggleHits:' + hits.join(' / '));
  out.push('errs:' + JSON.stringify(errs));
  var pre = document.createElement('pre');
  pre.id = '__probe';
  pre.style.cssText = 'position:fixed;top:0;left:0;background:#fff;color:#000;padding:8px;font:11px monospace;z-index:99999;max-width:100%;white-space:pre-wrap;';
  pre.textContent = out.join(' ;; ');
  document.body.appendChild(pre);
})();
</script>
`;
```

### F.3 跑 Chrome headless

```bash
'/c/Program Files/Google/Chrome/Application/chrome.exe' --headless=new --disable-gpu \
  --window-size=1920,1080 --virtual-time-budget=15000 --dump-dom \
  'file:///C:/Users/123/Desktop/%E5%B7%A5%E4%BD%9C/%E6%95%B0%E6%8D%AE%E6%8A%A5%E8%A1%A8/_probe.html'
```

宽度探针跑 3 档：**1920 / 1280 / 390**。交互探针 1 档（1920）即可。

**已知问题（2026-11-10 起）**：本机 headless Chrome 启动失败，报
`FATAL mojo platform_channel.cc:112 Check failed` / `crashpad OpenProcess: 拒绝访问 (0x5)`，
`--dump-dom` 返回空。三条规避方案，按顺序试：

1. 加 `--no-sandbox --disable-crash-reporter --user-data-dir="%TEMP%\cprof"` 再试
2. 用 `browser_navigate` 打开 `_probe.html`，再用 `browser_snapshot` 读 `#__probe` 节点的文本
3. 都失败就**如实说明"浏览器验证未完成"**，不要假装通过

> 这也是为什么日常不跑本节：它在本机本来就不稳定，跑一次大概率是白花时间。

### F.4 必须通过的硬指标

- `horizOverflow:false` 三档全过
- `canvasCount` 数量本次记录到 N 张，**下次若数量变化要在 memory 注明原因**（之前文档写 13 张，实际是 10 张，可能后续又合并或拆分）
- `overflowElements:0`（`.kpi` 因装饰圆恒有 24px 内溢出，是已知误报，已排除）
- `viewToggles:N` 数清卡片上「查看数据」按钮总数，**记录本次 N**（之前文档写 4 张，实际是 8-10 张）
- 交互探针：
  - 部门切换前后 KPI 中「销售业绩」应只显示该部门累计（如切到南海国际 → 3,549 万）
  - 期间切到 6 → 销售业绩应只显示 1-6 月累计
  - `errs:[]` 必须空数组
- 关键数字联动正确，且不出现分子分母口径混用（③④ 固定 1-N 月口径，只随部门变、不随时间变）

### F.5 清理

验证完删除 `_probe.html`：

```bash
rm -f _probe.html
```

提醒用户：`file://` 单文件 Chrome 缓存很重，下次打开 `营销中心数据大屏.html` 建议 **Ctrl+Shift+R** 强制刷新。

---

## G. 数据可视化规则

修改任何图表前先调用 `dataviz` Skill，并遵守：

- 禁止双 Y 轴；不同量纲使用小多图或首期=100 的指数图（先行指标链用的就是后者）。
- 单序列使用同一色相，不按排名循环换色；先行指标链按「投放端蓝 / 业务端橙 + 实虚线」成对编码。
- 多序列固定颜色，筛选后实体颜色不能变化。
- Tooltip 不是唯一读数方式，每张图表保留「查看数据」表格视图。
- 状态不能只靠颜色表达：未来月份必须有「未到期」文字语义，账户效率必须同时标注「高效/偏贵/亏效」文字。
- 不使用饼图展示接近数值；优先柱状图、趋势图或 KPI。

使用当前项目的三色分类色板：

- 浅色：`#2a78d6,#eb6834,#1baf7a`
- 深色：`#3987e5,#d95926,#199e70`

如果颜色有变化，运行 dataviz 的 `validate_palette.js` 分别验证浅色和深色，任何 FAIL 都必须修复。

---

## H. 今日新增业绩：谁涨了、涨多少、开了多少单 —— **每次同步必报**

用户 2026-11-10 明确要求，报告里必须有这一块。

### H.1 正确方法：两张**源透视表**相减，不要读 Excel 行差

```
今日新增(人) = tabulate(今天.xlsx, '负责人') − tabulate(上一期.xlsx, '负责人')
```

理由（这是踩过的坑，务必照做）：

- **Excel 行差不可靠**：完成行是按部门×人拆的，旧版把最新月份的值只写进了部门合计、业务员行留空/写未来列，导致「部门涨了 49 万，人却只涨 1 万」的自相矛盾。
- **源透视表是原始明细**，同一口径、同一筛选，相减得到的才是真实新增。
- `pivot_read.py` 已经提供 `tabulate(path, dimension)`，直接 import 用，**不要重写 pivotCache 解析器**（字段名带尾随空格、下单日期是月份数字、要排除研发和空日期，这些它都处理好了）。

上一期怎么找：`数据源/` 下按日期排序，取**今天之前的最近一张** `<M月D日>.xlsx`（文件名按月日，不是文件修改时间）。

```python
import sys
from pivot_read import tabulate

def cum(path, dim='负责人'):
    return {k: sum(v) for k, v in tabulate(path, dim, 12).items()}

a, b = cum(sys.argv[1]), cum(sys.argv[2])   # 上一期, 今天
for k in sorted(set(a) | set(b), key=lambda x: -(b.get(x, 0) - a.get(x, 0))):
    d = b.get(k, 0) - a.get(k, 0)
    if abs(d) >= 1:
        print('%-8s +%.2f 万' % (k, d / 10000))
```

### H.2 两个数字都要报，且要解释差异

| 口径 | 算法 | 含义 |
|---|---|---|
| **当月新增** | 今天源表 11 月合计 − 上期源表 11 月合计 | 本月新进的单 |
| **累计新增** | 两张表 `cum` 相减 | 含**历史月份补录/调整** |

两者不等时**必须说明差异来源**。典型情况：

- 某位销售的 9 月数字被回填（如刘九龙 134.99 万 → 134.32 万，少了 0.68 万）→ 累计增量 < 当月增量
- 某人当月新增 0 但累计涨了 → 老单补录，**不是今天开的新单**

### H.3 部门口径

同一个 `tabulate(path, '公司部门')` 相减。注意源表部门名是短名：`国际 / 国内 / 尚海 / 军品`，对应
`南海国际 / 南海国内 / 尚海国际 / 军工部`。

**马吉辉同时在 `国际` 和 `尚海` 两个部门**，按人报数时必须带部门，否则会重复计数。

### H.4 `新增订单` sheet 的定位

`新增订单` = **当月至今累计**（部门, 业务员, 元），**不是当日增量**。它只用于印证，不能当"今天开的单"报。

判断"这单是不是今天开的"：看该人**当月合计**的增量，不是看 `新增订单` 里有没有他。

### H.5 报告格式

```
📈 今日新增（11/3 → 11/10）
  范莉 · 南海国内      +17.4 万   ← 11月新单
  刘九龙 · 尚海国际    +14.4 万   ← 11月新单
  马吉辉 · 南海国际     +2.0 万
  魏玉萍 · 南海国际     +0.3 万
  程敏 · 南海国际       +0.3 万
  刘路 · 南海国内       +0.1 万
  ────────────────
  合计 +34.6 万（当月 11月 从 16 万 → 49 万）
```

- 单位用**万**，保留 1 位小数（源表是元，除以 10000）
- 按增量降序，只列有增量的
- 全都没涨就直说「本期间无新增订单」
- 若累计增量与当月增量差 > 1 万，加一行说明：「其中 X 万为历史月份补录，非今日新单」

---

## 完成报告

**默认只报 4 条，6-10 行说完，不要展开：**

0. **今日新增业绩**（H 节，必报）
1. 改了几格（`daily_sync.py` 输出的 `变更: 产品分析 X/793 格, 营销中心总览 Y/341 格, 新增订单 Z 格`）
2. 公司 + 各部门达成率（生成器已打印，直接摘抄）
3. 文件路径
4. `Ctrl+Shift+R` 强刷提醒

示例：

> 同步完成，共改动 42 格；大屏已重建，校验通过。
>
> - 公司 1-11 月 **12,588 / 15,000 万 = 83.9%**
> - 南海国内 117.4% · 南海国际 73.9% · 尚海国际 111.2% · 军工部 27.8%
>
> [营销中心数据大屏.html](报表/营销中心数据大屏.html) —— 打开前按 **Ctrl+Shift+R** 强制刷新。

**以下内容只在用户追问时才补充**：改了具体哪些单元格、业务员明细、空模块清单、dataNote 口径说明、DOM 探针结果。

如生成或同步失败，必须**原样说明失败步骤及错误**，不得声称已完成。
