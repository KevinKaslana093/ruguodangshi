/* 既成事实分歧检查器单元测试：node tests/facts-core.cjs */
'use strict';
const F = require('../tools/content/facts.cjs');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const mk = (id, text, tos) => ({ id, text, choices: (tos || []).map((x, i) => ({ text: '选项' + (i + 1), to: x })) });

/* 1. 住宿域「已办成 vs 没办成」→ blocker */
(() => {
  const story = { nodes: [
    mk('n1', '前台说现在只剩套房了，他把卡递了过去，办好了入住。', ['n3']),
    mk('n2', '前台说没房了，两个人只好在大厅长椅上坐下。', ['n3']),
    mk('n3', '这一夜还长，两个人都没说话。', [])
  ] };
  const issues = F.checkFacts(story);
  t('住宿既成事实分歧被抓出', issues.some(i => i.issue.indexOf('住宿') >= 0), JSON.stringify(issues.map(i => i.issue)));
  t('报为高置信 blocker', issues.filter(i => i.issue.indexOf('住宿') >= 0).every(i => i.severity === 'blocker' && i.highConfidence === true));
})();

/* 2. 两条分支都「正在谈、尚无结果」→ 不报 */
(() => {
  const story = { nodes: [
    mk('n1', '他走到前台问还有没有房间，话说到一半又停住了。', ['n3']),
    mk('n2', '她站在前台旁边看价目牌，两个人谁都没先开口。', ['n3']),
    mk('n3', '夜深了，前台后面的灯还亮着。', [])
  ] };
  t('过程表述不误报', F.checkFacts(story).length === 0, JSON.stringify(F.checkFacts(story).map(i => i.issue)));
})();

/* 3. 「都办成」不算分歧 */
(() => {
  const story = { nodes: [
    mk('n1', '他办好了入住，拿到房卡。', ['n3']),
    mk('n2', '她也办好了入住，前台把房卡推过来。', ['n3']),
    mk('n3', '两个人一起进了房间。', [])
  ] };
  t('同为办成不报', F.checkFacts(story).filter(i => i.issue.indexOf('住宿') >= 0).length === 0);
})();

/* 4. 票务域分歧 */
(() => {
  const story = { nodes: [
    mk('n1', '他把票买到了手，捏着那张登机牌。', ['n3']),
    mk('n2', '柜台说没票了，他只好算了。', ['n3']),
    mk('n3', '两个人站在原地看着屏幕。', [])
  ] };
  const issues = F.checkFacts(story);
  t('票务分歧被抓出', issues.some(i => i.issue.indexOf('票务') >= 0), JSON.stringify(issues.map(i => i.issue)));
})();

/* 5. 不同域的各自断言不互相干扰 */
(() => {
  const story = { nodes: [
    mk('n1', '他刷卡付了房费，办好了入住。', ['n3']),
    mk('n2', '他去买了票，登机牌拿到手了。', ['n3']),
    mk('n3', '两个人在灯下等着。', [])
  ] };
  const issues = F.checkFacts(story);
  t('不同域不误报（住宿只在一个上游出现）', issues.filter(i => i.issue.indexOf('住宿') >= 0).length === 0,
    JSON.stringify(issues.map(i => i.issue)));
})();

/* 6. 非合并点（单一上游）不检查 */
(() => {
  const story = { nodes: [
    mk('n1', '办好了入住。', ['n2']),
    mk('n2', '拿到房卡。', [])
  ] };
  t('单链不检查', F.checkFacts(story).length === 0);
})();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
