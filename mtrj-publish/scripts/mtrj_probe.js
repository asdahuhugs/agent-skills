/**
 * 用指定 storage-state.json 探活（临时 profile + 注入 cookie）
 * 用法：node probe_state.js "<state.json>" "<标签>"
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const stateFile = process.argv[2];
const label = process.argv[3] || 'probe';
const USER = 'nhqinang';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtrj-probe-'));
  const ctx = await chromium.launchPersistentContext(tmp, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  ctx.setDefaultTimeout(60000);
  const out = { label, stateFile, exists: fs.existsSync(stateFile) };
  if (out.exists) {
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    out.stateMtime = fs.statSync(stateFile).mtime.toISOString();
    out.cookieNames = (st.cookies || []).map(c => c.name);
    if (st.cookies && st.cookies.length) await ctx.addCookies(st.cookies);
  }
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.mtrj.vip/Manage/', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const html = await page.content();
  out.finalUrl = page.url();
  out.htmlLen = html.length;
  out.loggedIn = html.includes(USER) && !html.includes('name="UserPassWord"');
  out.redirectedHome = page.url() === 'https://www.mtrj.vip/';
  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.loggedIn ? 0 : 2);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
