/* sc-0010 第四轮修复（review-b4 后）。
 *
 * review-b4 报出 2 major/minor + 2 minor（逐条复核为真）：
 *   [major] n14 :: 走组长线（n9）时读者从未见过阿梅的模板，结局却拿旧稿与「模板」逐字比对
 *                  → 人物知道了玩家未获得的信息。修法：n14 改为不引用模板，
 *                    只描述「和自己交上去那份一个套路」（读者已在 n6/n7 见过套路）。
 *   [minor] n8  :: 「素材库」任务此后完全消失，接/推都没有后果
 *                  → 修法：n8 补一句素材库的后续归属（阿梅接过去了），使线索闭环。
 *   [minor] 路径3 :: 标题「稿子又被打回」的「又」无前情
 *                  → 修法：label 去掉「又」。
 *   [minor] 路径2 :: 「往期周报打印件」来源未交代
 *                  → 修法：n11 明确它是从素材库那沓里挑出来的。
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

/* n8：素材库线索闭环（两条来路都能到 n8） */
m.n8.text = '阿梅的屏幕上字还在往下滚。小林把椅子拖过去，压低声音问：标点不算，重复的句子不算，情绪词也不算，那有效字数到底怎么算？阿梅手上没停，说素材库那摊子她先接了，能替换的句子都在笔记本里，想要就自己抄。桌角那沓打印稿已经挪到了她手边。';

/* n11：往期周报的来源交代 */
m.n11.text = '小林从阿梅手边那沓素材库里挑出往期的周报打印件，摊在桌面上，一份一份比对着栏目，看别人开头怎么写、流程怎么排、结尾停在哪一句。他把自己的稿子挪到屏幕边上，边比边往行间补句子，笔尖在字上点了又点。阿梅屏幕上的字还在往下滚，周组长端着保温杯在几步外没走。';

/* n14：不再引用「模板」（读者在组长线上从未见过） */
m.n14.text = '小林把那沓旧周报抱到周组长面前，一份一份摊开。翻到中间，夹着的一份旧稿滑了出来，署名正是周组长。他顺着往下读：开头写窗外天色，中间写流程，结尾一段感悟，情绪词一行接一行，和自己刚被打回的那份，是同一个套路。周组长低头看着那一页，杯盖捏在手里没拧上，话说到一半停了。';

/* 路径3 标题：去掉无前情的「又」 */
m.n7.label = '稿子被打回';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0010 第四轮修复：结构', r.ok ? '通过' : '失败', '| n8=' + cjk(m.n8.text), 'n11=' + cjk(m.n11.text), 'n14=' + cjk(m.n14.text), '| n7 label=' + m.n7.label);
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
