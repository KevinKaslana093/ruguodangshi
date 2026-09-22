/* sc-0010 第二轮人工定点修复（复审 review-b1 后）。
 *
 * 复审报出 4 条（逐条复核为真）：
 *   [major] n12 :: 该路径交的是数据表格稿，结局却念出文学版内容（「水柱从闷响转清亮」）
 *   [minor] n12 :: 「转正名额」此前从未铺垫，突然成为结局奖励
 *   [major] 路径0 :: 结局念的抒情段落与已改成硬数据的稿子矛盾（同上）
 *   [minor] 路径2 :: 选择「举着组长的旧周报」预设手上有组长旧稿，而 n11 只比对栏目未铺垫
 *
 * 修法：
 *   ① n1 立根：「晨会朗读的成绩记进转正评议」；
 *   ② n12 改为数据稿路线该有的内容（念表、念换桶那一段），奖励改用已立根的「转正评议表」；
 *   ③ 结局标题「接水史诗转正」→「接水战报转正」（与 n10 选项「把水温数据念成战报」一致）；
 *   ④ n11 的选项不再预设「组长的旧周报」（那是 n14 才揭示的信息），改为「那沓旧周报」。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

const p = path.join(R, 'content', 'drafts', 'sc-0010.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const m = {};
d.story.nodes.forEach(n => { m[n.id] = n; });

/* ① n1：给「转正」立根 */
m.n1.text = '茶水间的饮水机旁贴出新一版周报字数榜，红笔把末位圈了出来。小林的名字挂在最下面，三行，连标点一起算也撑不满半页。周组长端着杯子站在榜前，说晨会朗读的成绩记进转正评议，名额就按这张纸来。阿梅把笔记本往怀里收了收，屏幕上密密的字还在往下滚。';

/* ② n12：与来路（数据表格稿）一致 */
m.n12.text = '晨会上，小林把那张表念成了战报：水位落在哪一格、水柱分几种声响、换桶时桶底怎么磕在架子上，一段一段往下念。念到换桶那一段，屋里静得能听见饮水机在响。周组长翻页的手停在半空，翻到最后一页才落下去。他把转正评议表推到小林面前，笔已经搁在表上了。';

/* ③ 结局标题同步（节点 label + ending.title + endings 登记） */
m.n12.label = '接水战报转正';
if (m.n12.ending) m.n12.ending.title = '接水战报转正';
d.story.endings.forEach(e => { if (e.nodeId === 'n12') e.title = '接水战报转正'; });

/* ④ n11 选项：不预设「组长的旧周报」 */
const c = (m.n11.choices || []).find(c => c.text.indexOf('旧周报') >= 0);
if (!c) throw new Error('n11 未找到目标选项');
c.text = '把那沓旧周报抱过去问他写了多少字';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0010：结构', r.ok ? '通过' : '失败', '| n1 CJK=' + cjk(m.n1.text), '| n12 CJK=' + cjk(m.n12.text), '| 结局标题:', m.n12.ending.title);
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 6), null, 1)); process.exit(1); }
