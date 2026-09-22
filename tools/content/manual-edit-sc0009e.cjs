/* sc-0009 第六轮修复（review-b5 后，编辑已 pass，全为 minor）。
 *   [minor] n9/n12 :: 「他原先是哪个工号」指代不清，导致结局揭示对象（章的主人 vs 老周）不明
 *                     → 修法：改为「又问，你的工号是多少」，与 n12「对方把工号输进系统」直接衔接
 *   [minor] n11 :: 「不上了」转折铺垫偏薄 → 补一句八年证明的疲惫（控制总长 ≤150 汉字）
 *   [minor] 路径1 :: 工牌位置不一致（n1「卡还捏在指头里」→ n11「从兜里掏出来」）
 *                     → 修法：n11 用中性表述「把工牌放到表上面」，不指定来源
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

/* ① n9：指代明确（问的是老周的工号） */
m.n9.text = '老周没提表，先打听起无人认领的章——原先归谁管，是谁留下的。对方把笔搁下，看了他一眼：章的主人早不在了，走的时候东西没人接，章就撂在这儿，也没人来认。小丁在旁边小声说，那不就是没人认领。对方没接这句，只说：前面那几处的规矩，到我这儿为止——又问，你的工号是多少。表还摊在桌沿上，三个格子空着。';

/* ② n11：补情绪铺垫 + 工牌中性表述 */
m.n11.text = '桌后的人把章凑齐，一枚一枚蘸了印泥，对着表上的格子挨个按下去。三个格子一个接一个红起来，边角糊成一片。等章盖完，表推回老周手里。他看了很久——从早上站在闸机前，到今天为一枚章把八年翻来覆去证明给一屋子人看，他要的其实不是这一栏红印。他把工牌放到表上面，说：那就不上了吧。小丁没接话，只把表折了两折，塞进自己包里。屋里没人催他们走。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0009 第六轮：结构', r.ok ? '通过' : '失败', '| n9=' + cjk(m.n9.text), 'n11=' + cjk(m.n11.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
