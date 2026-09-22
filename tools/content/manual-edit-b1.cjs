/* 人工式定点修复：B 档批次 1 的四篇隔离作品（sc-0009 / 0010 / 0011 / 0012）。
 *
 * 背景：首批 6 篇自动流水线仅 1 篇通过。隔离原因均为 1–2 条「选项↔落点 /
 * 合并点状态」类缺陷。同时查明自动修复无效的根因是 produce.cjs 的 stepFix
 * 从未把修复结果回写 draft.story.nodes（只改了临时 map）——已另行修复；
 * 这四篇的草稿 fixRounds 已达 2 轮上限，因此用人工定点编辑收拾。
 *
 * 修法纪律（沿用 A 档 sc-0006 的结论）：
 *   ① 优先改写**选项文字**使其与落点正文一致；
 *   ② 合并点正文不得依赖只有一条来路才成立的状态（位置、物件、动作）；
 *   ③ 只改必要节点，改完清空过期审核字段，重新送审。
 *
 * sc-0009：① n6 选项「让小丁用他的工号代打表」→ n9 却写「老周没提表」；
 *              修法：选项改为「先问这枚章原先归谁管」（与 n9 正文一致）。
 *          ② n8/n9 两条「离开」来路 → n11 仍写「老周的手还扶在桌沿上」；
 *              修法：n11 去掉在场描写（回到屋里时章已盖齐）。
 * sc-0010：n6 把两条来路（抒情稿 / 数据稿）都批成「写得太文学」；
 *          修法：n6 改为「光抒情的算不得工作量，光堆数字的也不算」。
 * sc-0011：① n7 写「地上那杯凉透的速溶」，但经 n2 的来路从未出现咖啡；
 *              修法：n2 补小丁冲咖啡放地上（与同层 n3 的动作一致）。
 *          ② n3 选项「把两把椅子转成背对背」→ 下游多处仍写「并排」；
 *              修法：选项改为「把话挑明，先定个比法」（与 n5 正文「把话挑明」呼应）。
 * sc-0012：n5「只走到总监那层」与 n10/n13「走到哪一层还没查清」矛盾；
 *          修法：n5 改为她也不确定（一处改动消解三处冲突）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const byIdOf = s => { const m = {}; s.nodes.forEach(n => { m[n.id] = n; }); return m; };
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

function setChoice(m, nodeId, from, to) {
  const n = m[nodeId];
  if (!n) throw new Error(nodeId + ' 不存在');
  const c = (n.choices || []).find(c => c.text.indexOf(from) >= 0);
  if (!c) throw new Error(nodeId + ' 未找到选项: ' + from);
  c.text = to;
  return true;
}

const edits = {
  'sc-0009': d => {
    const m = byIdOf(d.story);
    setChoice(m, 'n6', '代打表', '先问这枚章原先归谁管');
    m.n11.text = '章是分几次盖齐的。老周再回到那间屋时，表上三个格子已经满是红印，边角糊成一片。他看了很久，把工牌从兜里掏出来，放在表上面，说：那就不上了吧。小丁没接话，只把表从桌上拿起来，替他折了两折，塞进自己包里。屋里没人催他们走。';
    return '选项改写 x1 | n11 CJK=' + cjk(m.n11.text);
  },
  'sc-0010': d => {
    const m = byIdOf(d.story);
    m.n6.text = '晨会上，那篇接水的稿子摆在桌上。周组长翻了两页，说这稿子的路数不对——光抒情的算不得工作量，光堆数字的也不算。他当场改了口径：从今天起按有效字数算，标点不计，重复的句子不计，情绪词也不算。随后他把一沓打印稿搁在桌角，说组里要建素材库，总得有人整理。他抬眼看小林，问接不接。榜还贴在茶水间，名字没动。';
    return 'n6 CJK=' + cjk(m.n6.text);
  },
  'sc-0011': d => {
    const m = byIdOf(d.story);
    m.n2.text = '老周先开了口，声音压得低，像怕吵醒整层楼。他说先到先得这规矩太便宜，反正椅子都搬来了，不如换个比法——比谁不睡。小丁抬了抬下巴，没接话，把外套拉链一直拉到顶，又从包里摸出一包速溶咖啡，撕开倒进纸杯，接了热水，搁在两把椅子中间的地上。玻璃门还锁着，钥匙在保洁手上。老周的手指在椅面上敲了两下，话头就停在那儿。';
    setChoice(m, 'n3', '背对背', '把话挑明，先定个比法');
    return '选项改写 x1 | n2 CJK=' + cjk(m.n2.text);
  },
  'sc-0012': d => {
    const m = byIdOf(d.story);
    const oldS = '她说，这份只走到总监那层。';
    const newS = '她说，这份走到哪一层，她也没查清。';
    if (m.n5.text.indexOf(oldS) < 0) throw new Error('sc-0012 n5 未找到目标句');
    m.n5.text = m.n5.text.replace(oldS, newS);
    return 'n5 CJK=' + cjk(m.n5.text);
  }
};

let bad = 0;
Object.keys(edits).forEach(id => {
  const p = path.join(R, 'content', 'drafts', id + '.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const info = edits[id](d);
  CLEAR.forEach(k => { delete d[k]; });
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
  const r = V.validateStory(d.story, { wantPaths: true });
  if (!r.ok) bad++;
  console.log('[' + id + '] 结构:', r.ok ? '通过' : '失败', '| 节点', d.story.nodes.length, '|', info);
});
console.log(bad ? '⚠ 有 ' + bad + ' 篇结构失败，请勿继续送审' : '✓ 四篇结构全部通过，可以送审');
process.exit(bad ? 1 : 0);
