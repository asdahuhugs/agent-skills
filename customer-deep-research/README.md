# 客户深度背调 (Customer Deep Research)

一个面向 AI Agent 的客户深度背景调查技能，融合了**专业背调模型**与**深度调研方法论**。

## 📦 整合来源

本skill由两个独立skill深度融合：

| 原skill | 贡献的核心能力 |
|---------|---------------|
| **Customer_background_check v1.2** | 6维度加权评分、降级方案矩阵、全球30+国家数据源、海关贸易验证、风控建议（付款/发货/合同）、Python脚本批处理 |
| **bruce-deep-research** | 三档调研模式（快速/标准/深度）、来源可信度分级（T1/T2/T3）、素材本地化沉淀、决策导向输出（执行摘要+置信度+下一步行动）、间接信号推断 |

## 🎯 项目亮点

- ✅ **完整的验证流程**：从基础验证到综合评估的7个阶段
- ✅ **降级方案矩阵**：每个验证步骤都有主方案、降级方案和兜底方案
- ✅ **置信度量化**：基于数据源可靠性的科学评分体系
- ✅ **来源可信度分级**：T1/T2/T3三级来源管理，🟢🟡🔴置信度标注
- ✅ **三档调研模式**：快速（1-2轮）/ 标准（3-4轮）/ 深度（5-8+轮）
- ✅ **全球数据源覆盖**：覆盖30+国家/地区的官方数据源
- ✅ **海关数据支持**：独立的海关贸易验证维度（权重20%）
- ✅ **风控策略建议**：根据风险等级给出具体风控建议（付款/发货/合同）
- ✅ **素材本地化沉淀**：所有搜索结果和页面全文存入 `research-assets/` 目录
- ✅ **Python脚本批处理**：10个辅助脚本，支持单客户和批量处理
- ✅ **中英双语支持**：完整的中英文文档

## 🚀 快速开始

### 作为 AI Agent Skill 使用

将本项目放入 Agent 的 skills 目录即可：

```
skills/
└── customer-deep-research/
    ├── SKILL.md                  # 主入口
    ├── SKILL_EN.md               # 英文入口
    ├── execution-guide.md        # 执行指南
    ├── risk-strategies.md        # 风控策略
    ├── data-sources.md           # 数据源配置
    ├── README.md                 # 项目说明（本文件）
    ├── references/               # 报告模板（10种）
    ├── scripts/                  # Python 辅助脚本（10个）
    ├── data/                     # 数据文件
    ├── cases/                    # 示例案例
    ├── templates/                # Excel 背调表模板
    └── research-assets/          # 素材沉淀目录
```

### 触发关键词

中文：背调、背景调查、背景调研、调研客户、客户验证
English: background check, due diligence, customer research, verify customer

### 输入示例

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

**批量客户**：Excel/CSV 文件，包含列：
- name, email, phone, company, country, products, order_amount

## 📊 核心模型

### 6 维度权重体系

| 维度 | 权重 | 说明 |
|------|------|------|
| 基础验证 | 15% | 邮箱 MX + 电话格式 |
| 公司查询 | 20% | 注册 + 状态 + 地址 |
| 人员关联 | 20% | 董事 / 股东 / 任职 |
| 数字资产 | 15% | 网站 + 社媒 + 电商 |
| 海关贸易 | 20% | 真实采购历史 ⭐ |
| 业务验证 | 10% | 采购合理性 |

### 风险等级

| 分数 | 等级 | 标识 |
|------|------|------|
| 80-100 | 低风险 | ✅ |
| 50-79 | 中风险 | ⚠️ |
| 20-49 | 无法核实 | ⚠️ |
| 0-19 | 高风险 | ❌ |

### 来源可信度

| 级别 | 标识 | 示例 |
|------|------|------|
| **T1** | 🟢 高置信 | 官方政府数据库、上市公司财报、海关付费数据 |
| **T2** | 🟡 中置信 | LinkedIn、知名媒体、WebFetch 成功的官网 |
| **T3** | 🔴 低置信 | 个人博客、论坛帖子、未署名内容 |

## 🛠️ 使用方式

### 方式 1：作为 Skill 自动触发

Agent 在对话中自动识别背调需求，按 SKILL.md 流程执行。

### 方式 2：手动调用 Python 脚本

```bash
# 安装依赖
pip install dnspython phonenumbers pandas openpyxl

# 单个客户
python scripts/batch_processor.py --input customer.json --output report.md

# 批量客户
python scripts/batch_processor.py --input customers.csv --output reports/

# 单个维度验证
python scripts/email_validator.py --email "customer@company.com" --company "ABC Ltd"
python scripts/phone_validator.py --phone "+44 20 1234 5678" --country UK
python scripts/company_lookup.py --country UK --company "ABC Trading Ltd"
python scripts/trade_checker.py --company "ABC Trading Ltd" --country UK
python scripts/risk_scorer.py --email 100 --company 80 --personnel 70
```

## 📁 项目结构

```
customer-deep-research/
├── README.md                    # 项目说明（本文件）
├── SKILL.md                     # 主入口（中英双语锚点）
├── SKILL_EN.md                  # 英文入口
├── execution-guide.md           # 执行指南（融合降级方案+工具策略）
├── risk-strategies.md           # 风控策略（中文）
├── risk-strategies_EN.md        # 风控策略（英文）
├── data-sources.md              # 数据源配置（中文）
├── data-sources_EN.md           # 数据源配置（英文）
├── references/                  # 报告模板
│   └── output-templates.md      # 10种报告模板（含客户背调专用）
├── scripts/                     # Python 辅助脚本
│   ├── email_validator.py
│   ├── phone_validator.py
│   ├── company_lookup.py
│   ├── domain_checker.py
│   ├── social_media_search.py
│   ├── ecommerce_checker.py
│   ├── trade_checker.py
│   ├── risk_scorer.py
│   ├── report_generator.py
│   ├── batch_processor.py
│   └── config.py
├── data/                        # 数据文件
│   ├── country_registry.json    # 13国官方数据源配置
│   ├── personal_email_domains.txt  # 150+ 个人邮箱域名
│   └── report_template.md       # 报告模板
├── cases/                       # 示例案例
│   └── 示例背调案例.md
├── templates/                   # Excel 背调表模板
│   └── 背调表模板说明.md
└── research-assets/             # 素材沉淀目录（每次背调自动生成）
    └── README.md                # 使用说明
```

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| `SKILL.md` | 主入口文件（中英双语） |
| `execution-guide.md` | 详细执行规范、工具策略、降级方案 |
| `risk-strategies.md` | 风控策略：付款/发货/合同条款 |
| `data-sources.md` | 全球 30+ 国家官方数据源 |
| `references/output-templates.md` | 10 种报告模板 |
| `templates/背调表模板说明.md` | Excel 背调表字段 |
| `cases/示例背调案例.md` | 5 个真实脱敏案例 |
| `research-assets/README.md` | 素材沉淀目录使用说明 |

## 🔄 整合前后对比

| 能力 | 原 CBC | 原 BDR | 整合后 |
|------|--------|--------|--------|
| 6 维度评分体系 | ✅ | ❌ | ✅ |
| 降级方案矩阵 | ✅ | ❌ | ✅ |
| 来源可信度分级 | ❌ | ✅ | ✅ |
| 素材本地化沉淀 | ❌ | ✅ | ✅ |
| 决策导向输出 | 部分 | ✅ | ✅ |
| 三档调研模式 | ❌ | ✅ | ✅ |
| 全球 30+ 国家数据源 | ✅ | ❌ | ✅ |
| 海关贸易独立验证 | ✅ | ❌ | ✅ |
| 风控建议（付款/合同） | ✅ | ❌ | ✅ |
| Python 脚本批处理 | ✅ | ❌ | ✅ |
| 中英双语支持 | ✅ | ❌ | ✅ |
| 间接信号推断 | ❌ | ✅ | ✅ |
| 10 种报告模板 | 1 种 | 10 种 | 10 种 + 背调专用 |

## 📝 版本信息

- **版本**: v2.0（融合版）
- **更新日期**: 2026-09-04
- **整合来源**:
  - Customer_background_check v1.2 (2026-04-18)
  - bruce-deep-research
- **主要更新**:
  1. 融合两个 skill：专业背调 + 深度调研方法论
  2. 引入三档调研模式（快速 / 标准 / 深度）
  3. 新增来源可信度分级（T1 / T2 / T3）
  4. 新增素材本地化沉淀（research-assets/）
  5. 报告输出采用决策导向（执行摘要 + 置信度 + 下一步行动）
  6. 保留 CBC 的 6 维度评分、降级方案、全球数据源、风控建议
  7. 完整保留 10 个 Python 脚本
  8. 中英双语支持

## 📄 许可证

MIT License
