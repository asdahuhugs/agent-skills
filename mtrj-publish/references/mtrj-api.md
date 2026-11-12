# 媒体人家（mtrj.vip）接口与页面结构参考

> 逆向所得，供排障与二次开发参考。**该平台无公开 API**，以下均为内部 `.ashx` 端点。

## 一、站点架构

- 技术栈：ASP.NET（`X-AspNet-Version: 4.0.30319`），前置 CDN/WAF（`Server: cdn`）。
- WAF 机制：`_ok5_` Cookie + `/_guard/html.js?js=slider_html` 滑块验证。
  - 新会话直连会返回 `title=安全验证` 的旋转拼图页（`<div class="puzzle-container">`），**必须人工拖动通过拿到 `_ok5_`**。本 skill 不做自动过滑块。
- 会话：`ASP.NET_SessionId`（会话级，`expires=-1`）。**这是掉线的根因**。

## 二、Cookie 三件套

| Cookie | 有效期 | 作用 |
|---|---|---|
| `_ok5_` | 约 7 天 | WAF 放行凭据 |
| `ASP.NET_SessionId` | 会话级 | 登录会话（**超时即掉线**） |
| `MeiJieHang_COOKIE` | 约 7 天 | 会员信息（含明文账号密码，登录后可能出现） |

> 持久化方案：`ctx.storageState()` 可导出**含会话级 Cookie 的完整快照**，弥补 Chrome Cookies 库不落盘会话 Cookie 的缺陷。

## 三、关键页面

| 页面 | 说明 |
|---|---|
| `/Manage/Article_add.aspx` | 发布新闻稿件：上传 DOCX、填标题、UEditor 正文 |
| `/Manage/Article_list.aspx?page=N` | 新闻稿件列表（每页 30 条） |
| `/Manage/Media.aspx?Medianame=xxx` | 按名称搜索媒体、勾选下单 |
| `/Manage/`、`/Manage/Default.aspx` | 后台首页（未登录会 302 回站点首页） |
| `/`（站点首页） | 登录框在页内，**登录入口用这个** |

### ★ 登录页地址（2026-11-10 实测）

本站在服务端**不存在独立登录页**。实测结果：

| 地址 | 返回 |
|---|---|
| `/Manage/Login.aspx` | HTTP 200 但正文是 `title=错误页面` + `/images/Error.jpg`（界面表现为「404」） |
| `/index.aspx` | 同上，`错误页面` |
| `/`（首页） | 正常，200，登录框在页内 |
| `/Manage/`、`/Manage/Default.aspx` | 正常，200 |
| `/Manage/Article_add.aspx` | 正常，200 |

> 因此 `mtrj_login.js` 只打开首页 `https://www.mtrj.vip/`。
> **不要**把登录入口指向 `Login.aspx` / `index.aspx`，否则会出现用户看到的「404 / 错误页面」。
> 登录全程由本人手动完成（`mtrj_login.js` 只轮询登录状态）。

## 四、内部接口（.ashx）

| 端点 | 参数 | 作用 |
|---|---|---|
| `IHttpHandler/Handler_WordtoHtml.ashx` | `file`（DOCX） | DOCX → HTML |
| `IHttpHandler/Handler_Article.ashx` | `typename=addnew`、`reltitle`、`relurl`、`relcontent`、`relbeizhu`、`userbeizhu` | 提交文章 |
| `IHttpHandler/Handler_Media.ashx` | `typename=checkMedia&Mid=` | 加入购物车，返回 `price@count@html@mediaId` |
| `IHttpHandler/Handler_MediaCart.ashx` | `typename=checkmedia`（校验）/ `typename=buymedia`（**下单扣款**） | 购物车与下单 |
| `IHttpHandler/Handler_Menber_Login.ashx` | `typename=verifycode` / `typename=login`（`menbername`、`menberpwd`、`verifycode`） | 登录 |
| `IHttpHandler/Handler_MainCode.ashx` | — | 验证码图片（4 位数字，108×35 JPEG） |

### ★ Hid 句柄问题（核心坑）

`buymedia` 会校验会话中的临时稿件句柄 `Hid`。该句柄**依赖浏览器页面的连续上下文**：
- 用 curl/requests 独立请求 → `Hid=0` → 报 `{"success":"false","msg":"请先发布文章内容"}`；
- 必须用**同一浏览器上下文**完成「上传→提交→选媒体→下单」全链路。

## 六、媒体搜索与匹配机制（★ 媒体不写死的基础）

### 6.1 搜索是模糊匹配
`Media.aspx?Medianame=<关键词>` 返回**名称中含该关键词的所有媒体**，不是精确查询。
例：搜「自动化网」→ 6 条（自动化网 / 电气自动化网 / 中国自动化网 / …）。

### 6.2 媒体行的列结构
| td 索引 | 内容 |
|---|---|
| td[0] | checkbox（`name="CheckMed"`、`id="Check<ID>"`、`value=<ID>`）|
| td[2] | **媒体名称**（内含 `<a target="_blank">`）|
| td[3] | **价格**（¥xx.xx）|
| td[4] | 分类（IT科技 / 综合资讯 …）|
| td[5] | 收录说明 |
| td[6] | **地区**（全国 / 浙江 / 上海 …）|
| td[9] | 出稿时间（当天 等）|

### 6.3 媒体匹配规则（脚本 `matchCandidates`）
1. 精确匹配（去掉 `[图片案例]` 等后缀）
2. 唯一前缀
3. 唯一包含
4. 命中多条 → **拒绝执行并提示消歧**（`--region` / `--index`）

> 老版本曾用「找不到就默认博客园」兜底，**已移除**，避免发错平台。

### 6.4 加购的真正机制：`CheckMedia(Mid)`
页面 JS：
```js
function CheckMedia(Mid) {
  $.ajax({ url: "IHttpHandler/Handler_Media.ashx", type:"POST",
    data: { typename:"checkMedia", Mid: Mid },
    success: function(data){
      // data = 总价@媒体数@html@媒体ID列表
      $("#ShowPoints").text(data.split('@')[0]);
      $("#ShowNum").text(data.split('@')[1]);
      $("#ShowMedia").html(data.split('@')[2]);
      // 若 Mid 在返回的 ID 列表中 → 勾选该 checkbox
    }
  });
}
```
因此**用 `--media-id` 时即便该媒体不在当前页，也能直接 `CheckMedia(ID)` 加购**。

### 6.5 下单机制：`Buy()`
```js
function Buy() {
  var Hid = $("#Hid").val();
  $.ajax({ url:"IHttpHandler/Handler_MediaCart.ashx", type:"post", dataType:"json",
    data:{ typename:"buymedia", hid: Hid },
    success: function(data){
      if (data.success=="false") layer.alert(data.msg);      // 如「请先发布文章内容」
      else layer.confirm("提示：您的稿件发布成功…");          // ★ 扣款成功
    }
  });
}
```

### 6.6 已验证媒体样例
| 媒体 | ID | 价格 | 地区 |
|---|---|---|---|
| 自动化网 | 418216 | ¥12.00 | 全国 |
| 中国自动化网 | 50934 | ¥11.00 | 全国 |
| 中国自动化网(官方) | 419764 | ¥120.00 | 全国 |
| 南方科技 | 145629 | ¥8.00 | 全国 |
| 金山都市 | 2592 / 2410 | ¥8.00 | 浙江 / 上海 |
| 博客园 | 399369 | ¥9.00 | 全国 |

> 以上仅为**样例**，媒体清单会变动；实际以 `--list` 实时查询为准。

## 七、页面元素选择器

| 元素 | 选择器 |
|---|---|
| 上传控件 | `#fileWord` |
| 标题输入 | `#RelTitle` |
| 「确认下一步」按钮 | `#Buybut` |
| UEditor 实例 | `UE.getEditor('editor').getContent()` |
| 媒体复选框 | `#Check<mediaId>`（value = 媒体 ID）|
| 「开始发布」按钮 | `#Buyinput` |
| 购物车数量 / 金额 / 清单 | `#ShowNum` / `#ShowPoints` / `#ShowMedia` |
| 临时稿件句柄 | `#Hid` |
| 弹层结果文本 | `.layui-layer-content` |

## 八、流程时序（实测通过）

```
Article_add.aspx
  └─ setInputFiles(#fileWord, DOCX)
  └─ 等 UEditor 内容注入（>100 字）
  └─ fill(#RelTitle, 标题)
  └─ click(#Buybut)
       ↓ (跳转)
Media.aspx?Medianame=<关键词>        ← 媒体名每次指定
  └─ 匹配候选（精确/前缀/包含）→ 多条则消歧报错
  └─ check(#Check<ID>)  或  CheckMedia(<ID>)   → Handler_Media.ashx
  └─ click(#Buyinput)                          → Handler_MediaCart.ashx(buymedia)
       ↓
  弹层「发稿成功」→ 退出码 0
```

