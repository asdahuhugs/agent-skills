#!/usr/bin/env node
/**
 * 媒体人家（mtrj.vip）自动发稿脚本 —— 通用可复用版
 *
 * 依赖：
 *   - playwright-core（装在 $HOME/node_modules）
 *   - 本机 Chrome
 *   - 已通过 scripts/mtrj_login.js 由本人手动登录并导出登录态到 browser-profile
 *
 * 用法：
 *   node mtrj_publish.js "<稿件.md>" "<媒体名称>" [选项]
 *
 * 选项：
 *   --dry-run           演练：走完全流程但不点「开始发布」，不扣款
 *   --region <地区>     媒体重名时按地区消歧（如 全国 / 浙江 / 上海）
 *   --index <n>         多条候选时选第 n 条（从 1 开始）
 *   --media-id <ID>     直接指定媒体 ID（跳过名称匹配，最精确）
 *   --list              只列出匹配到的媒体候选并退出（不下单）
 *   --profile <目录>    指定 browser-profile 目录
 *   --json              以 JSON 输出匹配结果（便于程序化调用）
 *
 * 例：
 *   node mtrj_publish.js "稿件.md" "自动化网" --list           # 先看有哪些候选
 *   node mtrj_publish.js "稿件.md" "自动化网" --dry-run        # 演练
 *   node mtrj_publish.js "稿件.md" "自动化网"                  # 真发布（扣款）
 *   node mtrj_publish.js "稿件.md" "金山都市" --region 上海     # 重名按地区选
 *   node mtrj_publish.js "稿件.md" "" --media-id 418216        # 直接指定 ID
 *
 * 退出码：
 *   0 成功 / 演练通过   2 未登录   3 无上传控件   4 内容为空
 *   5 未跳转媒体页      6 媒体匹配失败/需消歧  7 购物车异常
 *   8 结果未确认        9 媒体名称为空          1 异常
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ============ 配置（可用环境变量覆盖） ============
const HOME = os.homedir();
const CFG = {
  chrome: process.env.MTRJ_CHROME ||
    (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'),
  profile: process.env.MTRJ_PROFILE ||
    path.join(HOME, '.mtrj', 'browser-profile'),
  base: 'https://www.mtrj.vip/Manage/',
  loginUser: process.env.MTRJ_USER || 'nhqinang',
  py: process.env.MTRJ_PY ||
    path.join(HOME, '.workbuddy-ai', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe'),
  workDir: path.join(HOME, '.mtrj'),
  mediaId: '',          // 不用默认值：必须由用户显式给出媒体名称或 ID
};

// storageState 文件（登录态载体，含会话级 ASP.NET_SessionId）
function stateFile(profile) { return path.join(profile, 'storage-state.json'); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============ 参数解析 ============
const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const mdPath = positional[0];
let mediaName = (positional[1] || '').trim();   // ★ 无默认媒体
const dryRun = argv.includes('--dry-run');
const listOnly = argv.includes('--list');
const jsonOut = argv.includes('--json');

function optVal(name) {
  const i = argv.indexOf(name);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : '';
}
const region = optVal('--region').trim();
const indexArg = parseInt(optVal('--index'), 10) || 0;
const idArg = optVal('--media-id').trim();
if (idArg) CFG.mediaId = idArg;
const prof = optVal('--profile');
if (prof) CFG.profile = prof;

if (!mdPath) {
  console.error('用法: node mtrj_publish.js <稿件.md> "<媒体名称>" [--dry-run] [--region 地区] [--index n] [--media-id ID] [--list]');
  process.exit(1);
}
// 必须提供「媒体名称」或「媒体 ID」之一（--list 例外：可不带，列出全部候选）
if (!mediaName && !CFG.mediaId && !listOnly) {
  console.error('!! 必须指定媒体名称或 --media-id（本脚本不接受默认媒体）');
  process.exit(9);
}

const shotDir = path.join(CFG.workDir, 'shots');
const docxDir = path.join(CFG.workDir, 'docx');

// ============ md -> docx ============
// 在多个候选位置查找 md2docx.py（脚本可能被复制到别处运行）
function findMd2docx() {
  const cands = [
    path.join(__dirname, 'md2docx.py'),
    path.join(CFG.workDir, 'scripts', 'md2docx.py'),
    path.join(CFG.workDir, 'md2docx.py'),
    path.join(HOME, '.workbuddy-ai', 'skills', 'mtrj-publish', 'scripts', 'md2docx.py'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('!! 找不到 md2docx.py，候选路径:', cands.join(' | '));
  process.exit(1);
}

function mdToDocx(md, docxPath) {
  // 剥掉末尾「相关阅读」板块（保留正文中的链接）
  let body = md;
  for (const marker of ['## 相关阅读', '## 参考阅读', '### 相关阅读']) {
    const i = body.indexOf(marker);
    if (i > 0) { body = body.slice(0, i); break; }
  }
  body = body.replace(/\n-{3,}\s*$/,'').trimEnd();

  const script = findMd2docx();
  const tmp = path.join(docxDir, '_tmp_body.md');
  fs.mkdirSync(docxDir, { recursive: true });
  fs.writeFileSync(tmp, body, 'utf8');
  execFileSync(CFG.py, [script, tmp, docxPath], { stdio: 'inherit' });
  fs.unlinkSync(tmp);
  return docxPath;
}

// ============ 媒体匹配逻辑 ============
/**
 * 从媒体页抓取所有候选行
 * 列结构：td[0]=checkbox(value=ID) td[2]=名称 td[3]=价格 td[4]=分类 td[5]=收录 td[6]=地区
 */
function extractCandidates(page) {
  return page.evaluate(() => {
    const cbs = [...document.querySelectorAll('input[name="CheckMed"]')];
    return cbs.map(cb => {
      const tr = cb.closest('tr');
      const tds = [...tr.querySelectorAll('td')];
      const txt = i => (tds[i] ? tds[i].textContent.replace(/\s+/g, ' ').trim() : '');
      const a = tr.querySelector('a[target="_blank"]');
      // 名称优先取 td[2]，退化取 a 文本
      const name = txt(2) || (a ? a.textContent.trim() : '');
      return {
        id: cb.value,
        cbId: cb.id,
        name,
        priceText: txt(3),
        category: txt(4),
        include: txt(5),
        region: txt(6),
        link: a ? a.getAttribute('href') : '',
      };
    });
  });
}

/**
 * 匹配候选：
 *   1) 精确相等（去掉 [图片案例] 等后缀）
 *   2) 唯一前缀
 *   3) 唯一包含
 * 返回 { matches: [...], reason: 'exact'|'prefix'|'contains'|'none'|'ambiguous' }
 */
function matchCandidates(cands, keyword) {
  const norm = s => String(s).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '').trim();
  const kw = norm(keyword);

  let matches = cands.filter(c => norm(c.name) === kw);
  if (matches.length) return { matches, reason: 'exact' };

  const pre = cands.filter(c => norm(c.name).startsWith(kw));
  if (pre.length === 1) return { matches: pre, reason: 'prefix' };
  if (pre.length > 1) return { matches: pre, reason: 'ambiguous' };

  const inc = cands.filter(c => norm(c.name).includes(kw));
  if (inc.length === 1) return { matches: inc, reason: 'contains' };
  if (inc.length > 1) return { matches: inc, reason: 'ambiguous' };

  return { matches: [], reason: 'none' };
}

/** 按地区再过滤一层（支持包含匹配，如 浙江 匹配 "浙江"） */
function filterByRegion(matches, region) {
  if (!region) return matches;
  const r = region.replace(/\s+/g, '');
  const hit = matches.filter(c => String(c.region).replace(/\s+/g, '').includes(r));
  return hit.length ? hit : matches;
}

// ============ 主流程 ============
(async () => {
  fs.mkdirSync(shotDir, { recursive: true });

  // 0. 【禁止自动登录】本 skill 的登录只允许人工完成（见 scripts/mtrj_login.js）。
  //    旧版会调用 ~/.mtrj/ensure_login.js 自动过滑块 + 自动填账号密码，现已硬性关闭：
  //    即使该文件存在也不再执行，仅在未登录时提示用户手动登录。
  //    （如需恢复，必须由用户明确要求后再改，不要私自放开。）

  // 1. 读稿件 + 转 DOCX
  const md = fs.readFileSync(mdPath, 'utf8');
  let title = (md.match(/^#\s+(.+)$/m) || [, ''])[1].trim();
  if (title.length > 40) title = title.slice(0, 38);
  const docx = path.join(docxDir, path.basename(mdPath).replace(/\.md$/, '.docx'));
  console.log('>> 稿件:', path.basename(mdPath));
  console.log('   标题:', title, `(${title.length}字)`);
  console.log('>> 目标媒体:', mediaName || ('ID ' + CFG.mediaId), region ? ('（地区: ' + region + '）') : '');
  console.log('>> 转换 DOCX');
  mdToDocx(md, docx);
  console.log('   ->', docx, fs.statSync(docx).size, 'bytes');

  // 2. 启动持久化浏览器
  console.log('>> 启动浏览器（复用已登录 Profile）');
  if (!fs.existsSync(CFG.profile)) {
    console.error('!! Profile 不存在，请先运行 scripts/mtrj_login.js 由本人手动登录');
    process.exit(2);
  }
  const ctx = await chromium.launchPersistentContext(CFG.profile, {
    executablePath: CFG.chrome,
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox',
      ...(process.env.MTRJ_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY
        ? ['--proxy-server=' + (process.env.MTRJ_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY), '--proxy-bypass-list=<-loopback>']
        : [])],
  });
  ctx.setDefaultTimeout(60000);

  // ★ 关键：注入 storageState（含会话级 ASP.NET_SessionId，Profile 数据库不会持久化它）
  const sf = stateFile(CFG.profile);
  if (fs.existsSync(sf)) {
    try {
      const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
      if (st.cookies && st.cookies.length) {
        await ctx.addCookies(st.cookies);
        console.log('   已注入 storageState:', st.cookies.map(c => c.name).join(', '));
      }
    } catch (e) { console.log('   ⚠️ storageState 解析失败:', e.message); }
  } else {
    console.log('   ⚠️ 未找到 storageState，登录可能失效');
  }

  const page = ctx.pages()[0] || await ctx.newPage();
  const shot = async n => { await page.screenshot({ path: path.join(shotDir, 'S_' + n + '.png'), fullPage: true }).catch(()=>{}); };

  try {
    // 3. 检查登录态
    console.log('>> 检查登录态');
    await page.goto(CFG.base + 'Article_add.aspx', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    let c = await page.content();
    if (c.length < 1000 || !c.includes(CFG.loginUser)) {
      console.log('!! 未登录（或已掉线）→ 请先手动登录：node <skill>/scripts/mtrj_login.js');
      console.log('   （本 skill 不会自动过滑块、不会自动填账号密码，登录全程由人工完成）');
      await shot('E1-notlogin');
      await ctx.close(); process.exit(2);
    }
    console.log('   已登录 ✓');

    // 4. 上传 DOCX
    console.log('>> 上传 DOCX');
    const fi = await page.$('#fileWord');
    if (!fi) { console.log('!! 找不到上传控件 #fileWord'); await ctx.close(); process.exit(3); }
    await fi.setInputFiles(docx);
    // 轮询等待 UEditor 内容注入（最长 40s）
    let elen = 0;
    for (let k = 0; k < 20; k++) {
      await sleep(2000);
      elen = await page.evaluate(() => {
        try { return (window.UE && UE.getEditor('editor').getContent() || '').length; } catch (e) { return -1; }
      });
      if (elen > 100) break;
    }
    console.log('   编辑器内容长度:', elen);
    if (elen < 100) { console.log('!! 上传内容为空'); await shot('E2-empty'); await ctx.close(); process.exit(4); }

    // 5. 填标题 + 确认下一步
    console.log('>> 填标题 + 确认下一步');
    await page.fill('#RelTitle', title);
    await sleep(400);
    await page.click('#Buybut');
    await sleep(7000);
    if (!page.url().includes('Media.aspx')) {
      console.log('!! 未跳转到媒体页, url =', page.url());
      await shot('E3-nojump'); await ctx.close(); process.exit(5);
    }
    console.log('   已进入媒体页 ✓');

    // 6. 进入媒体页
    if (mediaName) {
      console.log(`>> 搜索媒体「${mediaName}」`);
      await page.goto(CFG.base + 'Media.aspx?Medianame=' + encodeURIComponent(mediaName), { waitUntil: 'domcontentloaded' });
    } else if (CFG.mediaId) {
      console.log(`>> 直接使用媒体 ID ${CFG.mediaId}（打开媒体页）`);
      await page.goto(CFG.base + 'Media.aspx', { waitUntil: 'domcontentloaded' });
    } else {
      console.log('>> 打开媒体页（未指定媒体，列全部候选）');
      await page.goto(CFG.base + 'Media.aspx', { waitUntil: 'domcontentloaded' });
    }
    await sleep(5000);
    await shot('1-media');

    // 7. 定位媒体
    let mediaId = CFG.mediaId || null;
    let chosen = null;
    let needPageCheck = true;   // 是否需要用 checkbox 勾选（否则直接调 CheckMedia）

    // --list：只列候选、不下单（可带媒体名过滤，也可不带列出全部）
    if (listOnly) {
      const all = await extractCandidates(page);
      console.log(`>> [--list] 页面共 ${all.length} 条候选`);
      let shown = all;
      if (mediaName) {
        const m = matchCandidates(all, mediaName);
        shown = m.matches.length ? m.matches : all.filter(c => c.name.includes(mediaName));
        console.log(`   匹配「${mediaName}」→ ${shown.length} 条（${m.reason}）`);
      }
      shown.forEach((c, i) => console.log(
        `     [${i + 1}] ${c.name} | ${c.priceText} | ${c.category} | 地区:${c.region} | ID:${c.id}`));
      if (jsonOut) console.log(JSON.stringify({ status: 'ok', count: shown.length, matches: shown }, null, 2));
      await ctx.close(); process.exit(0);
    }

    if (mediaId) {
      // —— 直接用 ID：不必搜到该行，可直接调 CheckMedia(ID) ——
      const has = await page.$('#Check' + mediaId);
      if (has) { console.log(`   已按 ID ${mediaId} 在页面定位到 ✓`); }
      else { console.log(`   页面无 #Check${mediaId} 行，将直接调用 CheckMedia(${mediaId})`); needPageCheck = false; }
    } else {
      // —— 按名称搜索 + 匹配 ——
      const cands = await extractCandidates(page);
      console.log(`   页面返回 ${cands.length} 条候选媒体`);

      if (cands.length === 0) {
        console.log('!! 未搜到任何媒体:', mediaName);
        await shot('E4-nomedia'); await ctx.close(); process.exit(6);
      }
      let { matches, reason } = matchCandidates(cands, mediaName);

      // 只要命中多条（含 exact 同名多条），就先按地区收敛
      if (matches.length > 1 && region) {
        const narrowed = filterByRegion(matches, region);
        if (narrowed.length < matches.length) { matches = narrowed; reason = 'exact'; }
      }

      // 仍多条（含 --index 指定）
      if (matches.length > 1 && indexArg > 0) {
        const pick = matches[indexArg - 1];
        if (!pick) { console.log(`!! --index ${indexArg} 超出范围（共 ${matches.length} 条）`); await ctx.close(); process.exit(6); }
        matches = [pick]; reason = 'exact';
      }

      // 输出候选清单
      console.log('   候选：');
      matches.forEach((m, i) => console.log(
        `     [${i + 1}] ${m.name} | ${m.priceText} | ${m.category} | 地区:${m.region} | ID:${m.id}`));

      if (matches.length > 1) {
        console.log('!! 媒体名存在多条匹配，需消歧。请加 --region <地区> 或 --index <n> 指定。');
        if (jsonOut) console.log(JSON.stringify({ status: 'ambiguous', matches }, null, 2));
        await shot('E5-ambiguous'); await ctx.close(); process.exit(6);
      }
      if (matches.length === 0) {
        console.log('!! 未匹配到媒体:', mediaName);
        await shot('E4-nomedia'); await ctx.close(); process.exit(6);
      }
      chosen = matches[0];
      mediaId = chosen.id;
      console.log(`   已匹配（${reason}）: ${chosen.name} (ID ${mediaId}, 地区 ${chosen.region || '-'})`);
      needPageCheck = !!(await page.$('#Check' + mediaId));
    }

    // 8. 加入购物车（优先页面勾选；页面无此行则直接调 CheckMedia）
    if (needPageCheck) {
      await page.check('#Check' + mediaId);
      await sleep(2500);
      // 勾选后若购物车仍是 0（平台 checkbox 只是 UI），再调一次 CheckMedia 兜底
      let n0 = await page.evaluate(() => (document.querySelector('#ShowNum') || {}).textContent);
      if (String(n0).trim() !== '1') {
        console.log('   页面勾选未入车，改用 CheckMedia() 直接加购');
        await page.evaluate((id) => { try { window.CheckMedia(id); } catch (e) {} }, mediaId);
        await sleep(2500);
      }
    } else {
      console.log(`   调用 CheckMedia(${mediaId}) 加购`);
      await page.evaluate((id) => { try { window.CheckMedia(id); } catch (e) {} }, mediaId);
      await sleep(2500);
    }

    let st = await page.evaluate(() => ({
      num: (document.querySelector('#ShowNum') || {}).textContent,
      pts: (document.querySelector('#ShowPoints') || {}).textContent,
    }));
    await shot('2-checked');

    // 若仍未入车，直接走接口（curl 同源，带会话）
    if (String(st.num).trim() !== '1') {
      console.log('   购物车仍为空，直接请求 Handler_Media.ashx 加购');
      const rsp = await page.evaluate(async (id) => {
        const r = await fetch('IHttpHandler/Handler_Media.ashx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: 'typename=checkMedia&Mid=' + encodeURIComponent(id),
        });
        return await r.text();
      }, mediaId).catch(e => 'ERR:' + e.message);
      console.log('   接口返回:', String(rsp).slice(0, 120));
      await sleep(2500);
      st = await page.evaluate(() => ({
        num: (document.querySelector('#ShowNum') || {}).textContent,
        pts: (document.querySelector('#ShowPoints') || {}).textContent,
      }));
      await shot('2b-checked-api');
    }

    if (String(st.num).trim() !== '1') {
      console.log(`!! 购物车异常：${st.num} 家媒体（期望 1 家）`);
      await ctx.close(); process.exit(7);
    }

    // 价格（优先行内单价，否则用购物车总额）
    const rowPrice = await page.evaluate((id) => {
      const cb = document.getElementById('Check' + id);
      if (!cb) return '';
      const tds = cb.closest('tr').querySelectorAll('td');
      return tds[3] ? tds[3].textContent.replace(/\s+/g, '').trim() : '';
    }, mediaId).catch(() => '');
    const priceLabel = rowPrice ? `单价 ${rowPrice}` : `按购物车总额 ¥${st.pts}`;
    // 若通过 ID 直连、页面上没有该行，尝试从购物车 html 里取媒体名
    if (!chosen) {
      const mname = await page.evaluate(() => {
        const el = document.querySelector('#ShowMedia');
        return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
      }).catch(() => '');
      chosen = { name: mname || `ID ${mediaId}`, id: mediaId, region: '' };
    }
    console.log(`   目标媒体: ${chosen.name} (ID ${mediaId})`);
    console.log(`   购物车: ${st.num} 家媒体，总需 ¥${st.pts}（${priceLabel}）`);

    // 8. 下单
    if (dryRun) {
      console.log('>> [演练模式] 跳过「开始发布」，未扣款');
      await shot('3-dryrun');
      await ctx.close();
      console.log('== 演练完成，流程验证通过 ==');
      process.exit(0);
    }

    console.log(`>> 点击「开始发布」（扣款 ¥${st.pts}）`);
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    await page.click('#Buyinput');
    await sleep(9000);

    const result = await page.evaluate(() => {
      const el = document.querySelector('.layui-layer-content');
      return el ? el.textContent.trim() : '';
    });
    console.log('   结果:', result);
    await shot('3-success');

    const okBtn = await page.$('.layui-layer-btn0, .layui-layer-btn a');
    if (okBtn) { await okBtn.click().catch(() => {}); await sleep(4000); await shot('4-after-ok'); }

    const success = result.includes('发布成功');
    if (jsonOut) console.log(JSON.stringify({ status: success ? 'success' : 'unknown', media: chosen ? { name: chosen.name, id: mediaId, region: chosen.region } : { id: mediaId }, amount: st.pts, raw: result }, null, 2));
    console.log(success ? '✅ 发布成功' : '⚠️ 结果未确认: ' + result);
    await ctx.close();
    process.exit(success ? 0 : 8);

  } catch (e) {
    console.error('!! 异常:', e.message);
    await shot('E9-exception').catch(() => {});
    await ctx.close();
    process.exit(1);
  }
})();
