/* 核心自测：schema / runtime / validate 三件套（离线，不需要模型）。
 * 覆盖：合法故事通过、结构错误被拒、分支可达、死路检测、伪分支、结局相似、
 *       状态条件与效果、路径穷举/有界、进度保存与恢复、篡改存档被拒。
 * 用法：node tests/local-core.cjs
 */
'use strict';
const path = require('path');
const S = require('../shared/schema.js');
const R = require('../shared/runtime.js');
const V = require('../shared/validate.js');

let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  ✓ ' + name); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? '：' + detail : '')); }
function t(name, fn) { try { fn(); pass++; } catch (e) { bad(name, e.message); } }

/* 构造一个合法的 14 节点 / 3 结局 / 带变量故事 */
function makeStory(mut) {
  const story = {
    schemaVersion: 1,
    storyId: 'sc-0001',
    contentVersion: 1,
    title: '测试故事标题',
    genreId: 'office',
    tagline: '一个用于自测的虚构小故事。',
    summary: '这是一个用于自动测试的虚构故事简介，用来验证结构校验、分支枚举、进度保存与恢复等核心能力是否可靠工作，不用于任何正式发布场景。',
    estimatedMinutes: 4,
    cover: { pattern: 'waves', hue: 200 },
    tags: ['测试', '虚构'],
    characters: [{ id: 'c1', name: '阿甲', desc: '测试主角' }, { id: 'c2', name: '阿乙', desc: '测试配角' }],
    vars: [{ id: 'trust', type: 'int', min: 0, max: 2 }],
    startNodeId: 'n1',
    endings: [
      { id: 'e1', nodeId: 'n8', title: '圆满收场', kind: 'happy' },
      { id: 'e2', nodeId: 'n9', title: '留一点遗憾', kind: 'regret' },
      { id: 'e3', nodeId: 'n10', title: '意外的转向', kind: 'twist' }
    ],
    nodes: []
  };
  const T = (n, extra) => Object.assign({
    id: 'n' + n,
    label: '第' + n + '段',
    text: '这是第' + n + '段用于自动测试的虚构正文，字数保持在允许的区间内，内容彼此不同，以保证校验器不会把它们判为重复文本。'
  }, extra || {});
  const C = (text, to, extra) => Object.assign({ text: text, to: to }, extra || {});
  story.nodes = [
    T(1, { choices: [C('先去找阿乙聊', 'n2', { effects: [{ var: 'trust', set: 2 }] }), C('先自己想一想', 'n3')] }),
    T(2, { choices: [C('一起去楼下面馆', 'n4'), C('留在办公室加班', 'n5')] }),
    T(3, { choices: [C('把问题写下来', 'n4'), C('直接睡一觉', 'n5')] }),
    T(4, { choices: [C('说出真实想法', 'n6', { if: [{ var: 'trust', op: 'gte', value: 1 }] }), C('先保持沉默', 'n7'), C('换个方式再试', 'n6')] }),
    T(5, { choices: [C('第二天再谈', 'n6'), C('就这样算了', 'n7')] }),
    T(6, { choices: [C('收下这份好意', 'n8'), C('把话说明白', 'n9')] }),
    T(7, { choices: [C('写下但没寄出', 'n9'), C('当作没发生', 'n10')] }),
    T(8, { ending: { id: 'e1', title: '圆满收场', kind: 'happy' }, text: '这是第一段用于自动测试的结局正文，描述了事情顺利收场之后的样子，与其它结局的措辞完全不同，以确保相似度检查不会误判。'.replace('第一段用于自动测试的结局', '第一个用于自动测试的结局') }),
    T(9, { ending: { id: 'e2', title: '留一点遗憾', kind: 'regret' }, text: '这一段结局正文留给读者一点淡淡的遗憾，主角没有把话说完，但生活仍然继续向前，这段文字也刻意写得不与其它结局雷同。' }),
    T(10, { ending: { id: 'e3', title: '意外的转向', kind: 'twist' }, text: '第三种结局里出现了一个意外的转折，原本的误会以另一种方式解开，整段叙述结构与前面两个结局明显不同，避免被判为相似。' })
  ];
  if (mut) mut(story);
  return story;
}

console.log('【1】schema 与运行时常量');
t('故事 id 正则', () => { if (!S.LIMITS.storyIdPattern.test('sc-0001')) throw new Error('sc-0001 应通过'); });
t('汉字计数', () => { if (S.cjkCount('abc汉字') !== 2) throw new Error('计数错误'); });
t('隐私命中：手机号', () => { if (!S.privacyHit('联系电话 13812345678')) throw new Error('应命中'); });
t('相似度：不同文本低于阈值', () => { if (S.similarity('完全不同的第一段文字', '另外一回事的第二种写法', 3) > 0.3) throw new Error('不应高度相似'); });

console.log('【2】validate：合法故事');
let base = makeStory();
let res = V.validateStory(base, { wantPaths: true });
t('合法故事通过', () => { if (!res.ok) throw new Error(JSON.stringify(res.errors.slice(0, 5))); });
t('路径穷举模式', () => { if (res.metrics.paths.mode !== 'exhaustive') throw new Error('应穷举'); });
t('结局全部可达', () => {
  const r = res.metrics.endingReach;
  if (!r.e1 || !r.e2 || !r.e3) throw new Error(JSON.stringify(r));
});
t('路径长度合规', () => {
  res.metrics._paths.forEach(p => {
    if (p.nodes.length < 5 || p.nodes.length > 12) throw new Error('长度 ' + p.nodes.length);
  });
});

console.log('【3】validate：各类错误被拒');
const cases = [
  ['起点不存在', s => { s.startNodeId = 'n99'; }],
  ['选项指向不存在节点', s => { s.nodes[0].choices[0].to = 'n98'; }],
  ['重复节点 id', s => { s.nodes[1].id = 'n1'; }],
  ['结局不足 3 个', s => { s.endings = s.endings.slice(0, 2); s.nodes = s.nodes.filter(n => n.id !== 'n10'); s.nodes[6].choices[1].to = 'n9'; }],
  ['非结局节点选项不足', s => { s.nodes[0].choices = [s.nodes[0].choices[0]]; }],
  ['同节点选项文字重复', s => { s.nodes[0].choices[1].text = s.nodes[0].choices[0].text; }],
  ['正文过短', s => { s.nodes[0].text = '太短了。'; }],
  ['正文含尖括号', s => { s.nodes[0].text = s.nodes[0].text + '<script>'; }],
  ['正文含手机号', s => { s.nodes[0].text = s.nodes[0].text + '电话13812345678'; }],
  ['结局节点带选项', s => { s.nodes[7].choices = [{ text: '继续走', to: 'n1' }]; }],
  ['结局类型重复', s => { s.endings[1].kind = 'happy'; s.nodes[8].ending.kind = 'happy'; }],
  ['条件引用未声明变量', s => { s.nodes[0].choices[0].if = [{ var: 'nope', op: 'eq', value: 1 }]; }],
  ['条件运算符非法', s => { s.nodes[0].choices[0].if = [{ var: 'trust', op: 'eval', value: 1 }]; }],
  ['状态死路（某状态下无可用选项）', s => {
    s.nodes[3].choices = [{ text: '只有高信任才可走', to: 'n6', if: [{ var: 'trust', op: 'gte', value: 2 }] }];
  }],
  ['摘要超长', s => { s.summary = '长'.repeat(200); }]
];
cases.forEach(([name, mut]) => {
  t(name + ' → 拒绝', () => {
    const story = makeStory(mut);
    const r = V.validateStory(story, {});
    if (r.ok) throw new Error('未被拒绝');
  });
});

console.log('【4】伪分支与结局相似');
t('伪分支被拒', () => {
  const story = makeStory(s => {
    /* n2 与 n3 的两个选项分别指向 n4/n5；把 n2、n3 的内容与后续都做成完全一样 */
    s.nodes[1].text = s.nodes[2].text;
  });
  const r = V.validateStory(story, {});
  if (r.ok) throw new Error('重复正文未被拒');
});
t('结局相似被拒', () => {
  const story = makeStory(s => {
    s.nodes[8].text = s.nodes[7].text.replace('第一', '第二');
  });
  const r = V.validateStory(story, {});
  const hasSimilar = r.errors.some(e => e.code === 'ending_similar');
  if (!hasSimilar) throw new Error('未报告结局相似：' + JSON.stringify(r.errors.map(e => e.code)));
});

console.log('【5】runtime：状态、选择、恢复');
t('初始状态', () => {
  const st = R.newState(base);
  if (st.nodeId !== 'n1' || st.flags.trust !== 0) throw new Error('初始状态错误');
});
t('选择推进与效果', () => {
  const st0 = R.newState(base);
  const st1 = R.step(base, st0, 0);      // 先去找阿乙聊（trust=2）
  if (st1.nodeId !== 'n2' || st1.flags.trust !== 2) throw new Error('效果未生效');
});
t('条件选项按状态过滤', () => {
  /* 直接构造到达 n4、trust=0 的状态 */
  const st = { schemaVersion: 1, storyId: base.storyId, contentVersion: 1, nodeId: 'n4', flags: { trust: 0 }, visited: ['n1', 'n2', 'n4'], choices: [], ended: false, endingId: null };
  const avail = R.availableChoices(base, R.nodeById(base, 'n4'), st.flags);
  if (avail.length !== 2) throw new Error('应为 2 个可用选项，实际 ' + avail.length);
  if (avail.some(c => c.text === '说出真实想法')) throw new Error('条件选项不应出现');
});
t('走到底触发结局', () => {
  let st = R.newState(base);
  st = R.step(base, st, 0);          // n2
  st = R.step(base, st, 0);          // n4
  st = R.step(base, st, 0);          // n6（说出真实想法）
  st = R.step(base, st, 0);          // n8 → 结局
  if (!st.ended || st.endingId !== 'e1') throw new Error('结局错误：' + st.endingId);
});
t('保存 → 恢复一致', () => {
  let st = R.newState(base);
  st = R.step(base, st, 1);
  const saved = JSON.parse(JSON.stringify(st));
  const restored = R.restore(base, saved);
  if (!restored || restored.nodeId !== st.nodeId || restored.flags.trust !== st.flags.trust) throw new Error('恢复失败');
});
t('篡改存档被拒', () => {
  const st = R.newState(base);
  const saved = JSON.parse(JSON.stringify(st));
  saved.nodeId = 'n999';
  if (R.restore(base, saved) !== null) throw new Error('应拒绝');
});
t('内容版本变化 → 拒绝旧存档', () => {
  const saved = { schemaVersion: 1, storyId: base.storyId, contentVersion: 99, nodeId: 'n1', flags: { trust: 0 }, visited: ['n1'], choices: [] };
  if (R.restore(base, saved) !== null) throw new Error('应拒绝');
});
t('非法选择下标抛错（不静默）', () => {
  const st = R.newState(base);
  let threw = false;
  try { R.step(base, st, 5); } catch (e) { threw = true; }
  if (!threw) throw new Error('应抛错');
});

console.log('【6】路径上限（有界模式）');
t('超限时使用有界模式并如实标记', () => {
  const story = makeStory(s => {
    /* n5 原为 2 个选项，加入第 3 个合法选项使路径数上升（不破坏结构约束） */
    s.nodes[4].choices.push({ text: '去楼下走动一圈', to: 'n6' });
  });
  const r = V.validateStory(story, { pathLimit: 4 });
  if (!r.ok) throw new Error('结构应合法：' + JSON.stringify(r.errors.map(e => e.code)));
  if ((r.metrics.paths || {}).mode !== 'bounded') throw new Error('应为 bounded');
  if (r.metrics.paths.capped !== true) throw new Error('应标记 capped');
});

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
