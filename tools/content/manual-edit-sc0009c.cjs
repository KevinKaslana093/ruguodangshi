/* sc-0009 第四轮人工定点修复（review-b3 后）。
 *
 * review-b3 报出 3 条，全部关于「状态确认表」线索的真实断裂：
 *   [major] n10 :: 规则说无状态确认表不能盖章，但盖章处全程无人提表（n4/n5/n6 立了规矩，没兑现）
 *   [major] n7  :: 走 n2 分支时章姐没给过表，后续却反复出现「三格空的表」（表无来源）
 *   [minor] 路径0 :: 状态确认表这道坎被提出后未解决，章却直接盖了
 *
 * 修法（不删规则，补出路——「最后一站不认前面那套」是本篇荒诞主题的合理落点）：
 *   ① n2 补：章姐也递出三格空表（与 n3 平行），使表在两条来路上都有来源；
 *   ② n8 / n9 补：对方明说「前面那几处的规矩到我这门口为止」——规则坎在此处被人物主动豁免；
 *   ③ n11 盖章来源改为中性表述「把三枚章凑齐」，兼容 n8（桌上已有一枚）与 n9（尚无）两条来路。
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

/* ① n2：表在「问责任」分支也有来源 */
m.n2.text = '人事窗口前，章姐把老周的工牌在读卡器上过了一下，屏幕上还是那行字。老周问：是谁判的？章姐说系统自动，她这儿只看得见结果，看不见人。小丁问那怎么撤销，章姐从抽屉里抽出一张三格空表推过来：集齐三个无人认领的废章，一格一个，盖齐了再来。老周又追问一遍是谁判的，章姐还是那句：系统判的，她不问原因。';

/* ② n8 / n9：规则坎被人物主动豁免（不删规矩，补出路） */
m.n8.text = '老周没绕弯，把表推过去，一格一格说用途：三个无人认领的废章，凑齐了才能撤销。对方接过去翻了翻，抬眼问：状态确认表呢。老周说，系统打不了，前面几处都卡在这儿。对方把表放下：那些规矩，到我这门口为止。说完弯身拉开桌下的抽屉，翻出一枚章搁在表边上，章面朝下。小丁盯着那枚章，手在裤缝上蹭了蹭。谁也没去碰它。';

m.n9.text = '老周没提表，先打听起无人认领的章——原先归谁管，是谁留下的。对方把笔搁下，看了他一眼：章的主人早不在了，走的时候东西没人接，章就撂在这儿，也没人来认。小丁在旁边小声说，那不就是没人认领。对方没接这句，只说：前面那几处的规矩，到我这儿为止。表还摊在桌沿上，三个格子空着。';

/* ③ n11：盖章来源中性化（兼容两条来路） */
m.n11.text = '桌后的人把章凑齐，一枚一枚蘸了印泥，对着表上的格子挨个按下去。三个格子一个接一个红起来，边角糊成一片。等章盖完，表推回老周手里。他看了很久——从早上站在闸机前到现在，他要的其实不是这一栏红印。他把工牌从兜里掏出来放在表上面，说：那就不上了吧。小丁没接话，只把表从桌上拿起来，替他折了两折，塞进自己包里。屋里没人催他们走。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0009 第四轮修复：结构', r.ok ? '通过' : '失败');
console.log('  n2=' + cjk(m.n2.text), 'n8=' + cjk(m.n8.text), 'n9=' + cjk(m.n9.text), 'n11=' + cjk(m.n11.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
