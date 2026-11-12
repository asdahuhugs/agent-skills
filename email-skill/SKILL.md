---
name: email-skill
description: 发邮件、查邮件、删邮件（send / read / search / delete email）。用户一句话说"发邮件给…"、"把…发给…"、"看看收件箱"、"查一下发给某人的邮件"、"删掉…的邮件"、"检查邮箱通道"时使用。统一 mail.py 命令：SMTP 发信（附件、抄送、HTML、批量），IMAP 读信（搜索、正文、附件下载）与删信。
description_zh: "发邮件、查邮件、删邮件：一句话即可发信（附件/抄送/HTML/批量）、查信（搜索/正文/附件下载）、删信"
description_en: "Send, read, search and delete email in one sentence via the unified mail.py CLI"
version: 0.5.0
metadata:
  clawdbot:
    emoji: "\U0001F4E7"
    always: true
    requires:
      bins:
        - python3
display_name: "email-skill"
display_name_en: "email-skill"
visibility: "public"
---

# email-skill — agent spec

## ENTRY
```
MAIL = python "<SKILL_DIR>\mail.py"
```
- `<SKILL_DIR>` = path after `Base directory for this skill:` in the skill-load result.
- Works from any CWD. Config auto-located. Output is UTF-8.
- Only `python3` available → use `python3`.

## POLICY
1. User request is clear → execute immediately. Do NOT ask for confirmation.
2. Ask the user ONLY if:
   - send: no recipient, or no content at all.
   - delete: refused for exceeding `--max`, and the user's wording does not clearly mean "all of them".
3. Subject missing → write a short subject from the body. Do not ask.
4. Delete = ONE command with `--expunge`, no dry-run first (the user's choice). Use filters as narrow as the user's words: specific subject/address/date; `--uid` if UIDs are already known from an earlier listing. `--max` (default 20) is the safety net. Use `--dry-run` only when the user asks "which mails would be deleted".
5. Success = output has no `错误：` line. Report output to user verbatim, then STOP.
6. Failure = `错误：` line present, exit code 1. Report the error. Do not retry blindly.
7. Never print or echo `email_config.json` (contains password).

## INTENT → COMMAND
| intent | command |
|---|---|
| send one | `MAIL send --to A --subject S --body B` |
| send to myself | `MAIL send --to me --subject S --body B` |
| same content, many recipients | `MAIL send --to "A,B,C" …` |
| different content per recipient | write spec JSON → `MAIL send-batch --spec F` |
| list inbox | `MAIL read --limit 10` |
| unread only | `MAIL read --unread` |
| sent folder | `MAIL read --folder "已发送" --limit 10` |
| find by keyword / address | `MAIL read [--folder X] --search K` |
| read body | `MAIL read [--folder X] --body UID` (same folder as the listing) |
| download attachments | `MAIL read [--folder X] --download UID --save-dir DIR` |
| delete | `MAIL delete [--folder X] <filters> --expunge` |
| delete mail sent to myself | `MAIL delete --folder "INBOX,已发送" --to me --search K --expunge` |
| channel health | `MAIL check` |

## send
```
MAIL send --to ADDRS --subject S
          [--body TEXT | --body-file PATH]
          [--html HTML | --html-file PATH]
          [--cc ADDRS] [--bcc ADDRS]
          [--attach PATH]...        # repeatable
          [--verify]                # confirm the mail exists in the server sent folder
          [--config PATH]
```
- ADDRS: comma separated (`,` `，` `;` all accepted).
- Long or multi-line body → write a UTF-8 file, use `--body-file`.
- Any `--attach` path missing → error, NOTHING is sent.
- Only HTML given → the HTML is also used as the plain-text part.
- Output lines: `收件人` `[抄送]` `[密送]` `发件账号` `主题` `正文` `[正文格式]` `[附件]` `[已入信箱]`.

## send-batch
```
MAIL send-batch --spec FILE.json [--delay SECONDS=2] [--config PATH]
```
spec = JSON array (or a single object):
```json
[{"to": ["a@b.com"], "subject": "S1", "body": "B1"},
 {"to": "c@d.com", "subject": "S2", "body_file": "x.txt", "html": "<p>…</p>",
  "html_file": "x.html", "cc": [], "bcc": [], "attachments": ["r.pdf"]}]
```
- One SMTP connection. Auto-reconnects if the server drops it. One failure does not stop the batch.
- Keep `--delay` ≥ 2 for 163 accounts.
- Output: per mail `序号 N/M` + fields; final `批量发送完成：共 N 封 | 成功 X | 失败 Y | 耗时 Z 秒`. Exit 1 if any mail failed.

## read
```
MAIL read [--folder NAME=INBOX] [--limit N=10] [--unread] [--search K]
          [--body UID] [--download UID --save-dir DIR] [--mark-read] [--config PATH]
```
- Read-only by default. Never marks mail as read unless `--mark-read`.
- `--folder` accepts Chinese names (`已发送`, `草稿箱`, …).
- `--search` = case-insensitive substring over Subject / From / To. Does NOT search the body.
- Per-folder message counts are skipped by default (faster). Add `--counts` only if the user asks "how many mails".
- Listing prints `[UID] date`, `发件人`, `主题`, `收件人`. Use that UID for `--body` / `--download`.
- Download never overwrites: duplicate names are saved as `name (1).ext`.

## delete
```
MAIL delete [--folder NAMES=已发送]
            (--uid UID... | --search K | --to ADDR | --since YYYY-MM-DD | --before YYYY-MM-DD)+
            [--dry-run] [--expunge] [--max N=20] [--config PATH]
```
- At least one filter is required. Filters are combined with AND.
- `--folder` takes a comma-separated list, done in one login. Mail sent to self → `--folder "INBOX,已发送"`.
- `--to me` = the configured account.
- `--since` / `--before` = the date range to DELETE (inclusive). It is NOT a range to keep.
- More than `--max` matches in a folder → nothing is deleted, plus an `错误：` line.
- Default folder is `已发送`. To delete from the inbox, pass `--folder INBOX`.
- Without `--expunge`: mail is only flagged `\Deleted`.
- With `--expunge`: purges only the matched UIDs. Server without UIDPLUS (e.g. 163): purges only if no other `\Deleted` mail is in the folder; otherwise only flags, plus a `警告：` line.
- Output per folder: `文件夹`, `匹配：N 封`, `明细：…` lines, `删除完成：已彻底删除|已标记删除 N 封`.

## check
`MAIL check` → `发件账号`, `状态：通道正常|通道异常`, `SMTP`, `IMAP`. Logs in to SMTP, sends nothing.

## CONFIG
- File: `<SKILL_DIR>\email_config.json` (fallback: `CWD\email_config.json`). Template: `config_template.json`.
- Keys: `smtp_server` `smtp_port` `imap_server` `imap_port` `username` `password` `sender_name` `use_tls` `use_ssl`.
- Env vars override the file: `SMTP_SERVER` `SMTP_PORT` `EMAIL_USERNAME` `EMAIL_PASSWORD` `EMAIL_SENDER_NAME` `EMAIL_USE_TLS` `EMAIL_USE_SSL` `IMAP_SERVER` `IMAP_PORT`.
- This machine: NetEase enterprise mail. SMTP `smtp.qiye.163.com:465` (SSL), IMAP `imap.qiye.163.com:993`. `password` = SMTP authorization code.
- "Send to myself" → `--to me`. Also works in `--cc` / `--bcc` / spec. Aliases: `me` `self` `myself` `我` `自己` `我自己`. Do NOT run `check` first.

## ERRORS
| 错误 contains | action |
|---|---|
| authentication / 535 | wrong username or authorization code → tell the user |
| Connection refused / timed out | wrong host or port, or a firewall → run `MAIL check` |
| Attachment not found | fix the path; nothing was sent |
| size / 552 | attachment too large (~25MB limit) → compress, or send a link |
| 配置中缺少 imap_server | add `imap_server` / `imap_port` to the config |
