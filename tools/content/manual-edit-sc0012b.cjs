/* sc-0012 第二轮人工定点修复（复审 review-b1 后）。
 *
 * 复审报出 4 条（逐条复核为真）：
 *   [minor] n1 :: 小满开口就断定纪要是裁员预案，未交代她如何拿到纪要、为何如此判断
 *   [minor] n2 :: 莉姐突然出现在打印机旁，前文 IT 部场景只有三人，无入场交代
 *   [major] 路径3 :: 选「用小满的号先问一句」后直接跳到导出报名表，发问结果无交代
 *   [minor] 路径2 :: 选「先别澄清」，节点却写总监签字，意图与结果脱节
 *
 * 修法：
 *   ① n1 补：莉姐跟着进场（覆盖 n2/n3 两处「打印机旁的莉姐」）+ 纪要来源与判断依据；
 *   ② n6/n7 的四个选项全部改写为与落点（n8 导表 / n9 查记录）一致的动作，
 *      消除「承诺的动作没兑现」；
 *   ③ n8 补一句「入口的事没人敢拍板」，让「撤入口未成」的来路也自洽；
 *   ④ n14 改为承接「追查预案原文、先别澄清」，去掉与选择脱节的总监签字。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

const p = path.join(R, 'content', 'drafts', 'sc-0012.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const m = {};
d.story.nodes.forEach(n => { m[n.id] = n; });

function setChoice(nodeId, from, to) {
  const c = (m[nodeId].choices || []).find(c => c.text.indexOf(from) >= 0);
  if (!c) throw new Error(nodeId + ' 未找到选项: ' + from);
  c.text = to;
  return c;
}

/* ① n1：莉姐入场 + 纪要来源与判断依据 */
m.n1.text = '小满撞开IT部的门，话比气喘先出来：先别发那个链接。她把手机举高，屏幕上是刚翻出来的会议纪要，优化分组四个字后头跟着一串名字；跟链接里那栏一对，一个不差。她说，优化分组这种写法，她上一家公司裁员时见过——这回被误写成了团建分组。阿哲的手悬在键盘上方，发送键亮着。老张面前摊着笔记本，笔停在页边。莉姐抱着一摞打印件跟进来，搁在打印机上。';

/* ② 选项↔落点对齐 */
setChoice('n6', '只改标题', '连标题也先不动，去翻后台记录');       // → n9 查提交记录
setChoice('n7', '用小满的号先问一句', '把试探搁下，去导后台报名表'); // → n8 导出比对
setChoice('n7', '请莉姐发条含糊预告', '预告先不发，去翻后台记录');   // → n9 同上

/* ③ n8：让「撤入口未成」的来路自洽 */
m.n8.text = '入口的事到底没人敢拍板。阿哲把后台的报名表导了出来，一列名字铺在屏幕上；小满把纪要里那栏分组挪到旁边，两排名字并排着往下拉。重合的地方一个接一个跳出来，被写进优化分组的那批人，正往报名表上叠。莉姐站在桌边，老张的笔停在纸上。入口还开着，这份比对结果压在桌上，要不要拿去见人，没人先开口。';

/* ④ n14：承接「追查预案原文，先别澄清」 */
m.n14.text = '澄清稿压着没发。小满顺着莉姐扣下的那句话往下追，一路问到人事，把预案的原件调了出来——人员优化分组，每组前面标着优先级，编号和链接里那栏一行不差；团建那份行程分组，也从同一个文件夹里翻了出来。两份东西并排摊在窗台上，一份团建，一份预案，都还在那儿放着。小满看着那两屏，没开口。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0012：结构', r.ok ? '通过' : '失败', '| n1 CJK=' + cjk(m.n1.text), '| n8 CJK=' + cjk(m.n8.text), '| n14 CJK=' + cjk(m.n14.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 6), null, 1)); process.exit(1); }
