/* sc-0012 第三轮修复（隔离后）。
 *
 * [major] n14 :: n5 里莉姐已出示预案文档（泄底），n11/n14 却把它当成需追查的悬念 → 自相矛盾
 *   [minor] n6  :: 阿哲称「后台权限不在他手上」，但 n3 能开后台草稿、n8 能导出报名表 → 权限说法不一
 *
 * 修法：
 *   ① n5 改为「她只提到人事那边有这么一个文档、要走流程才能调」，不出示、不泄露内容
 *      → n11 的「谁手里还有」与 n14 的「一路问到人事，把原件调出来」重新成立，twist 保住了；
 *   ② n6 改为「后台我能看，可撤入口等于停活动」——区分「查看」与「撤下」两种权限；
 *   ③ n9 的选项文案同步（它通向 n11）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const V = require(path.join(R, 'shared', 'validate.js'));

const cjk = s => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
const CLEAR = ['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check', 'consistencyReview'];

const p = path.join(R, 'content', 'drafts', 'sc-0012.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const m = {};
d.story.nodes.forEach(n => { m[n.id] = n; });

/* ① n5：只提文档，不出示 */
m.n5.text = '小会议室里，小满把手机推到莉姐面前：这一栏，你那边有没有原始版本。莉姐翻着自己的手机，翻了两下又停住，说人事那边确有这么一个文档，标题就写着优化分组，可要调原件得走流程，走到哪一层，她也没查清。阿哲盯着屏幕：那就是有人复制的时候顺手改了标题。老张把笔放下。桌上没人接话，报名数字还在跳。';

/* ② n6：权限说法一致（能看 ≠ 能撤） */
m.n6.text = '桌上摊着一路翻出来的东西。小满说先关入口，报名一停，被写进那张表的人就少一个。阿哲说后台他能看，可能撤入口的权限不在他手上，撤入口等于停活动，他签不了这个字。老张说流程上得市场部点头。莉姐把话留了一半：真撤了，就等于承认发错了。四个人对着屏幕，报名数字还在往上走。';

/* ③ n9 选项同步（它通向 n11） */
{
  const c = (m.n9.choices || []).find(c => c.text.indexOf('澄清稿') >= 0);
  if (c) c.text = '先把澄清稿写好，再等原件';
}

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0012 第三轮：结构', r.ok ? '通过' : '失败', '| n5=' + cjk(m.n5.text), 'n6=' + cjk(m.n6.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
