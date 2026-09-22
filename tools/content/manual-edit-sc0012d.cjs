/* sc-0012 第四轮修复（review-b6 后）。
 *   [major] n2 :: n1 说「先别发那个链接」，n2 却说「链接昨晚已挂进大群」→ 发送状态自相矛盾
 *                  → 修法：n1 改为「先别再扩散那个链接」，并交代链接昨晚已挂进大群；
 *                    n2 只保留「正式群发通知还没点」。
 *   [minor] n11/n13/n14 :: 「预案的原件」「人事那份原始文档」前后用词不一
 *                  → 统一为「人事那边那份文档」。
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

/* ① n1：链接已发出（数字在涨的原因），要拦的是「再扩散」与「正式通知」 */
m.n1.text = '小满撞开IT部的门，话比气喘先出来：先别再扩散那个链接。她把手机举高，屏幕上是刚翻出来的会议纪要，优化分组四个字后头跟着一串名字；跟链接里那栏一对，一个不差。她说，链接昨晚挂进公司大群了，报名数字还在往上跳；正式的群发通知，先别点。阿哲的手悬在键盘上方，发送键亮着。老张面前摊着笔记本，笔停在页边。莉姐抱着一摞打印件跟进来，搁在打印机上。';

/* ② n2：只保留「正式通知没点」 */
m.n2.text = '小满没碰键盘，先问：发到哪一步了。阿哲盯着屏幕说，正式的群发通知还在框里没点，报名表昨晚挂进群以后就能填，数字是这么涨起来的。小满把手机翻过来，会议纪要的截图在上面，优化分组四个字后面跟着一串名字。她把语速放慢：这行字和团建分组是两回事。老张把笔记本往前推了推，莉姐站在打印机旁没接话。';

/* ③ 用词统一 */
m.n11.text = m.n11.text.replace('人事那份原始文档走到哪一层，谁手里还有', '人事那边那份文档，要走到哪一层才能调出来');
m.n13.text = m.n13.text.replace('那份预案的原件走到哪一层，四个人还是没问出来', '人事那边那份文档走到哪一层，四个人还是没问出来');
m.n14.text = m.n14.text.replace('把预案的原件调了出来', '把那份文档调了出来');

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0012 第四轮：结构', r.ok ? '通过' : '失败', '| n1=' + cjk(m.n1.text), 'n2=' + cjk(m.n2.text));
console.log('  n11 含目标串:', m.n11.text.includes('要走到哪一层才能调出来'), '| n14 含「那份文档」:', m.n14.text.includes('把那份文档调了出来'));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
