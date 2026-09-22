/* 四篇 B 档隔离作品的第三轮人工定点修复（review-b2 后）。
 *
 * sc-0009 剩 2 major + 2 minor：
 *   [major] n11 :: 只取两枚章却盖出三个红印（措辞计数与来路冲突）→ n11 去掉计数短语，改自足表述
 *   [major] 路径2 :: 桌上并无章，老周却问「这枚章原先归谁管」，指代落空
 *                  → n6/n7 选项与 n9 正文都不再指代「这枚章」
 *   [minor] n8 :: 两个「等章」选项几乎相同却通向不同结局 → 明确区分（当场看着盖 / 退到一边等）
 *   [minor] 路径1 :: 结局「不上了」缺情绪铺垫 → n11 补一句
 * sc-0010 剩 2 major + 2 minor：
 *   [major] n12 :: 结局奖励的正是组长否定的「堆数字」稿，与口径矛盾
 *                  → ① n6 改为「先不论路子」+「念出来才知道」（为朗读留出余地）；
 *                     ② n12 与 n10 去数据稿专属措辞，改为风格中立的「稿子」
 *   [blocker] 路径1 :: n10 已写「正面递过去并被翻看」，选项却「悄悄压在稿堆底下」→ 改选项
 *   [major] 路径3 :: 抒情路线凭空递出「统计表」→ n4 选项改为「把稿子交上去」
 *   [minor] n13 :: 选择「压在最底下」与结局「摊在桌面上」冲突 → 随选项改写同步消除
 * sc-0011 剩 2 minor（编辑 pass）：
 *   [minor] 绿植角提议与保洁通知因果断裂 → n12 改为「提议刚出口，通知就到了」的反讽
 *   [minor] 「推过去一杯速溶」后下一节点未承接 → n4 补一句咖啡停在中途
 * sc-0012 剩 2 minor（编辑 pass）：
 *   [minor] n13「那屏稿子」缺铺垫 → 改为「澄清稿写定」
 *   [minor] n6/n7 桌上只列两样东西，与莉姐已翻出预案不符 → 改为不逐一列举
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

function load(id) {
  const p = path.join(R, 'content', 'drafts', id + '.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = {};
  d.story.nodes.forEach(n => { m[n.id] = n; });
  return { p, d, m };
}
function setChoice(m, nodeId, from, to) {
  const n = m[nodeId];
  const c = (n.choices || []).find(c => c.text.indexOf(from) >= 0);
  if (!c) throw new Error(nodeId + ' 未找到选项: ' + from);
  c.text = to;
}
function setText(m, nodeId, text) { m[nodeId].text = text; }
function save(p, d) {
  CLEAR.forEach(k => { delete d[k]; });
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
}

/* ---------- sc-0009 ---------- */
{
  const { p, d, m } = load('sc-0009');
  setChoice(m, 'n6', '先问这枚章原先归谁管', '先打听这类章的来历');
  setChoice(m, 'n7', '先问这章平时归谁管', '先问问这种章平时归谁管');
  setChoice(m, 'n8', '守在屋里等这枚章落下', '盯着他，把这枚章当场盖下去');
  setChoice(m, 'n8', '把表留下，等章盖完', '把表留下，自己退到一边等');
  setText(m, 'n9', '老周没提表，先打听起无人认领的章——原先归谁管，是谁留下的。对方把笔搁下，看了他一眼：章的主人早不在了，走的时候东西没人接，章就撂在这儿，也没人来认。小丁在旁边小声说，那不就是没人认领。对方没接这句。表还摊在桌沿上，三个格子空着。');
  setText(m, 'n11', '桌后的人拉开抽屉，把章一枚一枚取出来蘸了印泥，对着表上的格子挨个按下去。三个格子一个接一个红起来，边角糊成一片。等章盖完，表推回老周手里。他看了很久——从早上站在闸机前到现在，他要的其实不是这一栏红印。他把工牌从兜里掏出来放在表上面，说：那就不上了吧。小丁没接话，只把表从桌上拿起来，替他折了两折，塞进自己包里。屋里没人催他们走。');
  save(p, d);
  console.log('[sc-0009] n9 CJK=' + cjk(m.n9.text) + ' | n11 CJK=' + cjk(m.n11.text));
}

/* ---------- sc-0010 ---------- */
{
  const { p, d, m } = load('sc-0010');
  setText(m, 'n6', '晨会上，那篇接水的稿子摆在桌上。周组长翻了两页，说这一轮先不论路子，当场把口径改了：从今天起按有效字数算，标点不计，重复的句子不计，情绪词也不算。他把话留了半句：这么写行不行，念出来才知道。随后他把一沓打印稿搁在桌角，说组里要建素材库，总得有人整理。他抬眼看小林，问接不接。榜还贴在茶水间，名字没动。');
  setText(m, 'n10', '饮水机就在工位边上。小林把稿子从桌上拿起，走到水吧台前，正面递了过去。周组长接了，捏着页脚一页页翻，指尖点着行尾往下数，嘴里不出声。阿梅屏幕上的字还在往下滚。桌角那沓打印稿还搁着，榜还贴在茶水间。');
  setChoice(m, 'n10', '把水温数据念成战报', '当着全组，把稿子念出声');
  setChoice(m, 'n10', '悄悄压在那沓打印稿最底下', '把稿子留在桌上，不再多说');
  setText(m, 'n12', '小林没等谁来点名，把稿子摊开，从头念到尾。念到水柱那一段，整层静下来，只剩饮水机在响。周组长翻页的手停在半空，翻到最后一页才落下去。他把转正评议表推到小林面前，笔已经搁在表上了。');
  setText(m, 'n13', '晨会照常开。那篇稿子摊在桌面上，周组长翻得很快，翻到一半就抬手说下一个。从头到尾，一页也没被念出来。散会后转正名单贴到墙上，小林从头看到尾，没找到自己的名字。茶水间那张榜还贴着，他那三行也还压在最下面。');
  setChoice(m, 'n4', '只把字数统计表递上去', '不念稿，先把稿子交上去');
  setChoice(m, 'n5', '只递上统计表', '只把稿子递上去');
  /* n7 是两条来路（史诗稿 / 数据稿）的合并点：批评必须是两条路子都成立的表述 */
  setText(m, 'n7', '稿子递上去，周组长翻过一遍，说这稿子还是不对路数，字再多也只是字。他当场改了口径：从今天起按有效字数算，标点不计，重复的句子不计，情绪词也不算。榜还贴在茶水间，小林的名字没动。他把一沓打印稿搁在桌角，说组里要建素材库，总得有人整理，抬眼看小林，问接不接。');
  m.n12.label = '接水稿转正';
  if (m.n12.ending) m.n12.ending.title = '接水稿转正';
  d.story.endings.forEach(e => { if (e.nodeId === 'n12') e.title = '接水稿转正'; });
  save(p, d);
  console.log('[sc-0010] n6 CJK=' + cjk(m.n6.text) + ' | n12 CJK=' + cjk(m.n12.text) + ' | 结局标题=' + m.n12.ending.title);
}

/* ---------- sc-0011 ---------- */
{
  const { p, d, m } = load('sc-0011');
  setText(m, 'n4', '老周把椅子往墙边挪了半寸，说靠窗位不是不能谈，但得有个说法。他压着嗓子问小丁：是想比谁说得动谁，还是比谁先沉得住气。玻璃门还锁着，钥匙在保洁手上，应急灯把两把并排的折叠椅影子投在地上。先前冲的那杯速溶搁在地上，热气早散了，谁也没再碰。小丁捏着外套的拉链头，没答话，也没挪椅子。');
  setText(m, 'n12', '绿植角的提议刚说出口，保洁推着车过来开门，顺手把一张对折的通知塞给老周，说是昨天贴的，被人揭了。通知上写着：靠窗区域下月起改为绿植角，工位统一调整到内侧。老周和小丁同时抬头，看向那扇窗。应急灯灭了，走廊亮起来。');
  save(p, d);
  console.log('[sc-0011] n4 CJK=' + cjk(m.n4.text) + ' | n12 CJK=' + cjk(m.n12.text));
}

/* ---------- sc-0012 ---------- */
{
  const { p, d, m } = load('sc-0012');
  setText(m, 'n6', '桌上摊着一路翻出来的东西。小满说先关入口，报名一停，被写进那张表的人就少一个。阿哲说后台权限不在他手上，撤入口等于停活动，他签不了这个字。老张说流程上得市场部点头。莉姐把话留了一半：真撤了，就等于承认发错了。四个人对着屏幕，报名数字还在往上走。');
  setText(m, 'n7', '小会议室的门还合着，桌上摊着一路翻出来的东西。名单一行不错，只有表头对不上。报名数字还在往上跳，入口谁也没去碰。小满说，得先试试群里到底是什么反应——可这句话从谁的号发、发成什么样，四个人围着长桌，还没定下来。');
  setText(m, 'n13', '澄清稿写定，总监从头读到尾，签了名：说明照发，报名表不撤，留着。阿哲回后台挂上那行公告——表头有误，名单原样，已经填过的名字一个没删。小满盯着屏幕上还在往上跳的报名数字，走廊里没人接话。莉姐把手机扣回掌心，老张把笔帽按上。那份预案的原件走到哪一层，四个人还是没问出来。');
  save(p, d);
  console.log('[sc-0012] n6 CJK=' + cjk(m.n6.text) + ' | n7=' + cjk(m.n7.text) + ' | n13=' + cjk(m.n13.text));
}

/* ---------- 结构校验 ---------- */
let bad = 0;
['sc-0009', 'sc-0010', 'sc-0011', 'sc-0012'].forEach(id => {
  const d = JSON.parse(fs.readFileSync(path.join(R, 'content', 'drafts', id + '.json'), 'utf8'));
  const r = V.validateStory(d.story, { wantPaths: true });
  if (!r.ok) { bad++; console.log('✗ ' + id + ' 结构失败: ' + JSON.stringify(r.errors.slice(0, 4))); }
  else console.log('✓ ' + id + ' 结构通过（节点 ' + d.story.nodes.length + '）');
});
/* ---------- 陈旧短语复查 ---------- */
const stale = ['战报', '背对背', '只走到总监', '统计表', '悄悄压在', '那屏稿子', '摊成两排', '摊着两样东西', '这枚章原先', '剩下的两枚'];
const hits = [];
['sc-0009', 'sc-0010', 'sc-0011', 'sc-0012'].forEach(id => {
  const d = JSON.parse(fs.readFileSync(path.join(R, 'content', 'drafts', id + '.json'), 'utf8'));
  const blob = JSON.stringify(d.story);
  stale.forEach(s => { if (blob.indexOf(s) >= 0) hits.push(id + ':' + s); });
});
console.log(hits.length ? '⚠ 仍有陈旧短语: ' + hits.join(', ') : '✓ 无陈旧短语残留');
process.exit(bad ? 1 : 0);
