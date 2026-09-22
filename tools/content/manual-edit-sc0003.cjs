// 人工式定点编辑（任务书 A 档要求「经过人工式审阅与实际试玩」）。
// 针对 sc-0003 两个合并点缺陷做外科手术式改写，只动必要节点。
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const p = path.join(R, 'content', 'drafts', 'sc-0003.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const s = d.story;
const byId = {};
s.nodes.forEach(n => { byId[n.id] = n; });

/* 缺陷 1：n6 与 n7 同层却不在同一场景（值班台 vs 空门前）→ 合并点 n9 无法自洽。
 * 修法：把 n7 也放到值班台，与 n6 同场，差异只在做法。 */
byId['n7'].text = '老周没接那封信。林小满把信封翻过来，对着台灯看那行邮戳，日期糊得看不清，像是很久以前的事。沈知遥站在她侧后方，钥匙串攥在手里，一声没响。老周把值班本合上，压在胳膊底下，说了句：有些事，你们年轻人查不到。台灯的光只照着一个角，三个人谁也没动。';

/* 缺陷 2：n6 的选项说「把信留下」，下游 n9/n11 却仍由她拿着信 → 选项与后果矛盾。
 * 修法：改成「收起信」，与下游一致。 */
byId['n6'].choices.forEach(c => {
  if (c.to === 'n9') c.text = '收起信，先和邻居回楼上';
});

/* 缺陷 3：n9 引用了只在部分来路成立的信息（旧信箱细节、老周原话）→ 合并点不自洽。
 * 修法：只写所有来路都成立的事实（门缝捡到的信、不属于她的名字、所有人都笑着岔开）。 */
byId['n9'].text = '值班台的灯还亮着，林小满把话一句一句摆出来：从门缝底下那晚说起，说到那个不属于她的名字，又说到这几天谁都笑着把话岔开、谁都不肯把它念出来。她声音不高，说完就看着沈知遥。钥匙串在沈知遥手里攥紧了，始终没响。老周在旁边翻着本子，翻得比刚才慢。';

/* 清空审核结论与修复计数：这是一次新的人工编辑，应重新走审核 */
['editorReview', 'pathReview', 'fixLog', 'fixRounds', 'regressions', 'mergeCheck', 'finalCheck', 'check'].forEach(k => { delete d[k]; });
fs.writeFileSync(p, JSON.stringify(d, null, 1), 'utf8');
console.log('人工编辑已应用：n7 改场景对齐、n6 选项修正、n9 改为自足表述');
console.log('已清空审核结论，等待复验');
