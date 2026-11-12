/**
 * 真正的退出登录：注入指定 storage-state 的 cookie → 调 quit → 复查是否已登出
 * 用法：node mtrj_logout.js "<state.json>" "<标签>"
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const stateFile = process.argv[2];
const label = process.argv[3] || 'logout';
const USER = 'nhqinang';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtrj-out-'));
  const ctx = await chromium.launchPersistentContext(tmp, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  ctx.setDefaultTimeout(60000);
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const sid = (st.cookies || []).find(c => c.name === 'ASP.NET_SessionId');
  const out = { label, stateFile, sessionId: sid ? sid.value : null };
  await ctx.addCookies(st.cookies);
  const page = ctx.pages()[0] || await ctx.newPage();

  // 登出前确认
  await page.goto('https://www.mtrj.vip/Manage/', { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  let h = await page.content();
  out.beforeQuitLoggedIn = h.includes(USER) && !h.includes('name="UserPassWord"');

  // 调 quit
  out.quitResp = await page.evaluate(async () => {
    const r = await fetch('/IHttpHandler/Handler_Menber_Login.ashx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'typename=quit', credentials: 'include',
    });
    return { status: r.status, body: (await r.text()).slice(0, 100) };
  });
  await sleep(1500);

  // 复查
  await page.goto('https://www.mtrj.vip/Manage/', { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  h = await page.content();
  out.afterQuitLoggedIn = h.includes(USER) && !h.includes('name="UserPassWord"');
  out.afterQuitUrl = page.url();

  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.afterQuitLoggedIn ? 2 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
