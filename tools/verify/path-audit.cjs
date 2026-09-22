/* 逐条路径语义审读（更强的独立审核代理）。
 * 与生产流水线里的抽样路径审核不同：本工具在故事进入正式库后，由「验证工作包」独立运行，
 * 对全部路径做分段阅读（每条路径单独一次请求，模型只看一条路径 → 更容易发现矛盾），
 * 并对每条路径给出 pass/issues。结果写入 content/review/<storyId>-verify-paths.json。
 * 用法：node tools/verify/path-audit.cjs [--story sc-0002] [--limit 12]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const llm = require('../llm.cjs');
const C = require('../content/check.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const STORIES = path.join(ROOT, 'content', 'stories');
const REVIEW = path.join(ROOT, 'content', 'review');

function arg(name, def) { const i = process.argv.indexOf('--' + name); if (i === -1) return def; const v = process.argv[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; }

const SYSTEM = '你是中文故事质检员。你只读一条游玩路径的全文，判断它在连贯性上能否通过。只输出 JSON：'
  + '{"verdict":"pass|fail","issues":[{"severity":"blocker|major|minor","issue":"≤40字","suggest":"≤40字"}]}。'
  + '重点：前后矛盾、人物知道不该知道的事、无铺垫的转折、数字/次数/名字不一致。最多报 3 条，没问题就给 pass。';

async function auditOne(story, paths, index) {
  const p = paths[index];
  const t = C.pathTexts(story, [p], 1)[0];
  const text = t.text.length > 1400 ? (t.text.slice(0, 900) + '\n…（中略）…\n' + t.text.slice(-500)) : t.text;
  const out = await llm.callWithBudgetFallback([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: '故事《' + story.title + '》（题材 ' + story.genreId + '）的一条实际游玩路径：\n\n' + text + '\n\n请判断这条路径是否连贯可用。' }
  ], { tag: 'verify-paths:' + story.storyId, maxTokens: 4000, temperature: 0.2 });
  const parsed = llm.extractJson(out.content);
  return { index, verdict: parsed.verdict || 'fail', issues: parsed.issues || [] };
}

(async function main() {
  const only = arg('story', null);
  const limit = parseInt(arg('limit', '12'), 10);
  const files = fs.readdirSync(STORIES).filter(f => f.endsWith('.json')).filter(f => !only || f.indexOf(only) === 0).sort();
  if (!files.length) { console.log('正式库中没有匹配的故事'); return; }
  const report = { at: new Date().toISOString(), stories: [] };
  for (const f of files) {
    const story = JSON.parse(fs.readFileSync(path.join(STORIES, f), 'utf8'));
    const V = require('../../shared/validate.js');
    const res = V.validateStory(story, { wantPaths: true });
    const paths = res.metrics._paths || [];
    const n = Math.min(limit, paths.length);
    console.log('=== ' + story.storyId + '《' + story.title + '》 路径 ' + paths.length + '，抽审 ' + n + ' 条 ===');
    const rows = [];
    for (let i = 0; i < n; i++) {
      /* 均匀分布取样 */
      const idx = Math.floor(i * paths.length / n);
      const r = await auditOne(story, paths, idx);
      rows.push(r);
      console.log('  #' + r.index + ' ' + (r.verdict === 'pass' ? '✓ 通过' : '✗ ' + r.issues.length + ' 条：' + r.issues.map(x => x.issue).join('；')));
      if (llm.budgetExceeded()) { console.log('  预算保护触发，提前结束'); break; }
    }
    report.stories.push({
      storyId: story.storyId, title: story.title, totalPaths: paths.length,
      audited: rows.length, pass: rows.filter(r => r.verdict === 'pass').length,
      fail: rows.filter(r => r.verdict !== 'pass').length, rows
    });
    fs.mkdirSync(REVIEW, { recursive: true });
    fs.writeFileSync(path.join(REVIEW, story.storyId + '-verify-paths.json'), JSON.stringify(report.stories[report.stories.length - 1], null, 1), 'utf8');
  }
  const total = report.stories.reduce((a, s) => a + s.audited, 0);
  const pass = report.stories.reduce((a, s) => a + s.pass, 0);
  console.log('\n合计：抽审 ' + total + ' 条路径，通过 ' + pass + ' 条（' + (total ? (pass / total * 100).toFixed(1) : '0') + '%）');
  fs.writeFileSync(path.join(REVIEW, 'verify-paths-summary.json'), JSON.stringify(report, null, 1), 'utf8');
})();
