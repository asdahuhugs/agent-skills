# 执行指南 (Execution Guide)

本文档融合了客户背调的7阶段流程与深度调研方法论，提供完整的执行规范、工具选择策略、降级方案矩阵和置信度计算方法。

---

## 一、核心原则

1. **永不阻塞**：任何验证失败都不应阻止整体流程继续执行
2. **记录状态**：每个步骤的执行方式和结果必须被记录
3. **量化置信**：通过置信度系数反映数据的可靠性
4. **可追溯**：每个判断都有明确的依据和来源（本地素材+原始URL）
5. **先规划再搜索**：花1分钟规划，省5分钟乱搜
6. **边搜边沉淀**：每个有价值的来源立即存文件

---

## 二、调研规划阶段

### 2.1 模式选择

| 模式 | 搜索轮次 | 来源数量 | 适用场景 |
|------|----------|----------|----------|
| 快速 | 1–2 | 3–5 | 单一事实核查（邮箱是否存在、公司是否注册） |
| 标准 | 3–4 | 8–15 | 单一客户完整背调（默认） |
| 深度 | 5–8+ | 20–40+ | 战略客户、大额订单、需深度海关+财务验证 |

### 2.2 创建研究计划

进入 `research-assets/{客户名}-research/`，创建 `todo.md`：

```markdown
# 调研计划：{客户名}

## 调研目标
[一句话说清楚要搞清楚什么]

## 调研模式
标准 / 深度

## 核心问题
1. [客户身份真实吗？]
2. [公司与客户关联是否成立？]
3. [公司业务规模与订单匹配吗？]
4. [是否有过真实采购记录？]
5. [有无风险信号？]

## 信息维度
- 基础验证（邮箱/电话）
- 公司查询（注册/状态/地址）
- 人员关联（董事/股东）
- 数字资产（网站/社媒/电商）
- 海关贸易（进口记录/供应商）
- 业务验证（合理性/匹配度）

## 输出形式
标准背调报告（含执行摘要+评分+风控建议）

## 进度追踪
- [ ] Phase 1: 基础验证
- [ ] Phase 2: 公司查询
- [ ] Phase 3: 人员关联
- [ ] Phase 4: 数字资产
- [ ] Phase 5: 海关贸易
- [ ] Phase 6: 业务验证
- [ ] Phase 7: 综合评估
```

---

## 三、工具选择策略

### 3.1 工具决策表

| 场景 | 工具 | 置信度 |
|------|------|--------|
| 找链接、查最新动态 | **Brave Search** | T2 |
| 读文章/博客/类型不确定 | **web_fetch** + `r.jina.ai/{URL}` | T1/T2 |
| 读结构化数据（API/JSON/RSS） | **web_fetch** 直接请求 | T1 |
| 需要多源综合答案 | **Tavily** `tavily_search` | T2 |
| 复杂JS页面/公众号 | **browser** | T1 |
| 官方注册机构查询 | **web_fetch** + 国家数据源映射 | T1 |
| 邮件验证/MX记录 | `python scripts/email_validator.py` | T1 |
| 电话验证 | `python scripts/phone_validator.py` | T1 |
| 海关数据 | `python scripts/trade_checker.py` | T1 |
| 批量评分 | `python scripts/risk_scorer.py` | - |

### 3.2 工具升级路径

```
Brave Search（找链接）
    ↓
web_fetch（读全文，URL拼接r.jina.ai或defuddle.md前缀）
    ↓
Tavily extract（备选抓取或多源综合）
    ↓
browser（复杂JS、需交互的页面）
```

### 3.3 已有URL的读取优先级

1. 文章/博客/新闻 → `web_fetch + r.jina.ai/{URL}` → `defuddle.md/{URL}` → `browser`
2. API/JSON/RSS → `web_fetch` 直接请求
3. 公众号/复杂JS → `browser`

---

## 四、Phase 1: 基础验证（权重15%）

### 4.1 邮箱MX验证

| 方案级别 | 执行方式 | 置信度 | 失败条件 |
|----------|----------|--------|----------|
| **主方案** | `python scripts/email_validator.py --email {email}` | 1.0 | 脚本失败/无返回 |
| **降级1** | WebSearch "email domain MX record" | 0.6 | 无搜索结果 |
| **降级2** | 正则验证邮箱格式 | 0.5 | 格式不匹配 |
| **兜底** | 标记"MX未验证" | 0.0 | - |

**执行命令**：
```bash
python scripts/email_validator.py --email "customer@company.com" --company "ABC Ltd"
```

### 4.2 邮箱类型判断

| 类型 | 判断依据 | 示例 |
|------|----------|------|
| 企业邮箱 | 域名不在个人邮箱列表 | name@company.com |
| 个人邮箱 | 域名在个人邮箱列表（见 `data/personal_email_domains.txt`） | name@gmail.com |
| 临时邮箱 | 域名在临时邮箱列表 | name@tempmail.com |

### 4.3 电话格式验证

| 方案级别 | 执行方式 | 置信度 |
|----------|----------|--------|
| **主方案** | `python scripts/phone_validator.py --phone {phone} --country {country}` | 1.0 |
| **降级1** | 正则匹配国家格式 | 0.6 |
| **降级2** | 仅验证数字长度和区号 | 0.4 |
| **兜底** | 标记"格式未验证" | 0.0 |

### 4.4 电话国家匹配

| 结果 | 说明 | 风险信号 |
|------|------|----------|
| 完全匹配 | 区号与声称国家一致 | 无 |
| 不匹配 | 区号与声称国家不一致 | ⚠️ 需核实 |
| 无法判断 | 无法解析区号 | 待确认 |

---

## 五、Phase 2: 公司查询（权重20%）

### 5.1 公司注册查询

| 方案级别 | 执行方式 | 置信度 |
|----------|----------|--------|
| **主方案** | `python scripts/company_lookup.py --country {country} --company {company}` | 1.0 |
| **降级1** | web_fetch + 官方注册机构URL（见 `data-sources.md`） | 1.0 |
| **降级2** | WebSearch "公司名 + 国家 + company register" | 0.6 |
| **兜底** | 标记"待人工核实"，建议客户提供注册号 | 0.0 |

**国家数据源映射**（完整列表见 `data-sources.md`）：

| 国家 | 官方数据源 | URL |
|------|-----------|-----|
| 英国 | Companies House | find-and-update.company-information.service.gov.uk |
| 法国 | societe.com / API Recherche Entreprises | societe.com |
| 美国 | Secretary of State（各州） | varies by state |
| 德国 | Handelsregister / Bundesanzeiger | unternehmensregister.de |
| 澳大利亚 | ASIC | connectonline.asic.gov.au |
| 瑞典 | Bolagsverket / Allabolag | allabolag.se |
| 日本 | 国税庁 | houjin-bangou.nta.go.jp |
| 加拿大 | Corporations Canada | ic.gc.ca |

### 5.2 公司状态风险等级

| 状态 | 风险等级 | 说明 |
|------|----------|------|
| Active | ✅ 低风险 | 公司正常运营 |
| Dissolved | ❌ 高风险 | 公司已注销 |
| Liquidation | ❌ 高风险 | 公司清算中 |
| Dormant | ⚠️ 中风险 | 公司休眠 |
| In Administration | ❌ 高风险 | 公司被接管 |

### 5.3 注册地址比对

- 匹配度 > 0.8 → "地址匹配"
- 匹配度 0.5-0.8 → "地址部分匹配"
- 匹配度 < 0.5 → "地址不匹配" ⚠️

---

## 六、Phase 3: 人员关联（权重20%）

### 6.1 董事记录查询

| 方案级别 | 执行方式 | 置信度 |
|----------|----------|--------|
| **主方案** | web_fetch 官方董事数据库 | 1.0 |
| **降级1** | WebSearch "姓名 + director + 公司名" | 0.5 |
| **降级2** | LinkedIn搜索 姓名+公司职位 | 0.4 |
| **兜底** | 标记"待客户提供证明" | 0.0 |

**有官方董事数据库的国家**：英国、澳大利亚、新西兰、香港、新加坡

### 6.2 姓名匹配规则

```
匹配算法:
1. 完全匹配: "John Smith" = "John Smith" (得分=100)
2. 简写匹配: "J. Smith" ≈ "John Smith" (得分=80)
3. 包含匹配: "John Smith" contains "John" (得分=70)
4. 模糊匹配: 编辑距离/余弦相似度 (得分=相似度×100)

多语言处理:
- 中文: 张伟 → 拼音: Zhang Wei / W. Zhang
- 使用拼音转换库匹配
```

---

## 七、Phase 4: 数字资产（权重15%）

### 7.1 公司网站验证

| 方案级别 | 执行方式 | 置信度 |
|----------|----------|--------|
| **主方案** | `python scripts/domain_checker.py --domain {domain}` | 1.0 |
| **降级1** | web_fetch 官网 + r.jina.ai 前缀 | 0.7 |
| **降级2** | WebSearch "公司名 官网" | 0.5 |
| **兜底** | 标记"无网站" | 0.0 |

### 7.2 社交媒体验证

执行 `python scripts/social_media_search.py --name "{name}" --company "{company}"`

| 平台 | 验证内容 |
|------|----------|
| LinkedIn | 公司主页、员工数量 |
| Facebook | 主页、粉丝数、互动 |
| Instagram | 账号活跃度 |

### 7.3 电商平台验证

执行 `python scripts/ecommerce_checker.py --company "{company}"`

适用：贸易商/零售商客户，验证 Amazon/eBay/Alibaba/Etsy 店铺

---

## 八、Phase 5: 海关贸易验证（权重20%）⭐

### 8.1 进口记录查询

| 方案级别 | 执行方式 | 置信度 |
|----------|----------|--------|
| **主方案** | `python scripts/trade_checker.py --company {company} --country {country}` | 1.0 |
| **降级1** | ImportGenius/Panjiva付费数据 | 1.0 |
| **降级2** | Tradesparq免费查询 | 0.7 |
| **降级3** | WebSearch "公司名 + import + 产品" | 0.4 |
| **兜底** | 标记"无海关数据" | N/A |

### 8.2 海关数据特殊处理

```
当海关数据维度为"无数据"时:
1. 该维度不参与评分
2. 权重自动重新分配:
   - 基础验证: 15% → 18%
   - 公司查询: 20% → 24%
   - 人员关联: 20% → 24%
   - 数字资产: 15% → 18%
   - 业务验证: 10% → 16%
3. 不影响其他维度评分

注意：无海关数据 ≠ 风险（仅表示无进口记录）
```

### 8.3 进口品类匹配

```
匹配度 = 匹配产品数 / 兴趣产品总数
- 完全匹配 (>80%): 客户进口过同类产品
- 部分匹配 (50-80%): 客户进口过相关产品
- 低匹配 (<50%): 客户未进口过类似产品 ⚠️
```

---

## 九、Phase 6: 业务验证（权重10%）

### 9.1 采购量合理性

```
异常采购量 = 实际采购量 / 公司规模基准采购量

if 异常采购量 > 3:
    风险 = "采购量异常偏高" ❌
elif 异常采购量 > 2:
    风险 = "采购量偏高" ⚠️
else:
    风险 = "采购量合理" ✅
```

### 9.2 风险信号检测清单（每项+10风险分）

```
□ 公司成立时间 < 1年
□ 注册地址为住宅/虚拟办公室
□ 无企业邮箱（使用Gmail/Yahoo等）
□ 电话区号与声称国家不匹配
□ 公司状态非Active
□ 客户名不在董事名单
□ 无公司网站
□ 采购量与公司规模不匹配
□ 兴趣产品与公司业务不相关
□ 拒绝提供公司注册信息
```

---

## 十、Phase 7: 综合评估

### 10.1 评分计算

```
总分 = Σ (维度得分 × 维度权重)

维度得分 = Σ (子项得分 × 置信度系数) / 子项数量

置信度系数:
- 主方案成功: 1.0
- 降级1成功: 0.8
- 降级2成功: 0.6
- 兜底方案: 0.3
- 完全失败: 0.0
```

### 10.2 置信度计算

```
维度置信度 = 数据源可靠性系数 × 验证深度系数

数据源可靠性系数:
- 官方数据库直接访问: 1.0
- 官方数据库API: 0.9
- 第三方付费API: 0.8
- WebFetch成功: 0.7
- WebSearch: 0.6
- 推断/猜测: 0.3

验证深度系数:
- 完整验证: 1.0
- 部分验证: 0.7
- 仅存在性确认: 0.5
```

### 10.3 风险等级判定

| 分数 | 等级 | 标识 |
|------|------|------|
| 80-100 | 低风险 | ✅ |
| 50-79 | 中风险 | ⚠️ |
| 20-49 | 无法核实 | ⚠️ |
| 0-19 | 高风险 | ❌ |

### 10.4 执行脚本

```bash
python scripts/risk_scorer.py --email 100 --company 80 --personnel 70 --digital 60 --trade 90
```

---

## 十一、质量反思与补救

### 11.1 自查清单

**完整性**：
- todo.md 里所有 Phase 都覆盖了吗？
- 海关数据是否尝试过？
- 关键关联证据是否有至少2个来源支撑？

**时效性**：
- 公司状态是否最新（建议30天内）？
- 网站是否可访问？
- 关键数据点是否标注日期？

**可信度**：
- 是否优先使用了 T1 来源？
- 仅有 T3 来源支撑的结论是否标注了 🔴？

**客观性**：
- 优势/风险是否公平评估？
- 事实和观点是否清晰区分？

### 11.2 发现缺口后的补救

1. **定位缺口**：是哪个维度缺信息？
2. **回到搜索阶段**：使用不同关键词或工具
3. **补充素材**：写入 sources/，更新 notes.md
4. **再次自查**：只检查刚才补救的维度
5. **判断终止**：所有维度要么充分，要么明确标注为缺口

---

## 十二、报告撰写

### 12.1 整体回读素材

撰写前必须回读：
- `sources/`（所有页面全文）
- `notes.md`（关键发现）
- `todo.md`（确认所有维度已覆盖）

### 12.2 引用规范

每个关键事实用脚注引用本地素材+原始URL：
```
该公司 2024 年完成 B 轮融资[^1]。

[^1]: [research-assets/xxx-research/sources/03-crunchbase.md](research-assets/xxx-research/sources/03-crunchbase.md)（原始来源：https://...）
```

### 12.3 输出决策导向报告

报告必须包含：
- ✅ 执行摘要（30秒抓住核心结论）
- ✅ 评分概览表（含置信度标注）
- ✅ 详细验证结果（按 Phase 1-6）
- ✅ 风控建议（付款/发货/合同）
- ✅ 下一步行动（具体可执行）
- ✅ 数据缺口（未核实部分）
- ✅ 信息来源（可追溯）

---

## 十三、错误处理

### 13.1 WebFetch拦截
1. 检测拦截类型（Cloudflare、地区限制、登录要求）
2. 自动降级：WebSearch → browser
3. 记录"主方案失败: 网站拦截"

### 13.2 WebSearch无结果
1. 尝试不同关键词组合
2. 中英文切换
3. 搜索公司名/曾用名/创始人名
4. 加 `site:` 限定

### 13.3 Python脚本失败
1. 检查错误类型（库未安装/网络/格式）
2. 回退到手动验证逻辑
3. 标记"待人工核实"

### 13.4 信息不足
- 标记"待核实"
- 建议客户提供补充材料
- 在报告中明确标注为数据缺口

---

## 十四、执行日志规范

每次验证记录：

```json
{
  "timestamp": "2026-09-04T10:30:00Z",
  "customer": "ABC Trading Ltd",
  "phase": "Phase 2: Company Lookup",
  "sub_item": "Company Registry Query",
  "method_used": "Primary",
  "method_detail": "WebFetch Companies House",
  "success": true,
  "confidence": 1.0,
  "source_credibility": "T1",
  "result_summary": "Company found, status Active",
  "fallback_triggered": false,
  "source_file": "sources/01-companies-house.md",
  "error_message": null
}
```

---

## 十五、版本信息

- 版本: v2.0（融合版）
- 更新日期: 2026-09-04
- 整合来源: Customer_background_check v1.2 + bruce-deep-research
