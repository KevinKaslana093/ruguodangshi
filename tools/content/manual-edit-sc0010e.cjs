/* sc-0010 第六轮修复（review-b6 后）。
 *   [major] n8 :: 小林刚应下素材库，阿梅却说「她先接了」→ 归属冲突（n6 来路）
 *                  → 修法：n8 改为「素材库的事先放一放，她手头这套模板更要紧」，
 *                    不再断言归属，两条来路都成立。
 *   [minor] n13 :: n10 已把稿子递出，n13 却说「稿子仍搁在桌角」→ n13 改为「递出去的稿子没再被提起」
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

m.n8.text = '阿梅的屏幕上字还在往下滚。小林把椅子拖过去，压低声音问：标点不算，重复的句子不算，情绪词也不算，那有效字数到底怎么算？阿梅手上没停，说素材库那摊子先放一放，这套能替换的句子更要紧，想要就自己抄。她把笔记本往他那边转了半寸。桌角那沓打印稿还搁着。';

m.n13.text = '晨会照常开。那篇稿子递上去以后，一页也没被提起。散会后转正名单贴到墙上，小林从头看到尾，没找到自己的名字。茶水间那张榜还贴着，他那三行也还压在最下面。';

CLEAR.forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');

const r = V.validateStory(d.story, { wantPaths: true });
console.log('sc-0010 第六轮：结构', r.ok ? '通过' : '失败', '| n8=' + cjk(m.n8.text), 'n13=' + cjk(m.n13.text));
if (!r.ok) { console.log(JSON.stringify(r.errors.slice(0, 5), null, 1)); process.exit(1); }
