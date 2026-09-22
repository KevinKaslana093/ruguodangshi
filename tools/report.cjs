// 生成批量与质量报告（程序侧统计，不调用模型）。
// 用法：node tools/report.cjs
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');
const D = (p) => path.join(R, p);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const ls = (p) => { try { return fs.readdirSync(D(p)); } catch (e) { return []; } };

const llm = require('./llm.cjs');
const usage = llm.usageTotals();
const budget = llm.readBudget();

const stories = ls('content/stories').filter(f => f.endsWith('.json')).map(f => readJson(D('content/stories/' + f))).filter(Boolean);
const quarantined = ls('content/quarantine').filter(f => f.endsWith('.json')).map(f => readJson(D('content/quarantine/' + f))).filter(Boolean);
const attempts = readJson(D('content/usage/attempts.json')) || {};

/* 逐篇统计 */
const per = stories.map(s => {
  const nodes = (s.nodes || []).length;
  const endings = (s.endings || []).length;
  const paths = s.meta && s.meta.pipeline && s.meta.pipeline.paths != null ? s.meta.pipeline.paths : null;
  const chars = (s.nodes || []).reduce((a, n) => a + String(n.text || '').length, 0);
  return {
    id: s.storyId, genre: s.genreId, title: s.title, nodes, endings,
    chars, avgChars: nodes ? Math.round(chars / nodes) : 0,
    fixRounds: s.meta && s.meta.pipeline ? s.meta.pipeline.fixRounds : null,
    reviewStatus: s.meta ? s.meta.reviewStatus : null
  };
});

const byGenre = {};
per.forEach(p => { (byGenre[p.genre] = byGenre[p.genre] || []).push(p.id); });

const lines = [];
lines.push('# 批量与质量报告（程序侧统计）');
lines.push('');
lines.push('> 生成时间：' + new Date().toISOString());
lines.push('> 本报告全部由 `tools/report.cjs` 从本地记录统计得出，数据未经人工修饰。');
lines.push('');
lines.push('## 一、接口用量（本地累计记录）');
lines.push('');
lines.push('| 指标 | 值 |');
lines.push('|---|---|');
lines.push('| 请求总数（含重试尝试） | ' + usage.requests + ' |');
lines.push('| 其中成功 | ' + usage.ok + ' |');
lines.push('| 其中失败 | ' + usage.failed + ' |');
lines.push('| 其中属于重试尝试 | ' + (usage.retried || 0) + ' |');
lines.push('| 输入 token（服务返回累计） | ' + usage.inputTokens + ' |');
lines.push('| 输出 token（服务返回累计） | ' + usage.outputTokens + ' |');
lines.push('| 合计 token | ' + usage.totalTokens + ' |');
lines.push('| 服务未返回用量的调用 | ' + usage.unknownUsage + ' |');
lines.push('| 任务预算上限（requests） | ' + budget.requests.limit + ' |');
lines.push('| 已用 / 剩余 | ' + budget.requests.used + ' / ' + (budget.requests.limit - budget.requests.used) + ' |');
lines.push('');
lines.push('**口径说明**：');
lines.push('- token 数来自服务端返回的 usage 字段，**不是**用文本字数估算的。');
lines.push('- 请求数包含重试尝试：一次最终成功的调用若重试过，其失败尝试同样消耗额度，因此如实计入。');
lines.push('- **余额不可查询**：该服务不提供余额查询接口，因此本任务的总额度以用户确认的预算 + 本地累计记录为准，**误差未知**。');
lines.push('- 本任务与「梗一下」共用同一接口额度；本任务设有独立上限（' + budget.requests.limit + ' 次请求），为第一任务保留容量。');
lines.push('');
lines.push('## 二、故事库统计');
lines.push('');
lines.push('| 指标 | 值 |');
lines.push('|---|---|');
lines.push('| 正式库故事数 | ' + stories.length + ' |');
lines.push('| 隔离故事数 | ' + quarantined.length + ' |');
lines.push('| 合格率（通过 / 完成流程） | ' + (stories.length + quarantined.length ? (stories.length / (stories.length + quarantined.length) * 100).toFixed(1) + '%' : '—') + ' |');
lines.push('| 总节点数 | ' + per.reduce((a, p) => a + p.nodes, 0) + ' |');
lines.push('| 总结局数 | ' + per.reduce((a, p) => a + p.endings, 0) + ' |');
lines.push('| 正文字数合计 | ' + per.reduce((a, p) => a + p.chars, 0) + ' |');
lines.push('| 单篇平均节点数 | ' + (per.length ? (per.reduce((a, p) => a + p.nodes, 0) / per.length).toFixed(1) : '—') + ' |');
lines.push('| 单节点平均字数 | ' + (per.length ? Math.round(per.reduce((a, p) => a + p.avgChars, 0) / per.length) : '—') + ' |');
lines.push('');
lines.push('### 逐篇明细');
lines.push('');
lines.push('| 故事 ID | 题材 | 标题 | 节点 | 结局 | 正文字数 | 单节点均字 | 修复轮数 |');
lines.push('|---|---|---|---|---|---|---|---|');
per.forEach(p => {
  lines.push('| ' + p.id + ' | ' + p.genre + ' | ' + p.title + ' | ' + p.nodes + ' | ' + p.endings + ' | ' + p.chars + ' | ' + p.avgChars + ' | ' + (p.fixRounds == null ? '—' : p.fixRounds) + ' |');
});
lines.push('');
lines.push('### 题材覆盖');
lines.push('');
lines.push('| 题材 | 已合格 | 数量 |');
lines.push('|---|---|---|');
Object.keys(byGenre).sort().forEach(g => lines.push('| ' + g + ' | ' + byGenre[g].join(', ') + ' | ' + byGenre[g].length + ' |'));
lines.push('');
lines.push('## 三、单件成本');
lines.push('');
lines.push('- 单个合格故事平均请求数：' + (stories.length ? (usage.requests / stories.length).toFixed(1) : '—') + ' 次（含开发期反复调试的消耗，因此**明显高于**批量期的真实成本）。');
lines.push('- 单个合格故事平均 token：' + (stories.length ? Math.round(usage.totalTokens / stories.length) : '—') + '。');
lines.push('- 说明：开发期对同一篇故事反复重跑（修复提示、形状、写作顺序），这些尝试的消耗全部计入，因此该均值是**保守上界**。大批量生产的真实单件成本需在 B 档首批 20 篇后重新统计。');
lines.push('');
lines.push('## 四、失败隔离率');
lines.push('');
lines.push('| 作品 | 题材 | 隔离原因 |');
lines.push('|---|---|---|');
quarantined.forEach(q => lines.push('| ' + q.storyId + ' | ' + (q.genreId || '—') + ' | ' + String(q.reason || '').slice(0, 80) + ' |'));
lines.push('');
lines.push('## 五、重试与不稳定记录');
lines.push('');
lines.push('| 故事 ID | 候选尝试次数 |');
lines.push('|---|---|');
Object.keys(attempts).sort().forEach(k => lines.push('| ' + k + ' | ' + (attempts[k].n || attempts[k]) + ' |'));
lines.push('');
lines.push('（空表表示该批次尚未触发「隔离后重试第二候选」，或记录文件未生成。）');

const out = lines.join('\n');
fs.mkdirSync(D('deliverables'), { recursive: true });
fs.writeFileSync(D('deliverables/批量与质量报告.md'), out, 'utf8');
console.log(out);
console.log('\n已写入 deliverables/批量与质量报告.md');
