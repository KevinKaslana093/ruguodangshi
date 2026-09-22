/* 一致性诊断 第二轮（纯程序）：检验「具体实物操作」假设。
 *
 * 第一轮结论：「零共享 2-gram」不可用 —— 好样本 label 20/110、选项 53/173 零共享。
 *   好样本的零共享是「认了」「赞成投票」「按老规矩来」这类**抽象/言语行为**（合法：落点写的是
 *   这个决定的后果，字面自然不重复）。
 *   坏样本是「切成小块」「盒上贴张便签」「切成小块，说这是特制咸味」这类**具体实物操作**
 *   ——选项承诺了一个物理动作 + 实物对象，落点却完全没做这件事。
 *
 * 本轮假设：把「实物名词」单独抽出来判断。若选项提到具体实物（块/盒/便签/刀/盘/袋…），
 *   而落点正文里完全没有该实物 → 高置信的「选项与落点脱节」。
 *
 * 用法：node tools/verify/consistency-scan2.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');

/* 具体实物名词（可被物理操作的对象；不含抽象概念） */
const OBJECTS = [
  '小块', '块', '盒', '盒子', '便签', '标签', '纸条', '刀', '叉', '盘子', '盘', '碗', '杯', '杯子',
  '袋', '袋子', '罐', '罐子', '瓶', '瓶子', '包', '箱子', '纸箱', '卡片', '贺卡', '蜡烛', '蛋糕',
  '票', '钥匙', '手机', '电脑', '灯', '门', '窗', '信', '信封', '笔', '本子', '相框', '礼物',
  '冰箱', '抽屉', '柜子', '橱柜', '锅', '勺', '抹布', '扫帚', '垃圾', '水', '面糊', '糖', '盐'
];

/* 物理动作动词 */
const ACTIONS = [
  '切', '贴', '装', '倒', '倒掉', '擦', '洗', '摆', '端', '拿', '放', '收', '藏', '扔', '撕',
  '折', '打开', '关上', '锁', '拆', '包', '裹', '烤', '煮', '热', '放进', '塞', '取出', '掏出',
  '递给', '推', '挪', '盖', '掀', '敲', '按', '写', '画', '拍照', '发'
];

const HAN = /[\u4e00-\u9fa5]/;

function objectsIn(text) {
  const t = String(text || '');
  return OBJECTS.filter(o => t.includes(o));
}
function actionsIn(text) {
  const t = String(text || '');
  return ACTIONS.filter(a => t.includes(a));
}

const dir = path.join(R, 'content', 'stories');
const stories = [];
fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().forEach(f => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  stories.push({ file: f.replace('.json', ''), story: raw.story || raw });
});

/* ---------- 选项侧：选项含实物且含物理动作，而落点完全没有该实物 ---------- */
console.log('='.repeat(74));
console.log('假设检验：选项提到具体实物 + 物理动作，落点正文完全没有该实物');
console.log('='.repeat(74));

const suspects = [];
let optTotal = 0, withObjAndAct = 0;
stories.forEach(({ file, story }) => {
  const byId = {};
  (story.nodes || []).forEach(n => { byId[n.id] = n; });
  (story.nodes || []).forEach(n => {
    (n.choices || []).forEach(c => {
      const land = byId[c.to];
      if (!land) return;
      optTotal++;
      const objs = objectsIn(c.text);
      const acts = actionsIn(c.text);
      if (!objs.length || !acts.length) return;
      withObjAndAct++;
      const missing = objs.filter(o => !String(land.text || '').includes(o));
      if (missing.length) {
        suspects.push({ file, from: n.id, to: c.to, opt: c.text, missing, land: String(land.text || '').slice(0, 70) });
      }
    });
  });
});

console.log('选项总数:', optTotal, '| 含实物+动作的选项:', withObjAndAct);
console.log('落点缺少该实物的:', suspects.length, '(', (suspects.length / Math.max(1, withObjAndAct) * 100).toFixed(1), '% of 含实物选项 )');
console.log();
suspects.forEach(s => {
  console.log('  [' + s.file + ' ' + s.from + '→' + s.to + '] 缺失实物: ' + s.missing.join('/'));
  console.log('      选项: ' + s.opt);
  console.log('      落点: ' + s.land + '…');
  console.log();
});

/* ---------- label 侧：label 含实物，正文完全没有该实物 ---------- */
console.log('='.repeat(74));
console.log('label 侧：label 提到具体实物，正文完全没有该实物');
console.log('='.repeat(74));
let labelTotal = 0;
const labelSuspects = [];
stories.forEach(({ file, story }) => {
  (story.nodes || []).forEach(n => {
    if (!n.label) return;
    labelTotal++;
    const objs = objectsIn(n.label);
    if (!objs.length) return;
    const missing = objs.filter(o => !String(n.text || '').includes(o));
    if (missing.length) labelSuspects.push({ file, id: n.id, label: n.label, missing, text: String(n.text || '').slice(0, 60) });
  });
});
console.log('节点总数:', labelTotal, '| 可疑:', labelSuspects.length);
labelSuspects.forEach(s => {
  console.log('  [' + s.file + ' ' + s.id + '] 缺失实物: ' + s.missing.join('/') + ' | label=' + s.label);
  console.log('      正文: ' + s.text + '…');
});

/* ---------- 坏样本验证 ---------- */
console.log();
console.log('='.repeat(74));
console.log('坏样本是否被此规则命中');
console.log('='.repeat(74));
const bad = [
  { what: '选项「切成小块，说这是特制咸味」→ v21 n7 正文（擦盘摆盘）',
    opt: '切成小块，说这是特制咸味',
    land: '小陶找了块干抹布，把盘沿一圈圈擦净，端起来比了两次位置，最后摆在桌子正中间，刀叉斜着码好，间距都匀。小满靠着橱柜看他忙这些，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把卡片收进兜里，窗外的天开始从黑转灰。他说：就当是新口味。' },
  { what: '选项「盒上贴张便签，不写具体字样」→ v20 n7 正文（切块摆盘，无盒）',
    opt: '盒上贴张便签，不写具体字样',
    land: '小陶把那盘蛋糕端到台面中间，拿刀切成一块一块，切面朝上码着，谁想吃哪块自己拿。小满靠在橱柜边看着他，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把那张写到一半的卡片收进兜里。窗外的天开始从黑转灰。他说：就当是新口味。' },
  { what: 'label「切成小块码好」→ v21 n7 正文（已不切块）',
    opt: '切成小块码好',
    land: '小陶找了块干抹布，把盘沿一圈圈擦净，端起来比了两次位置，最后摆在桌子正中间，刀叉斜着码好，间距都匀。小满靠着橱柜看他忙这些，没帮忙，也没走开。写着糖的那只罐子被推到角落，标签还朝外翻着。小陶把卡片收进兜里。窗外的天开始从黑转灰。他说：就当是新口味。' }
];
bad.forEach(c => {
  const objs = objectsIn(c.opt);
  const acts = actionsIn(c.opt);
  const missing = objs.filter(o => !c.land.includes(o));
  const hit = objs.length && acts.length && missing.length;
  console.log((hit ? '★ 命中 ' : '  未命中 ') + '| 实物=' + (objs.join('/') || '无') + ' 动作=' + (acts.join('/') || '无') + ' 缺失=' + (missing.join('/') || '无'));
  console.log('      ' + c.what);
});
