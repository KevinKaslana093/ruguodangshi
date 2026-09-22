/* sc-0011 第二轮人工定点修复（复审 review-b1 后）。
 * 复审仅 2 条 minor（编辑审核 pass）：
 *   [minor] 路径0 :: 节点标题称「门开之后」，正文却反复写门仍锁着
 *   [minor] 路径4 :: 选择「先讲自己当年熬过通宵」，落点 n5 完全没承接这段往事
 *
 * 修法：
 *   ① n4 标题改为「门还没开时的谈判」（与正文一致）；
 *   ② n2 的选项改为与 n5 正文一致的「提议把比法再抬一格」（n5 原文「比法还能再抬一格」）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

const p = path.join(R, 'content', 'drafts', 'sc-0011.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const m = {};
d.story.nodes.forEach(n => { m[n.id] = n; });

/* ① n4 标题 */
m.n4.label = '门还没开时的谈判';

/* ② n2 选项：与 n5 正文呼应 */
const c = (m.n2.choices || []).find(c => c.text.indexOf('熬过通宵') >= 0);
if (!c) throw new Error('n2 未找到目标选项');
c.text = '提议把比法再抬一格';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0011：结构', r.ok ? '通过' : '失败', '| n4 label=' + m.n4.label, '| n2 选项=' + c.text);
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 6), null, 1)); process.exit(1); }
