/* sc-0009 第五轮修复（review-b4 后，仅 3 条 minor，编辑已 pass）。
 *   [minor] n10 :: 无名房间与资产室同在负一层，正文却写「下楼回到闸机前」
 *                  → 修法：改为「回到闸机前」（不指定上下）。
 *   [minor] 路径0 :: 选「等保安来解释」，保安此后全篇未再出现
 *                  → 修法：n2 补一句保安后来的处理（记下工号就走），使线索有交代。
 *   [minor] 路径2 :: 从「打听章的来历」直接跳到「查工号」，缺过渡
 *                  → 修法：n9 末尾补一句对方主动提出查工号。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

const p = path.join(R, 'content', 'drafts', 'sc-0009.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const m = {};
d.story.nodes.forEach(n => { m[n.id] = n; });

/* n10：去掉「下楼」的方位错误 */
m.n10.text = m.n10.text.replace('他下楼回到闸机前', '他回到闸机前');

/* n2：保安线索闭环 */
m.n2.text = '人事窗口前，章姐把老周的工牌在读卡器上过了一下，屏幕上还是那行字。老周问：是谁判的？章姐说系统自动，她这儿只看得见结果，看不见人。小丁问那怎么撤销，章姐从抽屉里抽出一张三格空表推过来：集齐三个无人认领的废章，一格一个，盖齐了再来。老周又追问一遍是谁判的，章姐还是那句：系统判的，她不问原因。保安跟过来看了一眼屏幕，记下工号，说按流程只能先这么挂账，转身走了。';

/* n9：向「查工号」补过渡 */
m.n9.text = '老周没提表，先打听起无人认领的章——原先归谁管，是谁留下的。对方把笔搁下，看了他一眼：章的主人早不在了，走的时候东西没人接，章就撂在这儿，也没人来认。小丁在旁边小声说，那不就是没人认领。对方没接这句，只说：前面那几处的规矩，到我这儿为止——顺口问了一句，他原先是哪个工号。表还摊在桌沿上，三个格子空着。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0009 第五轮修复：结构', r.ok ? '通过' : '失败', '| n2=' + cjk(m.n2.text), 'n9=' + cjk(m.n9.text), 'n10=' + cjk(m.n10.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
