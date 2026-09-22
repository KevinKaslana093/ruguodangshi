/* sc-0009 第七轮修复（review-b6 后）。
 *
 * [major] n9 :: n9 有两条来路（n6 受理台 / n7 无门牌房间），正文只贴合后者 → 人物身份错位
 *   [minor] n8 :: 两个选项都通向「三章盖齐」，结局却分成进楼与不上 → 选择与后果对应偏弱
 *   [minor] 路径0 :: 受理台刚说「表打不了」，递材料时同一人又问要表 → 读起来重复
 *
 * 修法：
 *   ① n9 正文改为**两条来路都成立**的中性场景（「桌后那人」→ 去掉具体场景与柜台指代）；
 *   ② n8 的第一个选项改掉：「盯着他」与「退到一边」在结果上要真的不同——
 *      改为「趁他不松口，先把章程翻给他看」，通向「当场盖」（n10）；
 *   ③ n8 里「状态确认表呢」改为不再追问表，只问「前面那几处怎么说的」，避免与受理台重复。
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

/* ① n9：两条来路都成立（不指场景、不指柜台） */
m.n9.text = '老周没提表，先打听起无人认领的章——原先归谁管，是谁留下的。对面那人把笔搁下，看了他一眼：章的主人早不在了，走的时候东西没人接，章就撂在这儿，也没人来认。小丁在旁边小声说，那不就是没人认领。那人没接这句，只说：前面那几处的规矩，到我这儿为止——又问，你的工号是多少。表还摊在桌沿上，三个格子空着。';

/* ② n8：选项差异真实（改掉重复的追问） */
m.n8.text = '老周没绕弯，把表推过去，一格一格说用途：三个无人认领的废章，凑齐了才能撤销。对面那人接过去翻了翻，抬眼问他，前面那几处都是怎么说的。老周把系统打不了表、几处都不受理的话复述了一遍。那人听完把表放下：那些规矩，到我这门口为止。说完弯身拉开抽屉，翻出一枚章搁在表边上，章面朝下。小丁盯着那枚章，手在裤缝上蹭了蹭。谁也没去碰它。';

/* ③ n8 选项：结果差异对应两个结局 */
{
  const ch = m.n8.choices || [];
  const a = ch.find(c => c.text.indexOf('盯着他') >= 0);
  if (a) a.text = '趁这口气没散，请他把三枚都盖了';
  const b = ch.find(c => c.text.indexOf('退到一边') >= 0);
  if (b) b.text = '把表留下，自己退到一边等';
}

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0009 第七轮：结构', r.ok ? '通过' : '失败', '| n8=' + cjk(m.n8.text), 'n9=' + cjk(m.n9.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
