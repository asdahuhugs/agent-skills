# 客户深度背调技能 (Customer Deep Research Skill)

[English Version](#english-version) | [中文版本](#中文版本)

> **整合来源**：本skill由 `Customer_background_check v1.2`（专业背调SOP）与 `bruce-deep-research`（深度调研方法论）融合而来，兼具专业深度与方法论灵活性。

<!--
本技能用于AI Agent执行客户深度背景调查，融合了：
1. 客户背调的专业维度模型（6维度加权评分）
2. 深度调研的方法论（规划→搜索→沉淀→反思→交付）
3. 全球数据源覆盖（30+国家官方注册机构）
4. 风控决策建议（付款/发货/合同条款）
-->

---

## 中文版本

### 项目简介

本项目是一套面向AI Agent的**客户深度背调框架**，融合两个核心能力：

- 🎯 **专业背调模型**：6维度加权评分（基础验证/公司/人员/数字资产/海关贸易/业务验证）+ 降级方案矩阵
- 🧭 **深度调研方法论**：规划→搜索→沉淀→反思→交付，五阶段闭环，素材本地化防丢失

提供：

- ✅ **完整的验证流程**：从基础验证到综合评估的7个阶段
- ✅ **降级方案矩阵**：每个验证步骤都有主方案、降级方案和兜底方案
- ✅ **置信度量化**：基于数据源可靠性的科学评分体系
- ✅ **来源可信度分级**：T1/T2/T3三级来源管理
- ✅ **全球数据源覆盖**：覆盖30+国家/地区的官方数据源
- ✅ **海关数据支持**：独立的海关贸易验证维度（权重20%）
- ✅ **风控策略建议**：根据风险等级给出具体风控建议（付款/发货/合同）
- ✅ **素材本地化沉淀**：调研过程所有引用来源存档可追溯
- ✅ **决策导向输出**：执行摘要+🟢🟡🔴置信度+下一步行动

---

### 快速开始

#### 作为AI Agent Skill使用

将此项目放入Agent的skills目录，Agent将自动识别：

```
skills/
└── customer-deep-research/
    ├── SKILL.md                  # 主入口文件
    ├── execution-guide.md        # 执行指南（融合降级方案+工具策略）
    ├── risk-strategies.md        # 风控策略
    ├── data-sources.md           # 数据源配置
    ├── references/               # 报告模板
    ├── scripts/                  # Python辅助脚本
    ├── data/                     # 数据文件
    ├── cases/                    # 示例案例
    ├── templates/                # Excel背调表模板
    └── research-assets/          # 素材沉淀目录（每次背调自动生成）
```

#### 触发条件

- 用户提供客户信息（姓名、邮箱、电话、公司、国家）
- 用户要求"背调"、"背景调查"、"背景调研"、"调研客户"
- 用户提供批量客户Excel/CSV文件

#### 输入示例

**单个客户**：
```json
{
  "name": "John Smith",
  "email": "john@company.com",
  "phone": "+44 20 1234 5678",
  "company": "ABC Trading Ltd",
  "country": "UK",
  "products": ["Electronics", "Machinery"],
  "order_amount": "$50,000"
}
```

**批量客户**：Excel/CSV文件，包含列：
- name, email, phone, company, country, products, order_amount

---

### 调研模式（三档可调）

| 模式 | 适用场景 | 搜索轮次 | 来源数量 | 报告深度 |
|------|----------|----------|----------|----------|
| **快速** | 单一事实核查（如：核实一个邮箱/公司是否存在） | 1–2 | 3–5 | 简化报告 |
| **标准** | 单一客户完整背调（一个客户的多维度验证） | 3–4 | 8–15 | 完整6维度报告 |
| **深度** | 战略客户/大额订单（多对象+多维度+深度海关+财务验证） | 5–8+ | 20–40+ | 深度报告+决策建议 |

**模式选择建议**：
- 默认使用**标准模式**（最常见的客户背调场景）
- 客户信息极简（如只有邮箱）→ **快速模式**先做基础验证
- 订单金额>$100K或战略合作客户 → **深度模式**

---

### 来源可信度分级（融合自BDR）

调研过程中，根据来源类型评估可信度：

**T1 高可信度**（🟢 高置信度，可直接引用）
- 官方政府数据库（Companies House、Handelsregister等）
- 上市公司财报、招股书、监管文件
- 官方网站（公司官网、产品页、定价页）
- 海关数据（ImportGenius、Panjiva等付费源）
- 权威信用机构（D&B、Experian）

**T2 较可信**（🟡 中置信度，建议交叉验证）
- 知名行业媒体（36kr、TechCrunch等）
- LinkedIn 公司主页（间接信号）
- Crunchbase、天眼查等企业信息平台
- WebFetch成功访问的官方网站
- WebSearch有效搜索结果

**T3 参考级**（🔴 低置信度，需多源交叉验证，不可单独作为结论依据）
- 个人博客、自媒体文章
- 论坛讨论、社区帖子
- 未署名或来源不明的内容
- 二手转载内容（需追溯原始出处）

**规则**：关键结论优先基于 T1 来源；仅有 T3 来源支撑的信息必须标注 🔴 低置信度。

---

### 工作流程（融合CBC 7阶段 + BDR方法论）

```
┌────────────────────────────────────────────────────────────────┐
│  第一阶段：规划（Plan）                                          │
│  - 解析客户信息，确定调研模式                                    │
│  - 推断缺失字段（公司/国家/身份类型）                             │
│  - 制定调研计划（核心问题+信息维度+输出形式）                     │
│  - 创建 research-assets/{客户名}-research/ 目录                 │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  第二阶段：搜索（Search）                                        │
│  - 工具选择：Brave→Tavily→web_fetch→browser                    │
│  - 按 CBC 6 维度分阶段执行（Phase 0-6）                          │
│  - 每步执行降级方案：主方案→降级1→降级2→兜底                    │
│  - 实时沉淀：搜索结果+页面全文存入本地素材文件                    │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  第三阶段：沉淀（Archive）                                       │
│  - 写入 sources/（页面全文）+ search-results/（搜索记录）        │
│  - 标注来源URL+抓取时间+内容类型                                 │
│  - 更新 notes.md（关键发现/矛盾点/待验证项）                     │
│  - 勾选 todo.md 进度                                            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  第四阶段：反思（Reflect）                                       │
│  - 自查清单：完整性/时效性/可信度/客观性                         │
│  - 发现缺口→回到第二阶段补救1-2次                               │
│  - 确认所有维度要么有充分信息，要么明确标注为数据缺口             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  第五阶段：交付（Deliver）                                       │
│  - 回读全部 sources/，提炼结论                                   │
│  - 撰写报告：执行摘要+维度评分+风控建议+下一步行动               │
│  - 输出至 research-assets/{客户名}-research/report.md           │
└────────────────────────────────────────────────────────────────┘
```

---

### CBC 6维度权重体系

| 维度 | 权重 | 说明 | 主要数据源 |
|------|------|------|-----------|
| 基础验证 | 15% | 验证联系方式有效性 | MX记录、电话解析 |
| 公司查询 | 20% | 确认公司存在性和状态 | 官方注册机构 |
| 人员关联 | 20% | 验证客户与公司的关系 | 董事数据库、LinkedIn |
| 数字资产 | 15% | 验证公司在线存在 | 官网、社交媒体、电商 |
| 海关贸易 | 20% | 验证真实采购历史 ⭐ | ImportGenius、Panjiva |
| 业务验证 | 10% | 评估业务合理性 | 综合推断 |

> **海关数据特殊处理**：当海关维度为"无数据"时，该维度权重自动重新分配到其他5个维度，不影响整体评分。

---

### CBC 7阶段执行流程

#### Phase 0: 信息预处理
- 解析客户信息，提取关键字段
- 根据邮箱域名推断公司名（如缺失）
- 根据电话区号推断国家（如缺失）
- 判断客户身份类型（采购商/贸易商/电商/美容院/批发商）

#### Phase 1: 基础验证（权重15%）
- 1.1 邮箱MX验证 → 1.2 邮箱类型判断 → 1.3 电话格式验证 → 1.4 电话国家匹配

#### Phase 2: 公司查询（权重20%）
- 2.1 公司注册查询 → 2.2 公司状态验证 → 2.3 注册地址比对

#### Phase 3: 人员关联（权重20%）
- 3.1 董事记录查询 → 3.2 姓名匹配 → 3.3 任职状态确认

#### Phase 4: 数字资产（权重15%）
- 4.1 公司网站验证 → 4.2 社交媒体验证 → 4.3 电商平台验证

#### Phase 5: 海关贸易验证（权重20%）⭐
- 5.1 进口记录查询 → 5.2 供应商分析 → 5.3 进口品类匹配

#### Phase 6: 业务验证（权重10%）
- 6.1 采购量合理性 → 6.2 产品匹配度 → 6.3 风险信号检测

#### Phase 7: 综合评估
- 7.1 评分计算 → 7.2 风险等级判定 → 7.3 风控建议生成

> 各阶段的详细执行规范、降级方案、置信度计算，详见 `execution-guide.md`。

---

### 工具选择策略（融合自BDR）

| 场景 | 工具 | 置信度 |
|------|------|--------|
| 找链接、查最新动态 | **Brave Search** | T2 |
| 读文章/博客/类型不确定 | **web_fetch** + `r.jina.ai/{URL}` 或 `defuddle.md/{URL}` | T1/T2 |
| 读结构化数据（API/JSON/RSS） | **web_fetch** 直接请求 | T1 |
| 需要多源综合答案 | **Tavily** `tavily_search`/`tavily_extract` | T2 |
| 复杂JS页面/公众号文章 | **browser** | T1 |
| 官方注册机构查询 | **web_fetch** + 国家数据源映射 | T1 |
| 批量数据处理 | **Python 脚本**（见 `scripts/`） | T1 |
| 邮件验证/MX记录 | `python scripts/email_validator.py` | T1 |
| 海关数据 | `python scripts/trade_checker.py` | T1 |

**使用原则**：先用轻量工具，必要时再升级。

---

### 风险等级判定

| 分数范围 | 风险等级 | 标识 | 建议 |
|----------|----------|------|------|
| 80-100 | 低风险 | ✅ | 正常合作，T/T 30%预付 |
| 50-79 | 中风险 | ⚠️ | 谨慎合作，T/T 50%预付或L/C |
| 20-49 | 无法核实 | ⚠️ | 限制合作，T/T 100%预付 |
| 0-19 | 高风险 | ❌ | 不建议合作或100%预付+担保 |

> 详细的风控策略（付款方式/发货策略/合同条款），详见 `risk-strategies.md`。

---

### 输出格式

#### 报告结构（融合BDR的决策导向 + CBC的评分体系）

```markdown
# [客户名] 客户深度背调报告

> **调研范围**：调研目的、信息截至日期
> **调研模式**：标准 / 深度

## 执行摘要
[3-5句话：客户是谁、核心机会或风险点、最终建议]

## 评分概览

| 维度 | 得分 | 权重 | 加权分 | 验证方式 | 置信度 |
|------|------|------|--------|----------|--------|
| 基础验证 | XX | 15% | XX | 主方案/降级1 | 🟢/🟡/🔴 |
| 公司查询 | XX | 20% | XX | 主方案/降级1 | 🟢/🟡/🔴 |
| 人员关联 | XX | 20% | XX | 主方案/降级1 | 🟢/🟡/🔴 |
| 数字资产 | XX | 15% | XX | 主方案/降级1 | 🟢/🟡/🔴 |
| 海关贸易 | XX | 20% | XX | 主方案/降级1 | 🟢/🟡/🔴 |
| 业务验证 | XX | 10% | XX | 主方案/降级1 | 🟢/🟡/🔴 |

**综合评分**：XX/100
**风险等级**：✅ 低风险 / ⚠️ 中风险 / ❌ 高风险

## 详细验证结果
[按 Phase 1-6 展开，每个维度含验证内容、来源、置信度]

## 关键发现
- 🟢 [高置信结论]
- 🟡 [中置信结论]
- 🔴 [低置信结论或数据缺口]

## 风控建议
- **付款方式**：[具体建议]
- **发货策略**：[具体建议]
- **合同条款**：[需要增加的条款]

## 下一步行动
1. [具体行动项]
2. ...

## 数据缺口
[未能核实的信息，附建议补充渠道]

## 信息来源
- [来源标题](research-assets/{客户名}-research/sources/01-xxx.md)（原始URL，访问日期）

---
*背调工具版本: v2.0*
*调研人员: AI Agent*
```

---

### 素材沉淀结构（融合自BDR）

每次**标准/深度**背调会在 `research-assets/` 下生成独立目录：

```
research-assets/
└── {客户名}-research/
    ├── search-results/           # 搜索结果原始记录
    │   ├── brave-01-{关键词}.md
    │   ├── tavily-01-{关键词}.md
    │   └── ...
    ├── sources/                  # 抓取的完整页面内容
    │   ├── 01-companies-house.md
    │   ├── 02-linkedin-profile.md
    │   └── ...
    ├── notes.md                  # 调研笔记（关键发现、矛盾点）
    ├── todo.md                   # 调研计划与进度
    └── report.md                 # 最终报告
```

**快速模式**：不创建目录，直接作答。如有复用价值，用户可要求追加保存。

---

### Python脚本使用（保留CBC完整能力）

```bash
# 安装依赖
pip install dnspython phonenumbers pandas openpyxl

# 单个客户验证
python scripts/batch_processor.py --input customer.json --output report.md

# 批量验证
python scripts/batch_processor.py --input customers.csv --output reports/

# 单个维度验证
python scripts/email_validator.py --email "customer@company.com" --company "ABC Ltd"
python scripts/phone_validator.py --phone "+44 20 1234 5678" --country UK
python scripts/company_lookup.py --country UK --company "ABC Trading Ltd"
python scripts/trade_checker.py --company "ABC Trading Ltd" --country UK
python scripts/risk_scorer.py --email 100 --company 80 --personnel 70
```

---

### 错误处理与降级

每个验证步骤的降级流程：

```
主方案 → 降级方案1 → 降级方案2 → 兜底方案
  1.0       0.8         0.5       0.0
```

| 错误类型 | 处理方式 |
|----------|----------|
| WebFetch被拦截 | 自动降级到WebSearch或browser |
| WebSearch无结果 | 尝试不同关键词组合、中英文切换 |
| Python脚本失败 | 回退到手动验证逻辑 |
| 数据源不可访问 | 切换备选数据源 |
| 信息不足 | 标记"待核实"，建议客户提供补充材料 |

---

### 核心工作原则

- **先规划再搜索**：花1分钟规划，省5分钟乱搜（BDR）
- **追溯一手来源**：优先官方数据库，避免转载内容
- **边搜边沉淀**：每个有价值的来源立即存文件，不堆到最后
- **每条信息标注来源**：有URL和日期才有价值
- **空白也是结论**：找不到的信息清晰标注，比沉默更有帮助
- **永不阻塞**：任何验证失败都不应阻止整体流程
- **量化置信**：通过置信度系数反映数据可靠性
- **决策导向**：每个报告都要连接回用户的实际决策

---

### 核心特性对比：整合前后

| 能力 | 原CBC | 原BDR | 整合后 |
|------|-------|-------|--------|
| 6维度评分体系 | ✅ | ❌ | ✅ |
| 降级方案矩阵 | ✅ | ❌ | ✅ |
| 来源可信度分级 | ❌ | ✅ | ✅ |
| 素材本地化沉淀 | ❌ | ✅ | ✅ |
| 决策导向输出 | 部分 | ✅ | ✅ |
| 三档调研模式 | ❌ | ✅ | ✅ |
| 全球30+国家数据源 | ✅ | ❌ | ✅ |
| 海关贸易独立验证 | ✅ | ❌ | ✅ |
| 风控建议（付款/合同） | ✅ | ❌ | ✅ |
| Python脚本批处理 | ✅ | ❌ | ✅ |
| 中英双语支持 | ✅ | ❌ | ✅ |
| 间接信号推断 | ❌ | ✅ | ✅ |
| 10种报告模板 | 1种 | 10种 | 10种+背调专用 |

---

### 相关文档

| 文档 | 说明 |
|------|------|
| `execution-guide.md` | 详细执行规范、降级方案矩阵、置信度计算 |
| `risk-strategies.md` | 风控策略：付款/发货/合同条款（按风险等级） |
| `data-sources.md` | 全球30+国家官方数据源配置 |
| `references/output-templates.md` | 10种报告模板（含客户背调专用模板） |
| `templates/背调表模板说明.md` | Excel背调表字段说明 |
| `cases/示例背调案例.md` | 5个真实脱敏案例分析 |
| `scripts/` | 10个Python辅助脚本 |
| `data/` | 国家注册表、个人邮箱域名列表、报告模板 |
| `research-assets/README.md` | 素材沉淀目录使用说明 |

---

## English Version

### Project Overview

This is a comprehensive **Customer Deep Research Framework** for AI Agents, integrating two powerful capabilities:

- 🎯 **Professional Background Check Model**: 6-dimension weighted scoring + fallback strategy matrix
- 🧭 **Deep Research Methodology**: Plan → Search → Archive → Reflect → Deliver

**Features**:
- ✅ Complete verification workflow (7 phases)
- ✅ Fallback strategy matrix (primary → fallback1 → fallback2 → last resort)
- ✅ Quantified confidence scoring
- ✅ Source credibility grading (T1/T2/T3)
- ✅ Global data sources (30+ countries)
- ✅ Customs trade verification (independent 20% weight dimension)
- ✅ Risk control recommendations (payment/shipping/contract)
- ✅ Local material archiving (prevent context loss)
- ✅ Decision-oriented output (executive summary + confidence + next steps)

---

### Trigger Conditions

- User provides customer information (name, email, phone, company, country)
- User requests "background check", "due diligence", or "research this customer"
- User provides batch customer Excel/CSV file

### Research Modes

| Mode | Use Case | Search Rounds | Sources | Report Depth |
|------|----------|---------------|---------|--------------|
| **Quick** | Single fact check (e.g., verify email/domain exists) | 1–2 | 3–5 | Simplified |
| **Standard** | Single customer full background check | 3–4 | 8–15 | Complete 6-dimension |
| **Deep** | Strategic customer / large orders ($100K+) | 5–8+ | 20–40+ | Deep + financial |

**Default**: Standard mode for most customer background checks.

---

### 6-Dimension Weight System

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Basic Verification | 15% | Email MX + phone validation |
| Company Lookup | 20% | Registration + status + address |
| Personnel Association | 20% | Director/shareholder records |
| Digital Assets | 15% | Website + social media + e-commerce |
| Customs Trade | 20% | Real procurement history ⭐ |
| Business Verification | 10% | Procurement rationality |

> When customs data is unavailable, its weight is automatically redistributed to other 5 dimensions.

---

### Risk Levels

| Score | Risk Level | Symbol | Recommendation |
|-------|------------|--------|----------------|
| 80-100 | Low Risk | ✅ | Standard cooperation, T/T 30% prepayment |
| 50-79 | Medium Risk | ⚠️ | Cautious cooperation, T/T 50% or L/C |
| 20-49 | Unverifiable | ⚠️ | Restricted, T/T 100% prepayment required |
| 0-19 | High Risk | ❌ | Not recommended or 100% prepayment + guarantee |

---

### Material Archive Structure (from BDR)

```
research-assets/
└── {customer-name}-research/
    ├── search-results/           # Raw search records
    ├── sources/                  # Full page contents
    ├── notes.md                  # Research notes
    ├── todo.md                   # Research plan & progress
    └── report.md                 # Final report
```

---

### Python Scripts Usage

```bash
pip install dnspython phonenumbers pandas openpyxl

# Single customer
python scripts/batch_processor.py --input customer.json --output report.md

# Batch customers
python scripts/batch_processor.py --input customers.csv --output reports/
```

---

### Version Info

- **Version**: v2.0 (Integrated)
- **Release Date**: 2026-09-04
- **Inheritance**: Customer_background_check v1.2 + bruce-deep-research
- **Major Updates**:
  1. 融合两个skill：专业背调+深度调研方法论
  2. 引入三档调研模式（快速/标准/深度）
  3. 新增来源可信度分级（T1/T2/T3）
  4. 新增素材本地化沉淀（research-assets/）
  5. 报告输出采用决策导向（执行摘要+置信度+下一步行动）
  6. 保留CBC的6维度评分、降级方案、全球数据源、风控建议
  7. 中英双语支持

---

### License

MIT
