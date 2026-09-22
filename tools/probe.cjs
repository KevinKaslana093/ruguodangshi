/* 吞吐与扣费口径探测（15–30 分钟窗口的第一步）。
 * 用途：测量实际请求延迟、并发下的成功率、服务是否返回 token 用量、是否有限流响应；
 * 不做任何故事生产。结果写入 content/usage/probe.json 并在终端打印。
 * 用法：node tools/probe.cjs [条数=6] [并发=2]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const llm = require('./llm.cjs');

const N = parseInt(process.argv[2] || '6', 10);
const CONC = parseInt(process.argv[3] || '2', 10);
const OUT = path.resolve(__dirname, '..', 'content', 'usage', 'probe.json');

const MSG = [
  { role: 'system', content: '你是测试探针。只输出 JSON，不要多余文字。' },
  { role: 'user', content: '请输出 JSON：{"ok": true, "n": <1到10的整数>, "word": "随便一个中文词"}' }
];

async function one(i) {
  const t0 = Date.now();
  try {
    const r = await llm.callModel(MSG, { tag: 'probe#' + i, maxTokens: 200, temperature: 0.4, retries: 1 });
    const parsed = (() => { try { return llm.extractJson(r.content); } catch (e) { return null; } })();
    return {
      i, ok: true, ms: Date.now() - t0,
      usage: r.usage, usageAvailable: !!(r.usage && r.usage.total_tokens != null),
      jsonValid: !!parsed, rawPreview: r.content.slice(0, 200),
      finish: (r.raw && r.raw.choices && r.raw.choices[0] && r.raw.choices[0].finish_reason) || null,
      headers: null
    };
  } catch (e) {
    return { i, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 300), status: e.status || null };
  }
}

(async function main() {
  console.log('=== 探针 ===');
  console.log('模型：' + llm.CFG.model + ' | 端点：' + llm.CFG.baseUrl);
  console.log('密钥来源：' + llm.CFG.keyOrigin + '（密钥本身不打印、不落盘）');
  const budget = llm.readBudget();
  console.log('预算：请求上限 ' + budget.requests.limit + '，已用 ' + budget.requests.used + '；token 上限 ' + budget.tokens.limit + '（null = 未设）');
  const blocked = llm.budgetExceeded();
  if (blocked) { console.log('预算保护触发，停止：' + blocked); process.exit(3); }

  const results = [];
  const t0 = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < N) {
      const i = cursor++;
      const r = await one(i);
      results.push(r);
      console.log((r.ok ? '✓' : '✗') + ' #' + i + ' ' + r.ms + 'ms ' + (r.ok ? ('usage=' + (r.usage ? JSON.stringify(r.usage) : '未返回') + ' json=' + r.jsonValid) : ('[' + r.status + '] ' + r.error)));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONC, N)) }, worker));
  const wall = Date.now() - t0;

  const oks = results.filter(r => r.ok);
  const withUsage = oks.filter(r => r.usageAvailable);
  const lat = oks.map(r => r.ms).sort((a, b) => a - b);
  const summary = {
    at: new Date().toISOString(),
    model: llm.CFG.model,
    endpoint: llm.CFG.baseUrl,
    requested: N, concurrency: Math.max(1, Math.min(CONC, N)),
    ok: oks.length, failed: results.length - oks.length,
    wallMs: wall,
    perRequestMs: { min: lat[0] || 0, median: lat[Math.floor(lat.length / 2)] || 0, max: lat[lat.length - 1] || 0 },
    throughputPerMin: oks.length ? +(oks.length / (wall / 60000)).toFixed(2) : 0,
    usageReturned: withUsage.length + '/' + oks.length,
    usageSample: withUsage.length ? withUsage[0].usage : null,
    usageCaveat: withUsage.length ? null : '服务未返回 token 用量 → 记为未知，不估算',
    jsonValidRate: oks.length ? +(oks.filter(r => r.jsonValid).length / oks.length * 100).toFixed(1) + '%' : null,
    failures: results.filter(r => !r.ok),
    note: '额度余额无法通过接口查询 → 标注未知；仅依据本地累计记录与预算设限。'
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results: results.map(r => ({ i: r.i, ok: r.ok, ms: r.ms, usage: r.usage, jsonValid: r.jsonValid, error: r.error })) }, null, 1), 'utf8');
  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify(summary, null, 1));
  console.log('已写入：' + OUT);
})();
