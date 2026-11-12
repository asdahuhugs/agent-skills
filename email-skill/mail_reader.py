#!/usr/bin/env python3
"""
IMAP 读信（email-skill，由 mail.py 调用，也可单独运行）

与 email_sender.py 共用同一个 email_config.json：

    {
      "smtp_server": "smtp.qiye.163.com", "smtp_port": 465,
      "username": "you@example.com", "password": "<授权码>",
      "imap_server": "imap.qiye.163.com", "imap_port": 993
    }

默认只读（readonly + BODY.PEEK），不会改动已读状态，除非显式加 --mark-read。

命令行:
    python mail_reader.py                      # 收件箱最新 10 封（--counts 另列各文件夹邮件数）
    python mail_reader.py --limit 30           # 看更多
    python mail_reader.py --unread             # 只看未读
    python mail_reader.py --folder "已发送"     # 指定文件夹
    python mail_reader.py --search 大屏         # 按关键字搜（主题/发件人/收件人）
    python mail_reader.py --body 12            # 看第 12 封的正文
    python mail_reader.py --download 12 --save-dir D:\\downloads   # 下载第 12 封的附件

Python API:
    from mail_reader import EmailReader
    r = EmailReader()
    r.login()
    print(r.counts())
    for m in r.headers(limit=5):
        print(m["date"], m["from"], m["subject"])
"""

import argparse
import base64
import email
import imaplib
import json
import os
import re
import ssl
import sys
from email.header import decode_header, make_header

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- helpers

def decode_utf7(name):
    """IMAP modified UTF-7 -> str（网易企业邮的文件夹名是这种编码）"""
    def b64(s):
        s = s.replace(",", "/")
        return base64.b64decode(s + "=" * ((-len(s)) % 4))

    out, i = [], 0
    while i < len(name):
        if name[i] == "&" and i + 1 < len(name) and name[i + 1] != "-":
            j = name.find("-", i + 1)
            if j == -1:
                out.append(name[i:])
                break
            try:
                out.append(b64(name[i + 1:j]).decode("utf-16-be"))
            except Exception:
                out.append(name[i:j + 1])
            i = j + 1
        else:
            out.append(name[i])
            i += 1
    return "".join(out).replace("&-", "&")


def dec(value):
    """解码 MIME 编码的头字段"""
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def find_config():
    """配置查找顺序：显式路径 -> skill 目录 -> 当前工作目录"""
    for candidate in (os.path.join(HERE, "email_config.json"),
                      os.path.join(os.getcwd(), "email_config.json")):
        if os.path.exists(candidate):
            return candidate
    return None


def load_config(config_path=None):
    path = config_path or find_config()
    config = {}
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            config = json.load(f)

    env = {
        'smtp_server': os.getenv('SMTP_SERVER'),
        'smtp_port': os.getenv('SMTP_PORT'),
        'username': os.getenv('EMAIL_USERNAME'),
        'password': os.getenv('EMAIL_PASSWORD'),
        'imap_server': os.getenv('IMAP_SERVER'),
        'imap_port': os.getenv('IMAP_PORT'),
    }
    for key, value in env.items():
        if value:
            config[key] = value

    config.setdefault('imap_server', 'imap.qiye.163.com')
    config.setdefault('imap_port', 993)
    if 'account' in config and 'username' not in config:
        config['username'] = config['account']
    return config


# ---------------------------------------------------------------- reader

class EmailReader:
    def __init__(self, config_path=None):
        self.config = load_config(config_path)
        self.client = None

    # -- connection ------------------------------------------------------
    def login(self):
        missing = [k for k in ('username', 'password') if not self.config.get(k)]
        if missing:
            raise RuntimeError("配置缺少字段: %s" % ", ".join(missing))
        ctx = ssl.create_default_context()
        self.client = imaplib.IMAP4_SSL(
            self.config['imap_server'], int(self.config['imap_port']),
            ssl_context=ctx, timeout=30)
        self.client.login(self.config['username'], self.config['password'])
        return self

    def close(self):
        if self.client:
            try:
                self.client.logout()
            except Exception:
                pass
            self.client = None

    def __enter__(self):
        return self.login()

    def __exit__(self, *exc):
        self.close()

    # -- folders ---------------------------------------------------------
    def folders(self):
        """[(imap原始名, 显示名)]，每次连接只 LIST 一次"""
        if getattr(self, '_folders', None) is not None:
            return self._folders
        typ, data = self.client.list()
        out = []
        for raw in data or []:
            line = raw.decode('utf-8', 'replace')
            if ' "/" ' in line:
                name = line.split(' "/" ')[-1].strip('"')
            else:
                name = line.split()[-1].strip('"')
            out.append((name, decode_utf7(name)))
        self._folders = out
        return out

    def _raw_name(self, folder):
        """把显示名转回 imap 原始名"""
        if not folder:
            return "INBOX"
        for raw, label in self.folders():
            if folder.lower() in (raw.lower(), label.lower()):
                return raw
        return folder

    def counts(self):
        """{显示名: {"messages": n, "unseen": n}}"""
        result = {}
        for raw, label in self.folders():
            typ, st = self.client.status('"%s"' % raw, "(MESSAGES UNSEEN)")
            info = st[0].decode('utf-8', 'replace') if st and st[0] else ''
            m = re.search(r"MESSAGES\s+(\d+)", info)
            u = re.search(r"UNSEEN\s+(\d+)", info)
            result[label] = {
                "messages": int(m.group(1)) if m else 0,
                "unseen": int(u.group(1)) if u else 0,
            }
        return result

    # -- messages --------------------------------------------------------
    def search(self, criteria="ALL", folder="INBOX"):
        """返回 uid 列表（不改动已读状态）"""
        raw = self._raw_name(folder)
        self.client.select('"%s"' % raw, readonly=True)
        typ, data = self.client.uid("SEARCH", None, criteria)
        return (data[0] or b"").split()

    def headers(self, criteria="ALL", folder="INBOX", limit=10, keyword=None):
        """最新若干封的头字段（倒序）"""
        if not limit:
            return []
        uids = [u.decode() if isinstance(u, bytes) else str(u)
                for u in self.search(criteria, folder)]
        if not keyword:
            uids = uids[-limit:]
        heads = self.header_map(uids, folder)
        items = [heads[u] for u in uids if u in heads]
        if keyword:
            keyword = keyword.lower()
            items = [h for h in items if keyword in " ".join(
                [h["from"], h["to"], h["subject"]]).lower()]
        return items[-limit:][::-1]

    def header_map(self, uids, folder="INBOX", chunk=500):
        """{uid: header dict}，批量 FETCH（每批 chunk 个），避免逐封往返"""
        out = {}
        if not uids:
            return out
        raw = self._raw_name(folder)
        self.client.select('"%s"' % raw, readonly=True)
        for i in range(0, len(uids), chunk):
            typ, data = self.client.uid(
                "FETCH", ",".join(uids[i:i + chunk]),
                "(BODY.PEEK[HEADER.FIELDS (DATE FROM TO CC SUBJECT)])")
            for part in data or []:
                if not isinstance(part, tuple) or len(part) < 2:
                    continue
                found = re.search(rb"UID (\d+)", part[0])
                if not found:
                    continue
                uid = found.group(1).decode()
                msg = email.message_from_bytes(part[1])
                out[uid] = {
                    "uid": uid,
                    "date": dec(msg.get("Date")),
                    "from": dec(msg.get("From")),
                    "to": dec(msg.get("To")),
                    "cc": dec(msg.get("Cc")),
                    "subject": dec(msg.get("Subject")),
                }
        return out

    def message(self, uid, folder="INBOX", mark_seen=False):
        """取整封邮件（默认不标记已读）"""
        raw = self._raw_name(folder)
        self.client.select('"%s"' % raw, readonly=not mark_seen)
        item = "(BODY.PEEK[])" if not mark_seen else "(BODY[])"
        typ, data = self.client.uid("FETCH", uid, item)
        blob = b"".join(p[1] for p in data if isinstance(p, tuple))
        return email.message_from_bytes(blob)

    def body_text(self, uid, folder="INBOX", limit=2000):
        """取纯文本正文"""
        msg = self.message(uid, folder)
        parts = []
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True) or b""
                    parts.append(payload.decode(part.get_content_charset() or "utf-8", "replace"))
        else:
            payload = msg.get_payload(decode=True) or b""
            parts.append(payload.decode(msg.get_content_charset() or "utf-8", "replace"))
        text = "\n".join(parts).strip()
        return text[:limit] + ("..." if len(text) > limit else "")

    def save_attachments(self, uid, folder="INBOX", save_dir="."):
        """把附件保存到目录，返回保存的文件路径"""
        msg = self.message(uid, folder)
        saved = []
        if not os.path.isdir(save_dir):
            os.makedirs(save_dir, exist_ok=True)
        for part in msg.walk():
            filename = part.get_filename()
            if not filename:
                continue
            filename = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", dec(filename)).strip(" .") or "attachment"
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            path = os.path.join(save_dir, filename)
            stem, ext = os.path.splitext(filename)
            n = 1
            while os.path.exists(path):  # 不覆盖已有文件：报告 (1).pdf、报告 (2).pdf …
                path = os.path.join(save_dir, "%s (%d)%s" % (stem, n, ext))
                n += 1
            with open(path, "xb") as f:
                f.write(payload)
            saved.append(path)
        return saved


# ---------------------------------------------------------------- CLI

def main():
    ap = argparse.ArgumentParser(description="读取邮箱（IMAP）")
    ap.add_argument("--config", help="配置文件路径")
    ap.add_argument("--folder", default="INBOX", help="文件夹，默认 INBOX")
    ap.add_argument("--limit", type=int, default=10, help="列出多少封，0 表示不列")
    ap.add_argument("--unread", action="store_true", help="只看未读")
    ap.add_argument("--search", help="按关键字过滤（主题/发件人/收件人）")
    ap.add_argument("--body", help="显示指定 UID 的正文")
    ap.add_argument("--download", help="下载指定 UID 的附件")
    ap.add_argument("--save-dir", default=".", help="附件保存目录")
    ap.add_argument("--mark-read", action="store_true", help="取信时把邮件标记为已读")
    ap.add_argument("--counts", action="store_true", help="先列出各文件夹邮件数（较慢）")
    args = ap.parse_args()

    reader = EmailReader(args.config)
    try:
        reader.login()
    except Exception as exc:
        print("登录失败: %s: %s" % (type(exc).__name__, exc))
        return 1

    try:
        if args.body:
            print(reader.body_text(args.body, args.folder))
            return 0

        if args.download:
            saved = reader.save_attachments(args.download, args.folder, args.save_dir)
            if not saved:
                print("该邮件没有附件")
            for path in saved:
                print("已保存: %s (%.1f KB)" % (path, os.path.getsize(path) / 1024))
            return 0

        if args.counts:  # 每个文件夹一次 STATUS，较慢，按需开启
            print("=== 各文件夹邮件数 ===")
            total = unseen_total = 0
            for label, info in reader.counts().items():
                total += info["messages"]
                unseen_total += info["unseen"]
                print("  %-28s 共 %5d 封，未读 %4d 封"
                      % (label, info["messages"], info["unseen"]))
            print("\n合计：%d 封，未读 %d 封" % (total, unseen_total))

        if args.limit:
            criteria = "UNSEEN" if args.unread else "ALL"
            items = reader.headers(criteria, args.folder, args.limit, args.search)
            title = "【%s】" % args.folder
            if args.unread:
                title += "（仅未读）"
            if args.search:
                title += "（关键字: %s）" % args.search
            print("\n=== %s最新 %d 封 ===" % (title, len(items)))
            for m in items:
                print("  [%s] %s" % (m["uid"], m["date"]))
                print("      发件人: %s" % m["from"])
                print("      主题  : %s" % m["subject"])
                print("      收件人: %s" % m["to"])
    finally:
        reader.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
