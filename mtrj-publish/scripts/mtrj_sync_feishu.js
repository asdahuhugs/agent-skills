#!/usr/bin/env node
/**
 * 媒体人家 → 飞书表格 发布信息同步
 *
 * 作用：把「媒体人家」后台某条发稿订单的信息，写入飞书「GEO测试汇总表 → 发布稿件统计」。
 *
 * 用法：
 *   node mtrj_sync_feishu.js --order M3407590885
 *   node mtrj_sync_feishu.js --order M3407590885 --dry-run     # 只打印将要写入的内容
 *   node mtrj_sync_feishu.js --order M3407590885 --no-link     # 出稿但暂无链接时，发布网址留空
 *
 * 数据来源：媒体人家 Article_list.aspx（需已登录的 browser-profile）
 * 目标表：飞书 base_token=BMo2bp0DJap41TsjpLZcCfz7nmb table=tbl6DPyhsVQjLRhB
 *
 * 字段映射（与表格既有记录保持一致）：
 *   文章标题 ← 订单标题
 *   媒体名称 ← 订单媒体（select，需是表内已存在选项）
 *   价格     ← 订单金额（数字）
 *   状态     ← 出稿 / 撤稿
 *   发布时间 ← 订单发布时间
 *   发布网址 ← 「查看链接」的 href（尚无则留空）
 *   创建时间 ← 订单创建时间
 *
 * 退出码：0 成功  2 未登录  3 未找到订单  4 飞书写入失败  9 参数缺失  1 异常
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const HOME = os.homedir();
const CFG = {
  chrome: process.env.MTRJ_CHROME ||
    (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'),
  profile: process.env.MTRJ_PROFILE || path.join(HOME, '.mtrj', 'browser-profile'),
  base: 'https://www.mtrj.vip/Manage/',
  loginUser: process.env.MTRJ_USER || 'nhqinang',
  feishuBase: process.env.MTRJ_FEISHU_BASE || 'BMo2bp0DJap41TsjpLZcCfz7nmb',
  feishuTable: process.env.MTRJ_FEISHU_TABLE || 'tbl6DPyhsVQjLRhB',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2);
function optVal(name) {
  const i = argv.indexOf(name);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : '';
}
const orderId = optVal('--order').trim();
const dryRun = argv.includes('--dry-run');
const noLink = argv.includes('--no-link');
const prof = optVal('--profile');
if (prof) CFG.profile = prof;

if (!orderId) {
  console.error('用法: node mtrj_sync_feishu.js --order <订单号> [--dry-run] [--no-link]');
  process.exit(9);
}

// 通过 lark-cli 写入飞书
// 注意：lark-cli 是 shell/包装脚本，Windows 下 execFileSync 无法直接执行，必须走 shell
function lark(args) {
  const bin = process.env.MTRJ_LARK || 'lark-cli';
  // 参数中带空格的项统一加引号
  const quoted = args.map(a => (/[\s"'&()@]/.test(a) && !a.startsWith('@') && a !== '-') ? `"${a.replace(/"/g, '\\"')}"` : a);
  const cmd = `${bin} ${quoted.join(' ')}`;
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

(async () => {
  // 0. 自动检查/续期登录态
  const ensureLogin = path.join(HOME, '.mtrj', 'ensure_login.js');
  if (!process.env.MTRJ_NO_AUTOLOGIN && fs.existsSync(ensureLogin)) {
    console.log('>> 自动检查登录态');
    try {
      execFileSync(process.execPath, [ensureLogin], { stdio: 'inherit', timeout: 300000 });
    } catch (e) {
      console.log('   ⚠️ 自动登录未成功（退出码 ' + (e.status == null ? '?' : e.status) + '），继续走原登录检查');
    }
  }

  // 1. 从媒体人家后台抓订单
  console.log('>> 查询媒体人家订单:', orderId);
  if (!fs.existsSync(CFG.profile)) { console.error('!! Profile 不存在，请先运行 mtrj_login.js'); process.exit(2); }
  const ctx = await chromium.launchPersistentContext(CFG.profile, {
    executablePath: CFG.chrome, headless: true,
    viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox',
      ...(process.env.MTRJ_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY
        ? ['--proxy-server=' + (process.env.MTRJ_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY), '--proxy-bypass-list=<-loopback>']
        : [])],
  });
  ctx.setDefaultTimeout(60000);
  const sf = path.join(CFG.profile, 'storage-state.json');
  if (fs.existsSync(sf)) {
    try { await ctx.addCookies(JSON.parse(fs.readFileSync(sf, 'utf8')).cookies); } catch (e) {}
  }
  const page = ctx.pages()[0] || await ctx.newPage();

  let order = null;
  try {
    await page.goto(CFG.base + 'Article_list.aspx', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    if (!(await page.content()).includes(CFG.loginUser)) { console.log('!! 未登录或已掉线，请重跑 mtrj_login.js'); await ctx.close(); process.exit(2); }

    order = await page.evaluate((oid) => {
      for (const tr of document.querySelectorAll('tr')) {
        const tds = [...tr.querySelectorAll('td')];
        if (!tds.length) continue;
        if (tds[0].textContent.trim() !== oid) continue;
        const txt = i => (tds[i] ? tds[i].textContent.replace(/\s+/g, ' ').trim() : '');
        const linkA = [...tr.querySelectorAll('a')].find(a => a.textContent.trim() === '查看链接');
        return {
          order: txt(0), title: txt(1), price: txt(2), status: txt(4),
          media: txt(5), publishTime: txt(6), createTime: txt(8),
          link: linkA ? linkA.getAttribute('href') : '',
        };
      }
      return null;
    }, orderId);
  } finally { await ctx.close(); }

  if (!order) { console.log('!! 未在后台找到订单:', orderId); process.exit(3); }
  console.log('   订单信息:');
  console.log('    标题:', order.title);
  console.log('    媒体:', order.media, '| 价格:', order.price, '| 状态:', order.status);
  console.log('    发布:', order.publishTime, '| 创建:', order.createTime);
  console.log('    链接:', order.link || '(暂无)');

  // 2. 组装飞书字段
  const priceNum = parseFloat(String(order.price).replace(/[^\d.]/g, '')) || 0;
  // 「状态」是单选字段，只有 出稿 / 撤稿 两个选项；平台其它状态（未处理/已收安排等）
  // 不在选项内 → 必须留空，否则 API 报 800030005 not_found 导致整条写入失败。
  const STATUS_ALLOWED = ['出稿', '撤稿'];
  const statusVal = STATUS_ALLOWED.includes(order.status) ? [order.status] : [];
  if (order.status && !statusVal.length) {
    console.log(`   注意：平台状态「${order.status}」不在飞书选项(${STATUS_ALLOWED.join('/')})内 → 状态留空（出稿后补录）`);
  }
  const fields = {
    文章标题: order.title,
    媒体名称: order.media ? [order.media] : [],
    价格: priceNum,
    状态: statusVal,
    发布时间: order.publishTime || '',
  };
  // 发布网址：有链接且未被 --no-link 抑制才填；否则留空（不编造）
  if (order.link && !noLink) {
    fields['发布网址'] = `[${order.link}](${order.link})`;
  } else if (order.link && noLink) {
    fields['发布网址'] = '';
  } else {
    fields['发布网址'] = '';
  }
  if (order.createTime) fields['创建时间'] = order.createTime;

  console.log('>> 将写入飞书字段:');
  console.log(JSON.stringify(fields, null, 2));

  if (dryRun) { console.log('>> [演练] 不写入飞书'); process.exit(0); }

  // 3. 去重：先查表里是否已有同标题记录
  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const nd = path.join(os.tmpdir(), `mtrj_feishu_dup_${stamp}.ndjson`);
  lark(['base', '+record-list', '--base-token', CFG.feishuBase, '--table-id', CFG.feishuTable,
    '--limit', '2000', '--format', 'ndjson', '--output', nd, '--as', 'user']);
  let existing = null;
  if (fs.existsSync(nd)) {
    for (const line of fs.readFileSync(nd, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if ((r['文章标题'] || '').trim() === order.title.trim()) { existing = r; break; }
      } catch (e) {}
    }
    try { fs.unlinkSync(nd); } catch (e) {}
  }

  if (existing) {
    console.log('   表中已存在同标题记录，改为补齐/更新:', existing.record_id);
    // 只补充空缺字段，保留已有
    const upd = {};
    if (!existing['发布网址']) upd['发布网址'] = fields['发布网址'] || '';
    if (!existing['发布时间'] && fields['发布时间']) upd['发布时间'] = fields['发布时间'];
    if (!existing['价格']) upd['价格'] = fields['价格'];
    if (!existing['媒体名称'] || !existing['媒体名称'].length) upd['媒体名称'] = fields['媒体名称'];
    if (!existing['状态'] || !existing['状态'].length) upd['状态'] = fields['状态'];
    if (!Object.keys(upd).length) { console.log('   无需更新（信息已完整）'); process.exit(0); }
    const payload = { update_records: { [existing.record_id]: upd } };
    const uf = path.join(os.tmpdir(), `mtrj_feishu_upd_${stamp}.json`);
    fs.writeFileSync(uf, JSON.stringify(payload), 'utf8');
    lark(['base', '+record-batch-update', '--base-token', CFG.feishuBase, '--table-id', CFG.feishuTable,
      '--json', '@' + uf, '--as', 'user']);
    try { fs.unlinkSync(uf); } catch (e) {}
    console.log('   ✅ 已补齐:', JSON.stringify(upd));
  } else {
    const payload = { create_records: [fields] };
    const nf = path.join(os.tmpdir(), `mtrj_feishu_new_${stamp}.json`);
    fs.writeFileSync(nf, JSON.stringify(payload), 'utf8');
    const out = lark(['base', '+record-batch-create', '--base-token', CFG.feishuBase, '--table-id', CFG.feishuTable,
      '--json', '@' + nf, '--as', 'user']);
    try { fs.unlinkSync(nf); } catch (e) {}
    console.log('   ✅ 已新增记录');
    console.log(out.trim());
    // 置顶校验：新记录由系统分配最大「序号」，视图按「序号」倒序 → 必然出现在表格最上面
    try {
      const chk = path.join(os.tmpdir(), `mtrj_feishu_chk_${stamp}.ndjson`);
      lark(['base', '+record-list', '--base-token', CFG.feishuBase, '--table-id', CFG.feishuTable,
        '--limit', '2000', '--format', 'ndjson', '--output', chk, '--as', 'user']);
      let maxSeq = '', maxTitle = '';
      for (const line of fs.readFileSync(chk, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          const s = String(r['序号'] || '');
          if (s && s > maxSeq) { maxSeq = s; maxTitle = r['文章标题'] || ''; }
        } catch (e) {}
      }
      try { fs.unlinkSync(chk); } catch (e) {}
      if (maxSeq) {
        const ok = maxTitle.trim() === order.title.trim();
        console.log(`   排序键「序号」最大值为 ${maxSeq}，对应标题: ${maxTitle}`);
        console.log(ok ? '   ✅ 置顶校验通过（视图按序号倒序，新记录位于表格首位）' : '   ⚠️ 置顶校验异常，请检查视图排序是否为「序号」倒序');
      }
    } catch (e) { /* 校验失败不影响写入结果 */ }
  }
  console.log('== 同步完成 ==');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
