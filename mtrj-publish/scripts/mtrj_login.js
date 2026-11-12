/**
 * 媒体人家（mtrj.vip）—— 人工登录脚本（唯一登录方式）
 *
 * ★ 设计原则（2026-11-10 起）：
 *   本脚本 **不自动过滑块、不自动填写账号密码、不识别验证码、不读取任何凭据文件**。
 *   全部由真人在弹出的浏览器窗口里手动完成：
 *     1) 遇 WAF「旋转拼图」滑块 → 人手动拖动；
 *     2) 手动输入账号 / 密码 / 图形验证码 → 点登录；
 *     3) 进入后台即成功。
 *   脚本只做两件事：打开窗口、轮询探测登录状态 → 成功后导出 storage-state.json。
 *
 * 用法（在 C:\Users\123 下运行）：
 *   node <skill>/scripts/mtrj_login.js                        # 默认 profile ~/.mtrj/browser-profile
 *   node <skill>/scripts/mtrj_login.js --profile <dir>
 *   node <skill>/scripts/mtrj_login.js --timeout 15            # 最长等待分钟数，默认 10
 *
 * 退出码：0 登录成功并已保存 / 2 超时或窗口被关闭 / 1 异常
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const PROFILE = arg('--profile', process.env.MTRJ_PROFILE || path.join(HOME, '.mtrj', 'browser-profile'));
const STATE = path.join(PROFILE, 'storage-state.json');
const TIMEOUT_MIN = parseInt(arg('--timeout', '10'), 10);
// ★ 本站没有独立的登录页：实测 /Manage/Login.aspx 与 /index.aspx 都会返回 `title=错误页面`（用户看到的 404）。
//   登录框在首页与 /Manage/ 页内，因此这里只打开首页，由人手动点「登录」并在页内填表。
const ENTRY_URLS = ['https://www.mtrj.vip/', 'https://www.mtrj.vip/Manage/'];
const CHROME = process.env.MTRJ_CHROME || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

// 后台页出现这些字样即视为已登录
const LOGIN_MARKERS = ['您好：', '退出登录', '会员中心', 'Article_add'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!CHROME) { console.error('!! 未找到 Chrome / Edge，可用 MTRJ_CHROME 指定路径'); process.exit(1); }
  fs.mkdirSync(PROFILE, { recursive: true });

  console.log('========================================================');
  console.log(' 媒体人家 · 人工登录');
  console.log('========================================================');
  console.log(' 浏览器内核 :', CHROME);
  console.log(' Profile    :', PROFILE);
  console.log(' 请在弹出的窗口里【手动】完成：');
  console.log('   1) 如出现旋转拼图滑块 → 手动拖动通过');
  console.log('   2) 手动输入账号、密码、图形验证码 → 点登录');
  console.log('   3) 进入后台后脚本自动保存登录态并关闭窗口');
  console.log(' 本脚本不会自动过验证、不会自动填表、不读取任何凭据文件。');
  console.log(' 最长等待 ' + TIMEOUT_MIN + ' 分钟。');
  console.log('========================================================\n');

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  ctx.setDefaultTimeout(60000);

  const page = ctx.pages()[0] || await ctx.newPage();
  for (const url of ENTRY_URLS) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      break;
    } catch (e) { /* 换下一个入口 */ }
  }
  console.log('>> 窗口已打开（', page.url(), '），等待人工登录…');

  const deadline = Date.now() + TIMEOUT_MIN * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const pages = ctx.pages();
    if (pages.length === 0) {
      console.log('!! 浏览器窗口已被关闭，登录未完成');
      process.exit(2);
    }
    let logged = false;
    for (const p of pages) {
      let html = '';
      try { html = await p.content(); } catch (_) { continue; }
      if (html.includes('name="UserPassWord"') || html.includes('slider_html')) continue;
      if (LOGIN_MARKERS.some(m => html.includes(m))) { logged = true; break; }
    }
    if (logged) {
      console.log('\n✅ 检测到已登录');
      await ctx.storageState({ path: STATE });
      console.log('   登录态已保存 ->', STATE);
      await sleep(800);
      await ctx.close();
      console.log('\n== 下一步 ==');
      console.log('   node <skill>/scripts/mtrj_publish.js "<稿件.md>" "<媒体名称>" --dry-run');
      process.exit(0);
    }
    process.stdout.write('.');
  }

  console.log('\n!! 超时未检测到登录，请重跑本脚本');
  await ctx.close();
  process.exit(2);
})().catch(e => { console.error('异常:', e && e.message); process.exit(1); });
