/* 第三轮修复（review-b3 后）：sc-0010 / sc-0012。
 *
 * sc-0012（编辑 1 major + 路径 1 major）：
 *   [major] n3 :: 后台草稿「小标题写着优化分组」，与 n4「链接上写的是团建分组」矛盾
 *                 （同一块后台屏幕前后表头不一致）
 *   [major] n12 :: 「真团建的行程分组」前文从未铺垫，突然出现
 *   修法：① n3 改为「小标题写着团建分组」，并把怀疑点放在「名字与纪要一模一样」上（这才是证据）；
 *         ② n12 不再引用未铺垫的文件，改为「撤下名单栏，只留行程与报名入口」；
 *         ③ 选项、结局标题、通知文案同步。
 *
 * sc-0010（仅 2 minor，编辑已 pass）：
 *   [minor] n14 :: 选项「抱旧周报去问组长」与正文「小林自己翻读、组长在几步外」脱节
 *   修法：选项与 n14 正文对齐（抱到组长面前摊开，翻出旧稿，组长当场停住）。
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
  if (!n) throw new Error(nodeId + ' 不存在');
  const c = (n.choices || []).find(c => c.text.indexOf(from) >= 0);
  if (!c) throw new Error(nodeId + ' 未找到选项: ' + from + '（现有: ' + (n.choices || []).map(x => x.text).join(' / ') + '）');
  c.text = to;
}
function save(p, d) {
  CLEAR.forEach(k => { delete d[k]; });
  fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
}

/* ---------- sc-0012 ---------- */
{
  const { p, d, m } = load('sc-0012');
  /* ① n3：表头与 n4 一致；怀疑点=名字与纪要相同 */
  m.n3.text = '小满伸手把老张摊开的笔记本合上，说链接她可以先帮忙测一遍，看报名表跳不跳。阿哲让开半个身子，后台草稿摊在屏幕上。她一行行往下拉，拉到分组名单那栏——小标题写着团建分组，底下的名字却按部门排得整整齐齐，和她手机上那份纪要里的名单，一个不差。她没吭声，把那一屏停住，回头看了一眼站在打印机旁的莉姐。';
  /* ② n12：不再引用未铺垫的文件 */
  m.n12.text = '总监把手机递回来，说改。阿哲回到后台，把名单那一栏整个撤下来，只留团建的行程和报名入口，报名表整张留着，已经填过的人一个没动。小满盯着他按下发送，群里那条通知出去了：团建照原计划，分组现场再定。屏幕上的报名数字还在往上跳。';
  /* ③ 选项与标题同步 */
  setChoice(m, 'n10', '把链接改成真团建', '把分组名单撤下来');
  m.n12.label = '名单撤下，团建照常';
  if (m.n12.ending) m.n12.ending.title = '名单撤下，团建照常';
  d.story.endings.forEach(e => { if (e.nodeId === 'n12') e.title = '名单撤下，团建照常'; });
  save(p, d);
  console.log('[sc-0012] n3=' + cjk(m.n3.text) + ' n12=' + cjk(m.n12.text) + ' | 结局标题=' + m.n12.ending.title);
}

/* ---------- sc-0010 ---------- */
{
  const { p, d, m } = load('sc-0010');
  m.n14.text = '小林把那沓旧周报抱到周组长面前，一份一份摊开。翻到中间，夹着的一份旧稿滑了出来，署名正是周组长。他顺着往下读：开头写窗外天色，中间写流程，结尾一段感悟，情绪词一行接一行，和模板一个字不差。周组长低头看着那一页，杯盖捏在手里没拧上，话说到一半停了。';
  const c = (m.n11.choices || []).find(c => c.text.indexOf('旧周报') >= 0);
  if (c) c.text = '把那沓旧周报抱去组长面前摊开';
  else console.log('  注意：n11 未找到「旧周报」选项，现有:', (m.n11.choices || []).map(x => x.text).join(' / '));
  save(p, d);
  console.log('[sc-0010] n14=' + cjk(m.n14.text) + ' | n11 选项=' + (m.n11.choices || []).map(x => x.text).join(' / '));
}

/* ---------- 结构校验 ---------- */
let bad = 0;
['sc-0010', 'sc-0012'].forEach(id => {
  const d = JSON.parse(fs.readFileSync(path.join(R, 'content', 'drafts', id + '.json'), 'utf8'));
  const r = V.validateStory(d.story, { wantPaths: true });
  if (!r.ok) { bad++; console.log('✗ ' + id + ': ' + JSON.stringify(r.errors.slice(0, 4))); }
  else console.log('✓ ' + id + ' 结构通过');
});
process.exit(bad ? 1 : 0);
