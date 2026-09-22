/* 骨架校验器（tools/content/outline.cjs）单元测试：node tests/outline-core.cjs */
'use strict';
const OC = require('../tools/content/outline.cjs');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* 一个结构合法的精品骨架：17 节点、三结局都可从 n1 走到、最短路径 6 段 */
function goodSkeleton() {
  return {
    title: '测试故事', summary: '一个用于测试的简介，长度不重要。',
    characters: [{ id: 'c1', name: '甲', desc: '主角' }, { id: 'c2', name: '乙', desc: '朋友' }],
    endings: [
      { id: 'e1', nodeId: 'n15', title: '结局一', kind: 'happy' },
      { id: 'e2', nodeId: 'n16', title: '结局二', kind: 'regret' },
      { id: 'e3', nodeId: 'n17', title: '结局三', kind: 'twist' }
    ],
    outline: [
      { id: 'n1', label: '开场', choices: [{ text: '选择一', to: 'n2' }, { text: '选择二', to: 'n3' }] },
      { id: 'n2', choices: [{ text: '继续一', to: 'n4' }, { text: '继续二', to: 'n5' }] },
      { id: 'n3', choices: [{ text: '继续三', to: 'n5' }, { text: '继续四', to: 'n6' }] },
      { id: 'n4', choices: [{ text: '前进一', to: 'n7' }, { text: '前进二', to: 'n8' }] },
      { id: 'n5', choices: [{ text: '前进三', to: 'n8' }, { text: '前进四', to: 'n9' }] },
      { id: 'n6', choices: [{ text: '前进五', to: 'n9' }, { text: '前进六', to: 'n10' }] },
      { id: 'n7', choices: [{ text: '收束甲', to: 'n11' }, { text: '收束乙', to: 'n12' }] },
      { id: 'n8', choices: [{ text: '收束丙', to: 'n11' }, { text: '收束丁', to: 'n12' }] },
      { id: 'n9', choices: [{ text: '转向甲', to: 'n12' }, { text: '转向乙', to: 'n13' }] },
      { id: 'n10', choices: [{ text: '另择甲', to: 'n13' }, { text: '另择乙', to: 'n14' }] },
      { id: 'n11', choices: [{ text: '收尾甲', to: 'n15' }, { text: '收尾乙', to: 'n16' }] },
      { id: 'n12', choices: [{ text: '收尾丙', to: 'n15' }, { text: '收尾丁', to: 'n16' }] },
      { id: 'n13', choices: [{ text: '回望甲', to: 'n16' }, { text: '回望乙', to: 'n17' }] },
      { id: 'n14', choices: [{ text: '落定甲', to: 'n16' }, { text: '落定乙', to: 'n17' }] },
      { id: 'n15', endingId: 'e1' },
      { id: 'n16', endingId: 'e2' },
      { id: 'n17', endingId: 'e3' }
    ]
  };
}

/* 1. 合法骨架必须通过 */
(() => {
  const r = OC.checkOutline(goodSkeleton(), { premium: true });
  t('合法骨架通过', r.ok, (r.errors || []).join('；'));
  t('节点数为 17', r.metrics && r.metrics.nodes === 17, JSON.stringify(r.metrics));
  t('最短路径在合理范围', r.metrics && r.metrics.shortestPath >= 6, JSON.stringify(r.metrics));
  t('三个结局都保留', r.story.endings.length === 3);
})();

/* 2. 指向自身的回边必须被剔除（无环保证） */
(() => {
  const s = goodSkeleton();
  s.outline[1].choices.push({ text: '回头', to: 'n1' });
  const r = OC.checkOutline(s, { premium: true });
  t('回边被剔除且仍通过', r.ok && !r.story.outline[1].choices.some(c => c.to === 'n1'));
})();

/* 3. 指向不存在节点的选项必须被剔除 */
(() => {
  const s = goodSkeleton();
  s.outline[0].choices.push({ text: '去没影的地方', to: 'n99' });
  const r = OC.checkOutline(s, { premium: true });
  t('非法目标被剔除', r.ok && !r.story.outline[0].choices.some(c => c.to === 'n99'));
})();

/* 4. 不可达节点必须被丢弃 */
(() => {
  const s = goodSkeleton();
  s.outline.push({ id: 'nX', choices: [{ text: '孤岛继续', to: 'nY' }] });
  s.outline.push({ id: 'nY', choices: [] });
  const r = OC.checkOutline(s, { premium: true });
  /* 注意：id 会被规范化重排，所以按“节点数仍为 17”与“存在丢弃记录”判断 */
  t('不可达节点被丢弃', r.ok && r.metrics.nodes === 17, JSON.stringify(r.metrics) + ' | ' + (r.errors || []).join('；'));
  t('丢弃行为写入审计记录', (r.errors || []).some(e => e.indexOf('丢弃不可达节点') >= 0));
})();

/* 5. 结局登记缺失且叶节点不足 → 明确失败 */
(() => {
  const s = goodSkeleton();
  /* 去掉 n15/n16/n17 的结局标记，并让 n15、n16 都有出边 → 只剩 n17 一个叶节点 */
  s.outline[14].endingId = null;
  s.outline[15].endingId = null; s.outline[15].choices = [{ text: '继续甲', to: 'n17' }];
  s.outline[16].endingId = null;
  s.endings = [];
  const r = OC.checkOutline(s, { premium: true });
  t('叶节点不足时明确失败而非静默补齐', !r.ok, JSON.stringify(r.errors));
})();

/* 5b. 结局缺失且叶节点充足 → 自动补齐 */
(() => {
  const s = goodSkeleton();
  s.outline[14].endingId = null;   /* 只留 n16、n17 两个结局 */
  s.endings = [];
  const r = OC.checkOutline(s, { premium: true });
  t('叶节点充足时自动补齐结局', r.ok && r.story.endings.length === 3, JSON.stringify(r.errors));
  t('补齐记录写入 errors 供审计', (r.errors || []).some(e => e.indexOf('自动补齐') >= 0));
})();

/* 5c. 路径过短必须失败（骨架阶段就要挡住） */
(() => {
  const s = goodSkeleton();
  /* n1 直接跳到一个浅层节点 n2，再往下 —— 构造出一条很短的通往结局的路径 */
  s.outline[1].choices = [{ text: '直通甲', to: 'n15' }, { text: '直通乙', to: 'n16' }];
  /* 同时让 n5/n6 也直通结局，保证最短路径确实变短 */
  const r = OC.checkOutline(s, { premium: true });
  t('路径过短 → 骨架不合格', !r.ok && (r.errors || []).some(e => e.indexOf('最短路径过短') >= 0 || e.indexOf('可达节点过少') >= 0), JSON.stringify(r.errors));
})();

/* 6. 叶节点不足时必须明确失败（不可静默通过） */
(() => {
  const s = goodSkeleton();
  /* 所有节点连成一条线，只有一个叶节点 → 无法凑出 3 个结局 */
  for (let i = 0; i < s.outline.length - 1; i++) {
    s.outline[i].endingId = null;
    s.outline[i].choices = [{ text: '继续', to: s.outline[i + 1].id }];
  }
  s.outline[s.outline.length - 1].endingId = 'e1';
  s.endings = [];
  const r = OC.checkOutline(s, { premium: true });
  t('叶节点不足 → 明确失败', !r.ok, JSON.stringify(r.errors));
})();

/* 7. 选项文字重复必须去重 */
(() => {
  const s = goodSkeleton();
  s.outline[0].choices = [{ text: '一样的', to: 'n2' }, { text: '一样的', to: 'n3' }];
  const r = OC.checkOutline(s, { premium: true });
  t('同节点重复选项被去重', r.ok && r.story.outline[0].choices.length === 1);
})();

/* 8. assemble：骨架 + 正文 → 结构合法的 story */
(() => {
  const r = OC.checkOutline(goodSkeleton(), { premium: true });
  const texts = {};
  r.story.outline.forEach(n => { texts[n.id] = n.endingId ? '这是一个结局节点的正文，用来测试装配流程是否正常工作，结尾收束在这条线上。' : '这是一个普通节点的正文，用来测试装配流程是否正常工作，读者读到这里可以选择后面的走向。'; });
  const story = OC.assemble(r.story, texts);
  t('装配出的故事节点数与骨架一致', story.nodes.length === r.story.outline.length, story.nodes.length + ' vs ' + r.story.outline.length);
  t('结局节点带 ending 且无 choices', story.nodes.filter(n => n.ending).every(n => !n.choices && n.ending.id));
  t('非结局节点都有选项', story.nodes.filter(n => !n.ending).every(n => n.choices && n.choices.length >= 1));
  t('装配结果不含 outline 字段', !('outline' in story));
  t('起点为 n1', story.startNodeId === 'n1');
})();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
