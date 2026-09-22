/* sc-0009 第八轮 / sc-0010 第七轮 修复（review-b7 后）。
 *
 * sc-0009 [minor] 路径3 :: n8 里老周复述「系统打不了表」，但该路径未去过数据治理办，无从得知
 *   → 修法：复述内容改为两条来路都成立的「要表、要章、处处卡着」（n4/n5 都交代过表的规矩）
 *
 * sc-0010：
 *   [minor] n10 :: 「饮水机就在工位边上」与 n1 的茶水间设定不一致 → 去掉该句
 *   [minor] n12 :: n10 组长已接走稿子，n12 又「从桌上拿起」→ 去掉拿起动作
 *   [major] 路径1 :: 选项「留在桌上」与结局「递上去」措辞冲突
 *                  → n10 ch1 改为「把稿子推到组长手边，转身回工位」（两条来路都是"交出去"）
 *   [minor] 路径0 :: 同上（稿子归属）→ 由上述改动一并消除
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

/* ---------- sc-0009 ---------- */
{
  const p = path.join(R, 'content', 'drafts', 'sc-0009.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = {};
  d.story.nodes.forEach(n => { m[n.id] = n; });
  m.n8.text = '老周没绕弯，把表推过去，一格一格说用途：三个无人认领的废章，凑齐了才能撤销。对面那人接过去翻了翻，抬眼问他，前面那几处都是怎么说的。老周把一路听来的话原样复述了一遍：要表、要章、处处卡着。那人听完把表放下：那些规矩，到我这门口为止。说完弯身拉开抽屉，翻出一枚章搁在表边上，章面朝下。小丁盯着那枚章，手在裤缝上蹭了蹭。谁也没去碰它。';
  CLEAR.forEach(k => { delete d[k]; });
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
  const r = V.validateStory(d.story, { wantPaths: true });
  console.log('sc-0009 第八轮：', r.ok ? '通过' : '失败', '| n8=' + cjk(m.n8.text));
}

/* ---------- sc-0010 ---------- */
{
  const p = path.join(R, 'content', 'drafts', 'sc-0010.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = {};
  d.story.nodes.forEach(n => { m[n.id] = n; });

  m.n10.text = '小林把稿子从桌上拿起，走到茶水间的水吧台前，正面递了过去。周组长接了，捏着页脚一页页翻，指尖点着行尾往下数，嘴里不出声。阿梅屏幕上的字还在往下滚。桌角那沓打印稿还搁着，榜还贴在茶水间。';
  {
    const c = (m.n10.choices || []).find(c => c.text.indexOf('留在桌上') >= 0);
    if (c) c.text = '把稿子推到组长手边，转身回工位';
  }
  m.n12.text = '小林没等谁来点名，把稿子从头念到尾。念到水柱那一段，整层静下来，只剩饮水机在响。周组长翻页的手停在半空，翻到最后一页才落下去。他把转正评议表推到小林面前，笔已经搁在表上了。';
  m.n13.text = '晨会照常开。那篇稿子交出去以后，一页也没被提起。散会后转正名单贴到墙上，小林从头看到尾，没找到自己的名字。茶水间那张榜还贴着，他那三行也还压在最下面。';

  CLEAR.forEach(k => { delete d[k]; });
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
  const r = V.validateStory(d.story, { wantPaths: true });
  console.log('sc-0010 第七轮：', r.ok ? '通过' : '失败', '| n10=' + cjk(m.n10.text), 'n12=' + cjk(m.n12.text), 'n13=' + cjk(m.n13.text));
  console.log('  n10 选项:', (m.n10.choices || []).map(c => c.text).join(' / '));
}
