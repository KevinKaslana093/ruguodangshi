/* sc-0009 第二轮人工定点修复（复审 review-b1 后）。
 *
 * 复审报出 4 条（逐条复核为真）：
 *   [major] n12 :: 从「查工号」直接跳到「三格盖满、闸机放行」，盖章过程缺失，因果断裂
 *   [minor] n11 :: n8 明写「谁也没去碰它」，n11 却称章已分几次盖齐，谁盖的没交代
 *   [major] 路径0 :: 选项「回楼下失物箱翻那张工牌」——但工牌一直在老周手里（n6 正文即写「工牌在我手里」）
 *   [minor] 路径3 :: 选项说「去摸自助机」，落点却是没门牌、桌后坐着人的房间，自助机情节缺失
 *
 * 修法（选项↔落点一致 + 合并点纪律）：
 *   ① n6/n4/n5 的「离开/自助机」类选项改写为与落点正文一致的表述；
 *   ② n8/n9 两条「离开」来路改写为「等章盖完」——n11 是盖章场景，来路必须都能走到「章盖齐」；
 *   ③ n11 交代盖章者与过程（与 n8 的「对方」一致）；
 *   ④ n12 改为承接「查工号」这个动作，不再无中生有「三格盖满、闸机放行」。
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

function setChoice(nodeId, from, to) {
  const c = (m[nodeId].choices || []).find(c => c.text.indexOf(from) >= 0);
  if (!c) throw new Error(nodeId + ' 未找到选项: ' + from);
  c.text = to;
  return c;
}

/* ① 选项↔落点对齐 */
setChoice('n6', '失物箱翻那张工牌', '把表推上去，按流程办');     // → n8 递材料场景
setChoice('n4', '先去摸自助机', '先往里走，看看还有谁在');         // → n7 没门牌的屋
setChoice('n5', '先试打一张', '绕开受理台，往走廊深处走');         // → n7 同上
setChoice('n8', '先回人事窗口', '把表留下，等章盖完');             // → n11 盖章场景
setChoice('n9', '交回人事窗口', '把表推回去，等章盖完');           // → n11 同上

/* ② n11 交代盖章者与过程（合并点：两条来路都停在同一场景） */
m.n11.text = '桌后的人把抽屉里剩下的两枚章一枚一枚取出来，蘸了印泥，对着表上的格子挨个按下去。三个格子一个接一个红起来，边角糊成一片。表推回老周手里，他看了很久，把工牌从兜里掏出来，放在表上面，说：那就不上了吧。小丁没接话，只把表从桌上拿起来，替他折了两折，塞进自己包里。屋里没人催他们走。';

/* ③ n12 承接「查工号」，去掉无来路的盖章与放行 */
m.n12.text = '对方把工号输进系统，屏幕转过来时，屋里静了一下。那个工号底下挂着一个人，入职那年、部门、照片，一样都对不上——系统里那个老周，进楼比他还早，照片也不是他这张。老周说，那我是谁。对方没接话，只把屏幕转回去。小丁凑过来，把那个名字念了一遍，又回头看他的脸：哥，这……不是你吧。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0009 第二轮修复：结构', r.ok ? '通过' : '失败', '| n11 CJK=' + cjk(m.n11.text), '| n12 CJK=' + cjk(m.n12.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 6), null, 1)); process.exit(1); }
