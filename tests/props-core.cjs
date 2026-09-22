/* 道具铺垫检查器单元测试：node tests/props-core.cjs */
'use strict';
const P = require('../tools/content/props.cjs');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const mk = (id, text, tos) => ({ id, text, choices: (tos || []).map((x, i) => ({ text: '选项' + (i + 1), to: x })) });

/* 1. 无铺垫道具：两个上游都没买票，合并/后续节点写「票还在手里」 → 报出 */
(() => {
  const story = { nodes: [
    mk('n1', '他在柜台前犹豫，最后还是转身走了出去。', ['n3']),
    mk('n2', '她把手机收进口袋，没有再说什么。', ['n3']),
    mk('n3', '票还在手里，边角被捏得发软。', ['n4']),
    mk('n4', '天亮了他起身离开。')
  ] };
  const issues = P.checkProps(story);
  t('无铺垫道具被抓出', issues.length > 0, JSON.stringify(issues));
  t('报为高置信 major', issues.every(i => i.severity === 'major' && i.highConfidence === true));
  t('指出的正是「票」', issues.some(i => i.issue.indexOf('票') >= 0), JSON.stringify(issues.map(i => i.issue)));
})();

/* 2. 有铺垫：上游出现过该道具 → 不报 */
(() => {
  const story = { nodes: [
    mk('n1', '她把票攥在手里，边角已经被捏软了。', ['n3']),
    mk('n2', '她低头看着那张票上的时间。', ['n3']),
    mk('n3', '票还在手里，边角被捏得发软。', ['n4']),
    mk('n4', '天亮了她起身离开。')
  ] };
  const issues = P.checkProps(story);
  t('有铺垫不误报', issues.length === 0, JSON.stringify(issues));
})();

/* 3. 当场引入：本节点用出现动词首次引入道具 → 允许 */
(() => {
  const story = { nodes: [
    mk('n1', '走廊里很安静，他站了一会儿。', ['n3']),
    mk('n2', '窗外的雨没停，他把外套拉紧。', ['n3']),
    mk('n3', '护士递来一张毯子，他接过来盖在腿上。', ['n4']),
    mk('n4', '他坐了很久。')
  ] };
  const issues = P.checkProps(story);
  t('当场引入的道具不误报', issues.length === 0, JSON.stringify(issues));
})();

/* 4. 假设句里的道具不算出现 */
(() => {
  const story = { nodes: [
    mk('n1', '他坐在长椅上，看着远处。', ['n3']),
    mk('n2', '风把树叶吹得响，他缩了缩脖子。', ['n3']),
    mk('n3', '要是当时手里有一张票，他会立刻走。', ['n4']),
    mk('n4', '他站起来走了。')
  ] };
  const issues = P.checkProps(story);
  t('假设句不误报', issues.length === 0, JSON.stringify(issues));
})();

/* 5. 设施被当作「已有」引用（延续性指代）→ 报出 */
(() => {
  const story = { nodes: [
    mk('n1', '他在候车厅里坐着，看着屏幕。', ['n3']),
    mk('n2', '她去买了一瓶水，回来时座位空了。', ['n3']),
    mk('n3', '回到那辆接驳车上，他把箱子放在脚边。', ['n4']),
    mk('n4', '车开了很久。')
  ] };
  const issues = P.checkProps(story);
  t('延续性引用的设施被抓出', issues.some(i => i.issue.indexOf('接驳车') >= 0), JSON.stringify(issues.map(i => i.issue)));
})();

/* 6. 单链故事（无分叉）中也应工作 */
(() => {
  const story = { nodes: [
    mk('n1', '他走进房间，坐下。', ['n2']),
    mk('n2', '房卡插进卡槽，灯亮了。', ['n3']),
    mk('n3', '他躺下休息。')
  ] };
  const issues = P.checkProps(story);
  t('单链结构中当场引入不误报', issues.length === 0, JSON.stringify(issues));
})();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
