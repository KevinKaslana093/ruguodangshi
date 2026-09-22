/* sc-0010 第五轮修复（review-b5 后）。
 *   [major] n14 :: n6 路径下稿子念完并未被打回，n14 却说「刚被打回的那份」→ 事实冲突
 *                  → 修法：改为中性「和自己交上去的那份，是同一个套路」（两条来路都成立）
 *   [minor] n11 :: n9 路径下小林已推掉素材库，n11 却从「阿梅手边那沓素材库」取件
 *                  → 修法：n11 改为「把攒下的往期周报打印件摊在桌面上」，不依赖素材库归属
 *   [major] 路径1 :: n10 稿子已当面递交并被组长翻过，选择却写「留在桌上」，n13 结局又重翻一遍
 *                  → 修法：n10 ch1 改为「把稿子留在桌上，转身回工位」；
 *                    n13 改为「那篇稿子搁在桌角，一页也没被念起」（不再重翻）
 *   [minor] 路径0 :: n10 稿子刚递到组长手里，n12 小林又摊开念，归属略跳
 *                  → 修法：n12 改为「把稿子从桌上拿起来」
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

/* n14：去掉「刚被打回」（对 n6 来路不成立） */
m.n14.text = '小林把那沓旧周报抱到周组长面前，一份一份摊开。翻到中间，夹着的一份旧稿滑了出来，署名正是周组长。他顺着往下读：开头写窗外天色，中间写流程，结尾一段感悟，情绪词一行接一行，和自己交上去的那份，是同一个套路。周组长低头看着那一页，杯盖捏在手里没拧上，话说到一半停了。';

/* n11：来源中性化 */
m.n11.text = '小林把攒下来的往期周报打印件摊在桌面上，一份一份比对着栏目，看别人开头怎么写、流程怎么排、结尾停在哪一句。他把自己的稿子挪到屏幕边上，边比边往行间补句子，笔尖在字上点了又点。阿梅屏幕上的字还在往下滚，周组长端着保温杯在几步外没走。';

/* n10 ch1：动作明确 */
{
  const c = (m.n10.choices || []).find(c => c.text.indexOf('留在桌上') >= 0);
  if (c) c.text = '把稿子留在桌上，转身回工位';
}

/* n13：不再重翻 */
m.n13.text = '晨会照常开。那篇稿子还搁在桌角，一页也没被念起。散会后转正名单贴到墙上，小林从头看到尾，没找到自己的名字。茶水间那张榜还贴着，他那三行也还压在最下面。';

/* n12：衔接 n10 的递交动作 */
m.n12.text = '小林没等谁来点名，把稿子从桌上拿起来，从头念到尾。念到水柱那一段，整层静下来，只剩饮水机在响。周组长翻页的手停在半空，翻到最后一页才落下去。他把转正评议表推到小林面前，笔已经搁在表上了。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0010 第五轮：结构', r.ok ? '通过' : '失败', '| n11=' + cjk(m.n11.text), 'n12=' + cjk(m.n12.text), 'n13=' + cjk(m.n13.text), 'n14=' + cjk(m.n14.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
