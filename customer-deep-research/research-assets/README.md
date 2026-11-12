# 素材沉淀目录 (Research Assets Directory)

本目录用于沉淀客户背调过程中的所有参考材料，防止上下文窗口压缩丢失信息，并确保报告引用可追溯。

---

## 一、何时使用

执行**标准模式**或**深度模式**的客户背调时，必须在本目录下创建以**客户名命名**的子目录。

**快速模式**：不创建目录，直接作答。如有复用价值，用户可要求追加保存。

---

## 二、目录结构

```
research-assets/
└── {客户名}-research/          # 客户名建议用拼音/英文，避免空格和特殊字符
    ├── search-results/          # 搜索结果原始记录（每次搜索一个文件）
    │   ├── brave-01-{关键词}.md
    │   ├── brave-02-{关键词}.md
    │   ├── tavily-01-{关键词}.md
    │   └── ...
    ├── sources/                 # 抓取的完整页面内容（一个来源一个文件）
    │   ├── 01-{来源简称}.md
    │   ├── 02-{来源简称}.md
    │   └── ...
    ├── notes.md                 # 调研笔记：关键发现、矛盾点、待验证项
    ├── todo.md                  # 调研计划与进度
    └── report.md                # 最终报告
```

---

## 三、文件格式规范

### 3.1 搜索结果文件（`search-results/brave-01-xxx.md`）

每次 Brave/Tavily 搜索后**立即**写入：

```markdown
# 搜索记录：{关键词}

- **搜索工具**：Brave / Tavily
- **搜索时间**：2026-09-04
- **查询语句**：ABC Trading Ltd UK company register
- **来源可信度**：T2

## 搜索结果

1. **ABC TRADING LTD overview**
   - URL：https://find-and-update.company-information.service.gov.uk/company/12345678
   - 摘要：Company number 12345678, Active company...
   - 是否已抓取全文：是 → `sources/01-companies-house.md`
   - 来源可信度：T1（官方）

2. **ABC Trading Ltd LinkedIn**
   - URL：https://linkedin.com/company/abc-trading
   - 摘要：Wholesale of household goods...
   - 是否已抓取全文：是 → `sources/02-linkedin.md`
   - 来源可信度：T2

3. **相关行业新闻（不相关）**
   - URL：https://...
   - 摘要：...
   - 是否已抓取全文：否（价值低，与客户不直接相关）
```

### 3.2 素材文件（`sources/01-companies-house.md`）

web_fetch / browser 抓取全文后**立即**写入：

```markdown
# ABC Trading Ltd - Companies House 注册信息

- **来源 URL**：https://find-and-update.company-information.service.gov.uk/company/12345678
- **抓取方式**：web_fetch + r.jina.ai 前缀
- **抓取时间**：2026-09-04
- **来源可信度**：T1（官方政府数据库）
- **置信度系数**：1.0

## 关键信息摘要

- **公司名称**：ABC TRADING LTD
- **公司号**：12345678
- **公司状态**：Active ✅
- **成立日期**：2021-03-15
- **注册地址**：123 Business Park, London, UK
- **业务类型**：Wholesale of household goods
- **董事**：John Smith（2021-至今）、Mary Johnson（2022-至今）

## 原文要点

[直接从原文中摘录最有价值的段落，可包含HTML结构、表格等]

## 风险信号

- 无明显风险信号
- 公司成立时间>3年 ✅
- 状态正常 ✅
```

### 3.3 调研笔记（`notes.md`）

实时记录关键发现和矛盾点：

```markdown
# 调研笔记：ABC Trading Ltd

## 关键发现

### 高置信结论（🟢 T1来源）
- 公司在英国Companies House注册，状态Active（来源01）
- 客户John Smith为公司现任董事（来源01）
- 企业邮箱域名与公司名匹配（来源01）

### 中置信结论（🟡 T2来源）
- LinkedIn公司页显示20-50名员工（来源02）
- 公司在Amazon有店铺，评分4.5/5（来源03）

### 矛盾点
- 无明显矛盾

## 待验证项
- [ ] 海关进口记录（待查 ImportGenius）
- [ ] 是否有其他同名公司干扰

## 风险信号
- 无重大风险信号
- 公司规模与订单金额匹配
```

### 3.4 调研计划（`todo.md`）

```markdown
# 调研计划：ABC Trading Ltd

## 调研目标
核实客户John Smith及其公司ABC Trading Ltd的真实性和业务规模

## 调研模式
标准

## 核心问题
1. [x] 公司是否真实注册？
2. [x] 客户是否为公司董事？
3. [x] 联系方式是否有效？
4. [x] 公司业务规模？
5. [ ] 海关进口记录？
6. [ ] 是否存在风险信号？

## 进度追踪
- [x] Phase 1: 基础验证（邮箱MX+电话）
- [x] Phase 2: 公司查询（Companies House）
- [x] Phase 3: 人员关联（董事记录）
- [x] Phase 4: 数字资产（网站+LinkedIn）
- [ ] Phase 5: 海关贸易
- [ ] Phase 6: 业务验证
- [ ] Phase 7: 综合评估
```

---

## 四、存储时机（关键）

- ✅ 每次搜索完成后，**立即**写入 search-results/
- ✅ 每抓取一个页面全文后，**立即**写入 sources/
- ❌ 不要等所有搜索都完成再批量写入
- ⚠️ 中途上下文可能被压缩，延迟写入会丢失信息

---

## 五、报告引用规范

在最终报告 `report.md` 中引用素材：

```markdown
该公司2021年3月在英国注册成立[^1]，目前状态为Active。

[^1]: [research-assets/ABC-research/sources/01-companies-house.md](research-assets/ABC-research/sources/01-companies-house.md)
     （原始来源：https://find-and-update.company-information.service.gov.uk/company/12345678，访问日期：2026-09-04）
```

引用同时保留本地路径和原始URL，方便：
1. 用户追溯一手来源
2. 本地直接查看素材全文
3. 后续补充调研时有据可查

---

## 六、清理与归档

调研完成后：
- 保留 research-assets/{客户名}-research/ 目录作为长期档案
- 客户合作成交后，归档到 `closed-deals/` 子目录
- 客户流失后，归档到 `rejected-leads/` 子目录（供后续参考）

```
research-assets/
├── ABC-research/           # 当前进行中
├── closed-deals/
│   └── XYZ-research/       # 已成交客户
└── rejected-leads/
    └── Marie-research/     # 已拒绝客户
```

---

## 七、版本信息

- 版本: v2.0（融合版）
- 来源: bruce-deep-research 素材沉淀方法论
- 适配场景: 客户深度背调
