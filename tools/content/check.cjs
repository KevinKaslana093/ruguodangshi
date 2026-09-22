/* 程序检查与自动修复（不调用模型，纯结构层面）。
 * - normalize：补全 id/字段、按选项目标重排节点顺序，使「选项指向更靠后的节点」
 * - structuralFix：只做安全的机械修补（补 label？不做；仅补 vars/endings 登记、去重等）
 * - evaluate：调用 shared/validate.js 并整理成结构化结论
 * 注意：不做语义改写（那属于模型定点修复）。
 */
'use strict';
const S = require('../../shared/schema.js');
const V = require('../../shared/validate.js');
const R = require('../../shared/runtime.js');

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* 计算节点在图上应处的顺序：从 start 出发 BFS 保证「目标节点在源节点之后」 */
function orderNodes(story) {
  const map = {};
  story.nodes.forEach(n => { map[n.id] = n; });
  const order = [];
  const seen = new Set();
  const stack = [story.startNodeId];
  while (stack.length) {
    const id = stack.shift();
    if (!id || seen.has(id) || !map[id]) continue;
    seen.add(id);
    order.push(id);
    (map[id].choices || []).forEach(c => { if (!seen.has(c.to)) stack.push(c.to); });
  }
  /* 未达节点（不该存在，但保留以免丢内容）追加在后 */
  story.nodes.forEach(n => { if (!seen.has(n.id)) { seen.add(n.id); order.push(n.id); } });
  return order.map(id => map[id]);
}

/* 机械规范化（不改任何正文措辞） */
function normalize(story) {
  const s = clone(story);
  if (!Number.isInteger(s.contentVersion)) s.contentVersion = 1;
  if (!Array.isArray(s.vars)) s.vars = [];
  s.nodes = (s.nodes || []).filter(n => n && typeof n === 'object');

  /* 结局节点补登记 */
  s.endings = Array.isArray(s.endings) ? s.endings : [];
  s.nodes.forEach(n => {
    if (n.ending) {
      const found = s.endings.filter(e => e && e.id === n.ending.id)[0];
      if (!found) s.endings.push({ id: n.ending.id, nodeId: n.id, title: n.ending.title, kind: n.ending.kind });
      else if (found.nodeId !== n.id) found.nodeId = n.id;
      delete n.choices;
    } else if (Array.isArray(n.choices)) {
      /* 清理空 if/effects，保持文件整洁 */
      n.choices.forEach(c => {
        if (Array.isArray(c.if) && !c.if.length) delete c.if;
        if (Array.isArray(c.effects) && !c.effects.length) delete c.effects;
      });
    }
  });
  /* 去掉没有对应节点的结局登记 */
  const ids = new Set(s.nodes.map(n => n.id));
  s.endings = s.endings.filter(e => e && ids.has(e.nodeId));

  /* 顺序：目标在源之后（避免环） */
  s.nodes = orderNodes(s);
  return s;
}

/* 结构层面的可自动修复问题；其余交给模型定点修复或隔离。
 * 只做“不改变语义”的清理：超长字段截断、类型非法但可安全降级的变量、选项空数组等。 */
function structuralRepair(story) {
  let s = normalize(story);
  const notes = [];

  /* 1) 人物描述 / 标签 / 标题等超长字段：按 schema 上限截断（不改变含义） */
  (s.characters || []).forEach(c => {
    if (typeof c.desc === 'string' && S.charLen(c.desc) > S.LIMITS.charDesc.max) {
      c.desc = c.desc.slice(0, S.LIMITS.charDesc.max); notes.push('截断人物描述：' + (c.name || c.id));
    }
  });
  (s.tags || []).forEach((t, i) => { if (typeof t === 'string' && S.charLen(t) > S.LIMITS.tag.max) { s.tags[i] = t.slice(0, S.LIMITS.tag.max); notes.push('截断标签'); } });
  if (typeof s.tagline === 'string' && S.charLen(s.tagline) > S.LIMITS.tagline.max) { s.tagline = s.tagline.slice(0, S.LIMITS.tagline.max); notes.push('截断一句话简介'); }
  (s.endings || []).forEach(e => { if (typeof e.title === 'string' && S.charLen(e.title) > 14) { e.title = e.title.slice(0, 14); notes.push('截断结局标题'); } });

  /* 2) 变量：类型非法或结构不完整的变量整体剔除（比猜测更安全），并清理对它的引用 */
  const removedVars = [];
  s.vars = (s.vars || []).filter(v => {
    if (!v || typeof v !== 'object' || !v.id) { removedVars.push('(无id)'); return false; }
    if (S.VAR_TYPES.indexOf(v.type) === -1) { removedVars.push(v.id); return false; }
    if (v.type === 'int' && !(Number.isInteger(v.min) && Number.isInteger(v.max) && v.min <= v.max)) { removedVars.push(v.id); return false; }
    if (v.type === 'enum' && !(Array.isArray(v.values) && v.values.length >= 2)) { removedVars.push(v.id); return false; }
    return true;
  });
  if (removedVars.length) {
    const live = new Set(s.vars.map(v => v.id));
    s.vars.forEach(v => { delete v.used; });
    s.nodes.forEach(n => {
      (n.choices || []).forEach(c => {
        if (Array.isArray(c.if)) {
          c.if = c.if.filter(cond => cond && live.has(cond.var));
          if (!c.if.length) delete c.if;
        }
        if (Array.isArray(c.effects)) {
          c.effects = c.effects.filter(e => e && live.has(e.var));
          if (!c.effects.length) delete c.effects;
        }
      });
    });
    notes.push('剔除非法变量：' + removedVars.join(',') + '（引用已同步清理）');
  }

  /* 3) 选项数量不足 1 的非结局节点：交由模型定点修复前先标记（不能静默补造） */
  const res = V.validateStory(s, {});
  return { story: s, notes, report: res };
}

function evaluate(story, opts) {
  const res = V.validateStory(normalize(story), opts || {});
  return {
    ok: res.ok,
    errorCodes: [...new Set(res.errors.map(e => e.code))],
    errors: res.errors,
    warnings: res.warnings,
    metrics: res.metrics
  };
}

/* 路径文本化：把路径渲染成给编辑阅读的短文，供路径审核使用 */
function pathTexts(story, paths, limit) {
  const out = [];
  (paths || []).slice(0, limit || 40).forEach((p, idx) => {
    if (p.deadEnd) { out.push({ index: idx, text: '[死路] ' + p.nodes.join('→') }); return; }
    const lines = [];
    p.nodes.forEach((id, i) => {
      const node = R.nodeById(story, id);
      if (!node) return;
      lines.push('· ' + (node.label ? '【' + node.label + '】' : '') + node.text);
      if (i < p.choices.length) {
        const c = p.choices[i];
        lines.push('  → 选择 ' + String.fromCharCode(65 + (c.choiceIndex || 0)) + '：' + c.choiceText);
      }
    });
    const ending = (story.endings || []).filter(e => e.id === p.endingId)[0];
    lines.push('★ 结局：' + (ending ? ending.title : p.endingId) + '（' + (ending ? ending.kind : '?') + '）');
    out.push({ index: idx, text: lines.join('\n') });
  });
  return out;
}

module.exports = { normalize, structuralRepair, evaluate, pathTexts, orderNodes };
