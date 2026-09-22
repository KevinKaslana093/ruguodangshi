/* 回归测试：验证加强后的 EDIT_SYSTEM 是否真能抓到
 *   ① label 与正文不符
 *   ② 选项承诺的实物操作在落点里不存在
 *
 * 做法：把 sc-0006 的当前版本 **故意注入两处已知缺陷**（复制入库前的坏版本），
 * 送一次独立编辑审核，看它是否报出来。这是「用已知答案考审核员」的回归测试 ——
 * 若报出 → 提示有效；若放过 → 如实记录提示不足以覆盖该盲区。
 *
 * 用法：node tools/content/review-regression.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const llm = require(path.join(R, 'tools', 'llm.cjs'));
const P = require(path.join(R, 'tools', 'content', 'prompts.cjs'));

async function callJson(messages, opt, label) {
  const out = await llm.callWithBudgetFallback(messages, Object.assign({ maxTokens: 16000 }, opt));
  const text = out.content || out.text || '';
  let j = null, err = null;
  try { j = llm.extractJson(text); } catch (e) { err = e; }
  return { json: j, raw: text, err, usage: out.usage };
}

(async function main() {
  const src = JSON.parse(fs.readFileSync(path.join(R, 'content', 'stories', 'sc-0006.json'), 'utf8'));
  const story = JSON.parse(JSON.stringify(src.story || src));
  const byId = {};
  story.nodes.forEach(n => { byId[n.id] = n; });

  /* 注入缺陷 ①：n7 的 label 改回旧值（正文已不切块） */
  byId['n7'].label = '切成小块码好';
  /* 注入缺陷 ②：n4→n7 的选项改回旧值（正文不切块、无「特制咸味」的说法） */
  const c = byId['n4'].choices.find(x => x.to === 'n7');
  c.text = '切成小块，说这是特制咸味';

  console.log('已注入两处已知缺陷：');
  console.log('  ① n7 label  = ' + byId['n7'].label + '  （正文已不切块）');
  console.log('  ② n4→n7 选项 = ' + c.text);
  console.log();

  const msgs = [
    { role: 'system', content: P.EDIT_SYSTEM },
    { role: 'user', content: P.EDIT_USER_TEMPLATE(story) }
  ];

  console.log('送审中（加强后的 EDIT_SYSTEM）…');
  const r = await callJson(msgs, { tag: 'regression:sc-0006', temperature: 0.2 }, 'regression');
  console.log('推理/内容长度: ' + JSON.stringify(r.usage && r.usage.completion_tokens));
  if (!r.json) {
    console.log('审核未返回可解析 JSON：' + (r.err && r.err.message));
    console.log('原始输出前 400 字：\n' + String(r.raw).slice(0, 400));
    return;
  }
  const issues = r.json.editorIssues || [];
  console.log('verdict = ' + r.json.verdict + '，issues = ' + issues.length);
  issues.forEach(i => {
    console.log('  [' + i.severity + '] ' + (i.nodeId || '?') + ' :: ' + i.issue);
    if (i.evidence) console.log('      证据: ' + i.evidence);
  });

  console.log();
  const hitLabel = issues.some(i => /label|标题/i.test(i.issue || '') && /(n7|切成小块)/.test((i.issue || '') + (i.nodeId || '') + (i.evidence || '')));
  const hitChoice = issues.some(i => /选项/.test(i.issue || '') && /切成小块|特制咸味/.test((i.issue || '') + (i.evidence || '')));
  console.log('=== 回归结论 ===');
  console.log('  抓到 label 与正文不符 : ' + (hitLabel ? '是 ★' : '否'));
  console.log('  抓到选项与落点不符   : ' + (hitChoice ? '是 ★' : '否'));
})();
