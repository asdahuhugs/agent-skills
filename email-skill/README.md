# 📧 email-skill

让 AI 助手帮你**一句话收发和管理邮件**：发信、查信、删信都只需要说一句话。

## 能做什么

| 你可以这样说 | AI 会做什么 |
|---|---|
| "把 D:\周报.pdf 发给 zhang@abc.com，说一下本周进度" | 带附件发一封邮件 |
| "给张三、李四各发一封会议通知" | 内容相同就一次群发；每人内容不同就批量发送 |
| "给我自己发一份备忘：明早 9 点开会" | 发到你自己的邮箱（命令行写 `--to me`） |
| "看看收件箱" / "有没有新邮件" | 列出最新的邮件 |
| "查一下上周发给 zhang@abc.com 的邮件" | 在「已发送」里按地址搜索 |
| "看看第 3 封写了什么" | 显示这封邮件的正文 |
| "把这封邮件的附件下载到桌面" | 下载附件 |
| "删掉发给 test@abc.com 的测试邮件" | 一步直接彻底删除，回执里列出删了哪几封 |
| "邮箱还能用吗" | 检查邮箱能否正常连接（不发信） |

说清楚了，AI 就直接执行，不会反复问你。只有下面几种情况才会问：
- 没说发给谁，或者没说要发什么内容
- 要删的邮件一个文件夹里超过 20 封（程序会自动拒绝删除，AI 会先问你是不是真的全删）

## 第一次使用：配置邮箱

1. 把同目录下的 `config_template.json` 复制一份，改名为 `email_config.json`
2. 填入你的邮箱信息：

```json
{
  "smtp_server": "smtp.qiye.163.com",
  "smtp_port": 465,
  "imap_server": "imap.qiye.163.com",
  "imap_port": 993,
  "username": "你的邮箱地址",
  "password": "授权码（不是登录密码）",
  "sender_name": "",
  "use_tls": false,
  "use_ssl": true
}
```

3. 对 AI 说"检查一下邮箱"，看到「状态：通道正常」就配置好了

**授权码怎么获取？** 登录网页版邮箱 → 设置 → 客户端设置（或 POP3/SMTP/IMAP）→ 开启 IMAP/SMTP 服务 → 生成授权码。

### 常见邮箱的服务器地址

| 邮箱 | SMTP 服务器 | 端口 | IMAP 服务器 | 加密方式 |
|---|---|---|---|---|
| 网易企业邮 | smtp.qiye.163.com | 465 | imap.qiye.163.com | `use_ssl: true` |
| 163 邮箱 | smtp.163.com | 465 | imap.163.com | `use_ssl: true` |
| QQ 邮箱 | smtp.qq.com | 465 | imap.qq.com | `use_ssl: true` |
| Gmail | smtp.gmail.com | 587 | imap.gmail.com | `use_tls: true`，`use_ssl: false` |
| Outlook | smtp.office365.com | 587 | outlook.office365.com | `use_tls: true`，`use_ssl: false` |

## 自己在命令行用

不通过 AI，也可以直接在命令行运行（在本目录下执行，或者写成 `mail.py` 的完整路径）：

```powershell
python mail.py send --to a@b.com --subject "标题" --body "正文" --attach "报告.pdf"
python mail.py read --limit 10
python mail.py read --folder "已发送" --search "a@b.com"
python mail.py delete --search "测试" --expunge                       # 一步彻底删除（超过 20 封会拒绝）
python mail.py delete --folder "INBOX,已发送" --to me --search "测试" --expunge   # 收件箱和已发送一起删
python mail.py delete --search "测试" --dry-run                       # 只想看看会删哪些
python mail.py check
```

在本目录下也可以用 `mail` 代替 `python mail.py`，例如 `mail check`（PowerShell 里要写成 `.\mail check`）。查看全部参数：`python mail.py send --help`。

## 需要注意

- **删除不能恢复**：加了 `--expunge` 的邮件会被彻底删除。不放心的话，让 AI "只标记不彻底删"
- **附件**：文件找不到时整封邮件都不会发出；单个附件一般不要超过 25MB
- **搜索**：只搜主题、发件人、收件人，不搜正文内容
- **读信不会改变状态**：查看邮件不会把它标记为已读
- **密码安全**：`email_config.json` 里有授权码，不要发给别人，也不要上传到网上

## 遇到问题

| 现象 | 原因与处理 |
|---|---|
| 认证失败 | 用户名或授权码不对。注意要填授权码，不是登录密码 |
| 连接超时 / 被拒绝 | 服务器地址或端口不对，或者被防火墙拦截 |
| 发出去了但对方没收到 | 让 AI 查一下「已发送」，再请对方看看垃圾箱 |
| 批量发信中途失败 | 163 对连续发信有限制，间隔保持默认的 2 秒以上 |

## 文件说明

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 给 AI 看的使用说明 |
| `README.md` | 本文件，给人看的使用说明 |
| `mail.py` | 主程序，所有功能的入口 |
| `email_sender.py` / `mail_reader.py` | 发信 / 收信的具体实现 |
| `mail.cmd` | Windows 快捷方式，可以用 `mail` 代替 `python mail.py` |
| `email_config.json` | 你的邮箱配置（含授权码） |
| `config_template.json` | 配置模板 |
