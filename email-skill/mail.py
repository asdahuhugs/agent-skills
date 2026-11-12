#!/usr/bin/env python3
"""
mail - unified CLI for the email-skill (works from any directory).

Common case is ONE command:

    python mail.py send --to a@b.com --subject "hi" --body "text"

Subcommands:
    send        send one mail over SMTP
    send-batch  send many mails over one reused SMTP connection
    read        read mail over IMAP (read-only, never marks as read unless asked)
    check       verify config + SMTP connectivity WITHOUT sending anything

Output format: one labeled field per line, Chinese label + full-width colon.

    收件人：a@b.com
    发件账号：x@y.com（网易企业邮箱）
    主题：hi
    正文：body preview

Exit code 0 means success, 1 means failure.
"""

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
import time
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# 控制台代码页可能是 GBK，强制 UTF-8 输出，避免中文乱码。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from email_sender import EmailSender  # noqa: E402
from mail_reader import EmailReader  # noqa: E402

READER_SCRIPT = os.path.join(HERE, 'mail_reader.py')
# 各个邮箱服务商的发件箱文件夹名不同，按顺序尝试，第一个能匹配上的即使用。
SENT_FOLDER_CANDIDATES = ('已发送', 'Sent', 'INBOX.Sent', 'Sent Items')
# SMTP 主机 -> 邮件服务商名称
PROVIDERS = (
    ('smtp.qiye.163.com', '网易企业邮箱'),
    ('smtp.163.com', '网易邮箱'),
    ('smtp.gmail.com', 'Gmail'),
    ('smtp.office365.com', 'Outlook/Office365'),
    ('smtp.office.com', 'Outlook/Office365'),
    ('smtp.yahoo.com', 'Yahoo'),
    ('smtp.qq.com', 'QQ 邮箱'),
)


def _config_path(explicit=None):
    """Config discovery: explicit -> skill dir -> current working directory."""
    for cand in (explicit,
                 os.path.join(HERE, 'email_config.json'),
                 os.path.join(os.getcwd(), 'email_config.json')):
        if cand and os.path.exists(cand):
            return cand
    return None


SELF_ALIASES = {'me', 'self', 'myself', '我', '自己', '我自己'}


def _split(value, me=None):
    """Accept a string (comma separated) or a list, return a clean list.
    Aliases in SELF_ALIASES are replaced by `me` (the configured account)."""
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        items = [str(v).strip() for v in value]
    else:
        items = [v.strip() for v in value.replace('，', ',').replace(';', ',').split(',')]
    return [me if (me and v.lower() in SELF_ALIASES) else v for v in items if v]


def _fields(pairs):
    """Print one labeled field per line: 字段：值"""
    for key, value in pairs:
        if value is None or value == '':
            continue
        print('{}：{}'.format(key, value))


def _summary(text, limit=160):
    """One-line preview of a body text."""
    if not text:
        return ''
    flat = ' '.join(text.split())
    if len(flat) > limit:
        flat = flat[:limit] + '…'
    return flat


def _provider(host):
    """Map an SMTP host to a readable mail provider name."""
    host = (host or '').lower()
    for key, name in PROVIDERS:
        if key in host:
            return name
    return host


def _read_text(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def _verify_sent(subject, recipients, config=None):
    """Opt-in only: confirm the mail shows up in the server-side sent folder."""
    tried = []
    extra = ['--config', config] if config else []
    for folder in SENT_FOLDER_CANDIDATES:
        try:
            proc = subprocess.run(
                [sys.executable, READER_SCRIPT, '--folder', folder, '--search', subject] + extra,
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
        except Exception as exc:
            return {'ok': False, 'error': str(exc)}
        out = proc.stdout or ''
        matched = [r for r in recipients if r in out]
        if matched:
            return {'ok': True, 'matched': matched, 'folder': folder}
        tried.append(folder)
    return {'ok': False, 'matched': [], 'tried': tried}


def _account_label(config):
    return '{}（{}）'.format(config.get('username'), _provider(config.get('smtp_server')))


def _header_date(value):
    """Date header -> datetime.date (local), or None."""
    try:
        return parsedate_to_datetime(value).astimezone().date()
    except Exception:
        return None


def _fetch_headers(reader, folder, uids):
    """{uid: header dict + 'day'} via the reader's batched FETCH."""
    out = reader.header_map(uids, folder)
    for h in out.values():
        h['day'] = _header_date(h['date'])
    return out


def _delete_in_folder(reader, folder, args, match):
    """Match, list and (unless --dry-run) delete in one folder. Returns exit code."""
    client = reader.client
    raw = reader._raw_name(folder)
    if args.uid:
        uids = sorted(set(args.uid), key=int)  # skip listing the whole folder
    else:
        client.select('"%s"' % raw, readonly=True)
        typ, data = client.uid('SEARCH', None, 'ALL')
        uids = [u.decode() for u in (data[0] or b'').split()]
    headers = _fetch_headers(reader, folder, uids)
    picked = [headers[u] for u in uids if u in headers and match(headers[u])]

    _fields([('文件夹', folder), ('匹配', '{} 封'.format(len(picked)))])
    for index, h in enumerate(picked, 1):
        _fields([('明细', '{} | UID {} | {} | {} | {}'.format(
            index, h['uid'], h['date'], h['subject'], h['to']))])
    if args.dry_run or not picked:
        return 0
    if len(picked) > args.max:
        _fields([('错误', '匹配 {} 封，超过上限 {}，未删除；缩小条件或加 --max {}'.format(
            len(picked), args.max, len(picked)))])
        return 1

    uidset = ','.join(h['uid'] for h in picked)
    client.select('"%s"' % raw, readonly=False)
    client.uid('STORE', uidset, '+FLAGS', r'(\Deleted)')  # one round trip for all
    state = '已标记删除'
    if args.expunge:
        typ, flagged = client.uid('SEARCH', None, 'DELETED')
        flagged = {u.decode() for u in (flagged[0] or b'').split()}
        if 'UIDPLUS' in client.capabilities:
            client.uid('EXPUNGE', uidset)  # only the picked UIDs
            state = '已彻底删除'
        elif flagged <= {h['uid'] for h in picked}:
            client.expunge()  # no other \Deleted mail here -> plain EXPUNGE is safe
            state = '已彻底删除'
        else:
            _fields([('警告', '文件夹里还有其他待删邮件，本次只打了删除标记')])
    _fields([('删除完成', '{} {} 封'.format(state, len(picked)))])
    return 0


def cmd_delete(args):
    """Delete matching messages over IMAP, one login for all folders."""
    since = _dt.date.fromisoformat(args.since) if args.since else None
    before = _dt.date.fromisoformat(args.before) if args.before else None
    if not (args.uid or args.search or args.to or since or before):
        _fields([('错误', '至少给出一个筛选条件（--uid / --search / --to / --since / --before）')])
        return 1

    reader = EmailReader(_config_path(args.config))
    try:
        reader.login()
    except Exception as exc:
        _fields([('错误', 'IMAP 登录失败：{}'.format(exc))])
        return 1

    me = reader.config.get('username')
    to_filter = (args.to or '').lower()
    if to_filter in SELF_ALIASES:
        to_filter = (me or '').lower()
    search = (args.search or '').lower()

    def match(h):
        if search and search not in ' '.join([h['from'], h['to'], h['subject']]).lower():
            return False
        if to_filter and to_filter not in h['to'].lower():
            return False
        if since or before:
            if h['day'] is None or (since and h['day'] < since) or (before and h['day'] > before):
                return False
        return True

    try:
        rc = 0
        for folder in _split(args.folder):
            rc |= _delete_in_folder(reader, folder, args, match)
        return rc
    finally:
        reader.close()


def cmd_send(args):
    body = args.body if args.body is not None else ''
    if args.body_file:
        body = _read_text(args.body_file)
    html_body = args.html
    if args.html_file:
        html_body = _read_text(args.html_file)
    if not body and html_body:
        body = html_body

    sender = EmailSender(_config_path(args.config))
    conf = sender.config
    me = conf.get('username')
    to = _split(args.to, me)
    cc = _split(args.cc, me)
    bcc = _split(args.bcc, me)
    if not to:
        _fields([('收件人', args.to), ('错误', '缺少收件人')])
        return 1

    res = sender.send_email(
        to_email=to,
        subject=args.subject,
        body=body,
        attachments=args.attach or None,
        cc=cc,
        bcc=bcc,
        html_body=html_body,
    )

    head = [('收件人', ', '.join(to))]
    if cc:
        head.append(('抄送', ', '.join(cc)))
    if bcc:
        head.append(('密送', ', '.join(bcc)))
    head.append(('发件账号', _account_label(conf)))

    if not res.get('success'):
        _fields(head + [('主题', args.subject), ('错误', res.get('error'))])
        return 1

    tail = [('主题', args.subject), ('正文', _summary(body))]
    if html_body:
        tail.append(('正文格式', 'HTML + 纯文本'))
    if args.attach:
        tail.append(('附件', ', '.join(args.attach)))
    if args.verify:
        result = _verify_sent(args.subject, to, _config_path(args.config))
        tail.append(('已入信箱', '是' if result.get('ok') else '否'))

    _fields(head + tail)
    return 0


def cmd_send_batch(args):
    """Send many messages over one reused SMTP connection."""
    try:
        spec = json.loads(_read_text(args.spec))
    except Exception as exc:
        _fields([('错误', '无法读取 spec：{}'.format(exc))])
        return 1
    if isinstance(spec, dict):
        spec = [spec]
    if not isinstance(spec, list) or not spec:
        _fields([('错误', 'spec 需要是非空的消息数组')])
        return 1

    sender = EmailSender(_config_path(args.config))
    conf = sender.config
    delay = args.delay if args.delay is not None else 2

    started = time.time()
    ok_count = 0
    fail_count = 0

    try:
        server = sender.connect()
    except Exception as exc:
        _fields([('发件账号', _account_label(conf)), ('错误', 'SMTP 连接失败：{}'.format(exc))])
        return 1

    try:
        for index, item in enumerate(spec):
            me = conf.get('username')
            to = _split(item.get('to'), me)
            subject = item.get('subject', '')
            body = item.get('body', '')
            if item.get('body_file'):
                body = _read_text(item['body_file'])
            html_body = item.get('html')
            if item.get('html_file'):
                html_body = _read_text(item['html_file'])
            attachments = item.get('attachments') or None
            cc = _split(item.get('cc'), me)
            bcc = _split(item.get('bcc'), me)

            head = [('序号', '{}/{}'.format(index + 1, len(spec))),
                    ('收件人', ', '.join(to)),
                    ('发件账号', _account_label(conf))]
            if cc:
                head.append(('抄送', ', '.join(cc)))
            if bcc:
                head.append(('密送', ', '.join(bcc)))

            if not to:
                _fields(head + [('主题', subject), ('错误', '缺少收件人')])
                fail_count += 1
                continue

            # 163 等服务商会在连续投递后主动断开：发前探活，断了就重连一次
            try:
                server.noop()
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass
                try:
                    server = sender.connect()
                except Exception as exc:
                    _fields(head + [('主题', subject), ('错误', 'SMTP 重连失败：{}'.format(exc))])
                    fail_count += 1
                    continue

            try:
                res = sender.send_email(
                    to_email=to,
                    subject=subject,
                    body=body,
                    attachments=attachments,
                    cc=cc,
                    bcc=bcc,
                    html_body=html_body,
                    server=server,
                )
            except Exception as exc:
                res = {'success': False, 'error': str(exc)}

            if res.get('success'):
                ok_count += 1
                tail = [('主题', subject), ('正文', _summary(body))]
                if html_body:
                    tail.append(('正文格式', 'HTML + 纯文本'))
                if attachments:
                    tail.append(('附件', ', '.join(attachments)))
                _fields(head + tail)
            else:
                fail_count += 1
                _fields(head + [('主题', subject), ('错误', res.get('error'))])

            if delay and index < len(spec) - 1:
                time.sleep(delay)
    finally:
        try:
            server.quit()
        except Exception:
            pass

    _fields([('批量发送完成', '共 {} 封 | 成功 {} | 失败 {} | 耗时 {:.1f} 秒'.format(
        len(spec), ok_count, fail_count, time.time() - started))])
    return 0 if fail_count == 0 else 1


def cmd_read(args):
    cmd = [sys.executable, READER_SCRIPT]
    cfg = _config_path(args.config)
    if cfg:
        cmd += ['--config', cfg]
    if args.folder:
        cmd += ['--folder', args.folder]
    if args.limit:
        cmd += ['--limit', str(args.limit)]
    if args.unread:
        cmd += ['--unread']
    if args.search:
        cmd += ['--search', args.search]
    if args.body:
        cmd += ['--body', str(args.body)]
    if args.download:
        cmd += ['--download', str(args.download)]
    if args.save_dir:
        cmd += ['--save-dir', args.save_dir]
    if args.mark_read:
        cmd += ['--mark-read']
    if args.counts:
        cmd += ['--counts']
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    return subprocess.call(cmd, env=env)


def cmd_check(args):
    import smtplib
    import ssl

    cfg = _config_path(args.config)
    sender = EmailSender(cfg)
    conf = sender.config
    missing = [k for k in ('smtp_server', 'smtp_port', 'username', 'password') if not conf.get(k)]

    head = [('发件账号', _account_label(conf))]
    if missing:
        _fields(head + [('状态', '通道异常'), ('缺少项', ', '.join(missing))])
        return 1

    try:
        ctx = ssl.create_default_context()
        if conf.get('use_ssl'):
            srv = smtplib.SMTP_SSL(conf['smtp_server'], int(conf['smtp_port']), context=ctx, timeout=30)
        else:
            srv = smtplib.SMTP(conf['smtp_server'], int(conf['smtp_port']), timeout=30)
            if conf.get('use_tls', True):
                srv.starttls(context=ctx)
        srv.login(conf['username'], conf['password'])
        srv.quit()
    except Exception as exc:
        _fields(head + [('状态', '通道异常'), ('错误', str(exc))])
        return 1

    _fields(head + [('状态', '通道正常'),
                    ('SMTP', '{}:{}'.format(conf.get('smtp_server'), conf.get('smtp_port'))),
                    ('IMAP', '{}:{}'.format(conf.get('imap_server'), conf.get('imap_port')))])
    return 0


def build_parser():
    p = argparse.ArgumentParser(prog='mail', description='email-skill unified CLI')
    sub = p.add_subparsers(dest='cmd')

    s = sub.add_parser('send', help='send one email over SMTP')
    s.add_argument('--to', required=True, help='recipient address(es), comma separated')
    s.add_argument('--subject', required=True, help='subject line')
    s.add_argument('--body', help='plain text body')
    s.add_argument('--body-file', help='read the body from a UTF-8 file')
    s.add_argument('--html', help='HTML body (sent as alternative part)')
    s.add_argument('--html-file', help='read the HTML body from a UTF-8 file')
    s.add_argument('--cc', help='cc address(es), comma separated')
    s.add_argument('--bcc', help='bcc address(es), comma separated')
    s.add_argument('--attach', action='append', help='attachment path, repeatable')
    s.add_argument('--config', help='path to email_config.json')
    s.add_argument('--verify', action='store_true',
                   help='AFTER sending, confirm server-side presence in the sent folder')
    s.set_defaults(func=cmd_send)

    b = sub.add_parser('send-batch', help='send many emails over one reused SMTP connection')
    b.add_argument('--spec', required=True, help='JSON file with a list of messages')
    b.add_argument('--delay', type=float, default=None,
                   help='seconds to wait between messages (default 2)')
    b.add_argument('--config', help='path to email_config.json')
    b.set_defaults(func=cmd_send_batch)

    d = sub.add_parser('delete', help='delete messages from a folder over IMAP')
    d.add_argument('--folder', default='已发送', help='folder(s), comma separated, e.g. "INBOX,已发送"')
    d.add_argument('--uid', action='append', help='exact UID to delete, repeatable')
    d.add_argument('--search', help='keyword filter on subject/from/to')
    d.add_argument('--to', help='recipient filter (me = own account)')
    d.add_argument('--since', help='DELETE only mails dated on/after this date (YYYY-MM-DD)')
    d.add_argument('--before', help='DELETE only mails dated on/before this date (YYYY-MM-DD)')
    d.add_argument('--max', type=int, default=20,
                   help='refuse to delete more than N per folder (default 20)')
    d.add_argument('--dry-run', action='store_true', help='list matches without deleting')
    d.add_argument('--expunge', action='store_true', help='permanently purge, not just flag')
    d.add_argument('--config', help='path to email_config.json')
    d.set_defaults(func=cmd_delete)

    r = sub.add_parser('read', help='read mail over IMAP (read-only)')
    r.add_argument('--folder', help='folder name, e.g. "已发送"')
    r.add_argument('--limit', type=int, help='how many messages')
    r.add_argument('--unread', action='store_true')
    r.add_argument('--search', help='keyword filter on headers')
    r.add_argument('--body', help='UID whose body to print')
    r.add_argument('--download', help='UID whose attachments to download')
    r.add_argument('--save-dir', help='download target directory')
    r.add_argument('--mark-read', action='store_true')
    r.add_argument('--counts', action='store_true', help='also list per-folder counts (slower)')
    r.add_argument('--config', help='path to email_config.json')
    r.set_defaults(func=cmd_read)

    c = sub.add_parser('check', help='verify config + SMTP connectivity, sends nothing')
    c.add_argument('--config', help='path to email_config.json')
    c.set_defaults(func=cmd_check)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, 'func', None):
        parser.print_help()
        return 0
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
