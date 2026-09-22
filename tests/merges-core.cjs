/* 合并点检查器单元测试：node tests/merges-core.cjs */
'use strict';
const M = require('../tools/content/merges.cjs');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const mk = (id, text, tos) => ({ id, text, choices: (tos || []).map((x, i) => ({ text: '选项' + (i + 1), to: x })) });

/* 1. 地点跨域冲突：上游在机场，合并点写酒店 → 必须报出 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他坐在机场的候机厅里，看着大屏上的航班信息。', ['n3']),
    mk('n2', '他躺在酒店的房间里把行李摊开，窗外是陌生的楼群。', ['n3']),
    mk('n3', '凌晨的酒店房间里，两个人把话说到没得再说。', ['n4']),
    mk('n4', '天亮了他走出酒店大门。')
  ] };
  const issues = M.checkMerges(story);
  t('地点跨域冲突被抓出', issues.some(i => i.source === 'merge-location'), JSON.stringify(issues));
  t('跨域冲突为高置信 major', issues.filter(i => i.source === 'merge-location').every(i => i.severity === 'major' && i.highConfidence === true));
  t('报出的是上游 n1（机场 vs 酒店）', issues.some(i => String(i.issue).indexOf('n1') >= 0), JSON.stringify(issues.map(i => i.issue)));
})();

/* 2. 无冲突：合并点只写共同处境（时间/天气） → 不应报出 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他坐在机场的候机厅里，看着大屏上的航班信息。', ['n3']),
    mk('n2', '他躺在酒店的房间里把行李摊开，窗外是陌生的楼群。', ['n3']),
    mk('n3', '外面还在下雨，天色一点点亮起来，那件事仍然没有解决。', ['n4']),
    mk('n4', '天亮了他走出大门。')
  ] };
  const issues = M.checkMerges(story);
  t('共同处境描述不误报', issues.length === 0, JSON.stringify(issues));
})();

/* 3. 同一场景域内的细化地点不算冲突（机场 vs 候机厅） */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他站在机场的柜台前排队，手里攥着票。', ['n3']),
    mk('n2', '他坐在候机厅的椅子上，把头靠在包上。', ['n3']),
    mk('n3', '登机口那边又广播了一次延误通知，他站起来看了看时间。', ['n4']),
    mk('n4', '他继续等着。')
  ] };
  const issues = M.checkMerges(story);
  t('同域细化地点不误报', issues.length === 0, JSON.stringify(issues));
})();

/* 4. 在场与「独自先走」直接矛盾 → 高置信报出 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他一个人先走了，把背包甩到肩上。', ['n3']),
    mk('n2', '她在原地等了十分钟，最后还是把票收进口袋。', ['n3']),
    mk('n3', '两个人并肩坐在长椅上，谁都没先开口。', ['n4']),
    mk('n4', '后来他们终于说上了话。')
  ] };
  const issues = M.checkMerges(story);
  t('独自 vs 两人冲突为高置信', issues.some(i => i.highConfidence === true && String(i.issue).indexOf('直接矛盾') >= 0), JSON.stringify(issues.map(i => i.issue)));
})();

/* 5. 在场缺依据 → 只报 minor（不计入验收门槛） */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他在便利店门口站了很久。', ['n3']),
    mk('n2', '他对着自动售货机发呆，手里捏着那张票。', ['n3']),
    mk('n3', '两个人并肩坐在长椅上，谁都没先开口。', ['n4']),
    mk('n4', '后来他们终于说上了话。')
  ] };
  const issues = M.checkMerges(story);
  t('在场缺依据只报 minor', issues.length > 0 && issues.every(i => i.severity === 'minor' && i.highConfidence === false), JSON.stringify(issues));
})();

/* 6. 非合并点不检查 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他在机场的候机厅里坐着。', ['n2']),
    mk('n2', '酒店房间里很安静。')
  ] };
  const issues = M.checkMerges(story);
  t('非合并点不报告', issues.length === 0, JSON.stringify(issues));
})();

/* 7.「那一刻」等时间指代不得被当成地点 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '他坐在机场里，等着广播。', ['n3']),
    mk('n2', '他在酒店的床上翻来覆去。', ['n3']),
    mk('n3', '原定坐在会议室里的那一刻已经过去了，谁也补不回来。', ['n4']),
    mk('n4', '他起身走了。')
  ] };
  const issues = M.checkMerges(story);
  t('时间指代不误判为地点冲突', issues.filter(i => i.source === 'merge-location').length === 0, JSON.stringify(issues.map(i => i.issue)));
})();

/* 8. 时间倒流：上游「天亮」，合并点「夜色未退」 → 高置信报出 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '天已经亮了，站台上的人开始排队。', ['n3']),
    mk('n2', '天已经大亮，车窗外的地名一个个过去。', ['n3']),
    mk('n3', '夜色还压着，离天亮剩一截最难熬的工夫。', ['n4']),
    mk('n4', '他站起来走了。')
  ] };
  const issues = M.checkMerges(story);
  t('时间倒流被抓出', issues.some(i => i.source === 'merge-time' && i.highConfidence === true), JSON.stringify(issues.map(i => i.issue)));
})();

/* 9. 相邻时段（清晨 vs 天亮）不算倒流 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '天蒙蒙亮，站台上没什么人。', ['n3']),
    mk('n2', '天刚亮，风还很硬。', ['n3']),
    mk('n3', '天已经亮了，人渐渐多起来。', ['n4']),
    mk('n4', '他站起来走了。')
  ] };
  const issues = M.checkMerges(story);
  t('相邻时段不误报倒流', issues.filter(i => i.source === 'merge-time').length === 0, JSON.stringify(issues.map(i => i.issue)));
})();

/* 10. 状态分歧：一个上游说班次作废，另一个说还在滚动 → 合并点断言班次作废应报出 */
(() => {
  const story = { characters: [], nodes: [
    mk('n1', '屏幕上的班次全部作废，告示牌被风吹得直响。', ['n3']),
    mk('n2', '屏幕上的班次还在往下滚，他盯着看了很久。', ['n3']),
    mk('n3', '班次都作废了，两个人只剩一个念头：走还是留。', ['n4']),
    mk('n4', '他起身走了。')
  ] };
  const issues = M.checkMerges(story);
  t('状态分歧被抓出', issues.some(i => i.source === 'merge-state' && i.highConfidence === true), JSON.stringify(issues.map(i => i.issue)));
})();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
