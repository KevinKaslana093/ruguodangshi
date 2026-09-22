/* 骨架校验与轻量修复（纯程序，不调用模型）。
 * 目标：把「结构设计」阶段的 outline 变成可交付给「对白写作」的干净骨架。
 * 只做安全操作：补齐 id/字段、丢弃非法选项、裁剪不可达节点、修正结局登记。
 * 不做任何语义改动；无法修复时返回 ok=false 让流水线重试或隔离。
 *
 * 处理顺序（重要）：
 *   1) id 规范化 → 2) 选项清理（去回边/非法目标/重复）→ 3) 结局确定（叶节点=天然结局候选）
 *   → 4) 无结局标记的死路节点接续 → 5) 可达性裁剪 → 6) 路径深度硬检查
 */
'use strict';

function normText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

const KINDS = ['happy', 'bittersweet', 'twist', 'open', 'regret', 'surprise'];

function checkOutline(story, opts) {
  const premium = !!(opts && opts.premium);
  const errors = [];
  const s = JSON.parse(JSON.stringify(story || {}));
  const outline = Array.isArray(s.outline) ? s.outline : [];
  if (outline.length < 8) return { ok: false, errors: ['outline 节点过少（' + outline.length + '）'], story: s };

  /* 1) id 规范化：保留顺序，重排为 n1…nN */
  const idMap = {};
  let nodes = [];
  outline.forEach(n => {
    if (!n || !n.id) return;
    const newId = 'n' + (nodes.length + 1);
    idMap[String(n.id)] = newId;
    nodes.push({
      id: newId,
      label: normText(n.label).slice(0, 14),
      purpose: normText(n.purpose).slice(0, 60),
      choices: Array.isArray(n.choices) ? n.choices : [],
      endingId: n.endingId ? 'e' + (nodes.filter(x => x.endingId).length + 1) : null
    });
  });
  if (nodes.length < 8) return { ok: false, errors: ['outline 有效节点过少'], story: s };

  /* 索引与出度/入度 */
  function reindex() {
    const ix = {};
    nodes.forEach((n, i) => { ix[n.id] = i; });
    return ix;
  }
  let idx = reindex();

  /* 2) 选项清理：目标必须存在且编号更大；同节点内文字不得重复；结局节点无选项 */
  nodes.forEach((n, i) => {
    if (n.endingId) { n.choices = []; return; }
    const seen = {};
    const kept = [];
    n.choices.forEach(c => {
      if (!c) return;
      const to = idMap[String(c.to)] || (/^n\d+$/.test(String(c.to)) && idx[String(c.to)] !== undefined ? String(c.to) : null);
      if (!to || idx[to] === undefined || idx[to] <= i) return;   /* 丢弃回溯/非法目标 */
      const text = normText(c.text).slice(0, 24);
      if (!text || text.length < 2) return;
      if (seen[text]) return;
      seen[text] = true;
      kept.push({ text, to });
    });
    n.choices = kept.slice(0, 3);
  });

  /* 3) 结局确定：叶节点（出度为 0）是天然结局候选 */
  const outDeg = id => (nodes[idx[id]] ? nodes[idx[id]].choices.length : 0);
  let endingNodes = nodes.filter(n => n.endingId);
  if (endingNodes.length < 3) {
    /* 候选：出度为 0 且不是 n1、尚未标记结局的节点，取最深的 3 个 */
    const depthOf = {};
    (function computeDepth() {
      const memo = {};
      function d(id) {
        if (memo[id] !== undefined) return memo[id];
        const n = nodes[idx[id]];
        if (!n || !n.choices.length) return (memo[id] = 1);
        let mx = 0;
        n.choices.forEach(c => { mx = Math.max(mx, d(c.to)); });
        return (memo[id] = 1 + mx);
      }
      nodes.forEach(n => { depthOf[n.id] = d(n.id); });
    })();
    const free = nodes.filter(n => !n.endingId && n.id !== 'n1' && outDeg(n.id) === 0)
      .sort((a, b) => depthOf[b.id] - depthOf[a.id]);
    const need = 3 - endingNodes.length;
    if (free.length < need) {
      return { ok: false, errors: ['叶节点不足，无法构成 3 个结局（现有结局 ' + endingNodes.length + '，可用叶 ' + free.length + '）'], story: s };
    }
    free.slice(0, need).forEach(n => { n.endingId = 'auto-e' + n.id; });
    endingNodes = nodes.filter(n => n.endingId);
    errors.push('结局登记已自动补齐（原骨架未给出 3 个结局）');
    s.endings = [];
  }
  if (endingNodes.length > 3) {
    endingNodes.slice(3).forEach(n => { n.endingId = null; });
    endingNodes = endingNodes.slice(0, 3);
  }
  /* 结局节点清空选项（终结点） */
  endingNodes.forEach(n => { n.choices = []; n.endingId = n.endingId; });

  /* 4) 可达性裁剪（先裁剪，再做死路修复：孤岛节点不应影响主图判定） */
  idx = reindex();
  const reach = new Set(['n1']);
  const queue = ['n1'];
  while (queue.length) {
    const id = queue.shift();
    const n = nodes[idx[id]];
    if (!n) continue;
    n.choices.forEach(c => { if (!reach.has(c.to)) { reach.add(c.to); queue.push(c.to); } });
  }
  const droppedCount = nodes.length - reach.size;
  if (droppedCount > 0) errors.push('丢弃不可达节点 ' + droppedCount + ' 个');
  nodes = nodes.filter(n => reach.has(n.id));
  idx = reindex();
  if (nodes.length < 8) return { ok: false, errors: ['可达节点过少（' + nodes.length + '）'], story: s };

  /* 5) 死路修复：可达的非结局节点若无选项，接到后面的可用节点；末端无出路则失败 */
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.endingId || n.choices.length) continue;
    const nxt = nodes.slice(i + 1).filter(m => !m.endingId)[0] || nodes[i + 1];
    if (!nxt) return { ok: false, errors: ['末端节点 ' + n.id + ' 既非结局又无出路'], story: s };
    n.choices = [{ text: '继续往下', to: nxt.id }];
    errors.push('死路节点 ' + n.id + ' 已自动接续到 ' + nxt.id);
  }

  /* 6) 结局复核：可达集合内必须恰好 3 个结局 */
  endingNodes = nodes.filter(n => n.endingId);
  if (endingNodes.length < 3) {
    return { ok: false, errors: ['可达结局不足 3 个（' + endingNodes.length + '）'], story: s };
  }
  if (endingNodes.length > 3) {
    endingNodes.slice(3).forEach(n => { n.endingId = null; });
    endingNodes.slice(3).forEach(n => {
      const nxt = nodes.filter(m => !m.endingId && m.id !== n.id)[0];
      if (nxt) n.choices = [{ text: '继续往下', to: nxt.id }];
    });
    endingNodes = endingNodes.slice(0, 3);
  }

  /* 6) 结局登记对齐（nodeId 指向真实节点；kind 两两不同） */
  const origEndings = Array.isArray(s.endings) ? s.endings : [];
  const fixed = endingNodes.map((n, k) => {
    const orig = origEndings.filter(e => e && e.id === n.endingId)[0] || origEndings[k] || {};
    return {
      id: n.endingId,
      nodeId: n.id,
      title: normText(orig.title).slice(0, 14) || ('结局' + '一二三'[k]),
      kind: KINDS.indexOf(orig.kind) >= 0 ? orig.kind : ['happy', 'regret', 'twist'][k]
    };
  });
  const usedKinds = {};
  fixed.forEach((e, k) => {
    if (usedKinds[e.kind]) {
      const alt = KINDS.filter(x => !usedKinds[x])[0];
      if (alt) e.kind = alt; else e.kind = e.kind + '-' + k;
    }
    usedKinds[e.kind] = true;
  });
  s.endings = fixed;

  /* 7) 路径深度硬检查（骨架阶段就挡住：此时重试成本最低） */
  const memoLo = {}, memoHi = {};
  function shortest(id) {
    if (memoLo[id] !== undefined) return memoLo[id];
    const n = nodes[idx[id]];
    if (!n) return 99;
    if (n.endingId) return (memoLo[id] = 1);
    let mn = 99;
    n.choices.forEach(c => { mn = Math.min(mn, shortest(c.to)); });
    return (memoLo[id] = 1 + mn);
  }
  function longest(id) {
    if (memoHi[id] !== undefined) return memoHi[id];
    const n = nodes[idx[id]];
    if (!n) return 0;
    if (n.endingId) return (memoHi[id] = 1);
    let mx = 0;
    n.choices.forEach(c => { mx = Math.max(mx, longest(c.to)); });
    return (memoHi[id] = 1 + mx);
  }
  const lo = shortest('n1'), hi = longest('n1');
  if (lo > 90) return { ok: false, errors: ['存在无法到达结局的路径'], story: s };
  const minWanted = premium ? 6 : 5;
  const maxWanted = premium ? 12 : 12;

  s.outline = nodes;
  s.startNodeId = 'n1';
  if (lo < minWanted) return { ok: false, errors: ['最短路径过短（' + lo + ' 段，需 ≥' + minWanted + '）'], story: s };
  if (hi > maxWanted) return { ok: false, errors: ['最长路径过长（' + hi + ' 段，需 ≤' + maxWanted + '）'], story: s };

  return { ok: true, errors, story: s, metrics: { nodes: nodes.length, shortestPath: lo, longestPath: hi, endings: fixed.length } };
}

/* 把模型返回的内容（purpose / 选项文字 / 元数据）填进固定形状的骨架。
 * 图结构由形状决定，模型不能改：任何结构字段都被忽略，只取内容字段。 */
function fillSkeleton(skeleton, parsed, shape, opts) {
  const errors = [], notes = [];
  const s = JSON.parse(JSON.stringify(skeleton));
  const meta = (parsed && (parsed.story || parsed)) || {};
  const byId = {};
  s.outline.forEach(n => { byId[n.id] = n; });

  /* 元数据 */
  if (meta.title) s.title = String(meta.title).slice(0, 24);
  if (meta.tagline) s.tagline = String(meta.tagline).slice(0, 48);
  if (meta.summary) s.summary = String(meta.summary).slice(0, 140);
  if (meta.estimatedMinutes) s.estimatedMinutes = Math.max(3, Math.min(6, parseInt(meta.estimatedMinutes, 10) || 4));
  if (meta.cover && typeof meta.cover === 'object') s.cover = { pattern: String(meta.cover.pattern || 'waves'), hue: parseInt(meta.cover.hue, 10) || 205 };
  if (Array.isArray(meta.tags)) s.tags = meta.tags.slice(0, 5).map(t => String(t).slice(0, 6));
  if (Array.isArray(meta.characters)) {
    s.characters = meta.characters.slice(0, 6).map((c, i) => ({
      id: String(c && c.id || ('c' + (i + 1))).slice(0, 8),
      name: String(c && c.name || '').slice(0, 10),
      desc: String(c && c.desc || '').slice(0, 30)
    })).filter(c => c.name);
  }
  if (meta.vars && Array.isArray(meta.vars)) s.vars = meta.vars.slice(0, 2);
  /* 结局标题/类型 */
  if (Array.isArray(meta.endings)) {
    meta.endings.forEach((e, i) => {
      if (!s.endings[i]) return;
      if (e && e.title) s.endings[i].title = String(e.title).slice(0, 14);
      if (e && ['happy', 'bittersweet', 'twist', 'open', 'regret', 'surprise'].indexOf(e.kind) >= 0) s.endings[i].kind = e.kind;
    });
  }

  /* 节点内容：只接受已知 id；选项文字按形状给定的目标顺序填入 */
  const outline = Array.isArray(meta.outline) ? meta.outline : [];
  outline.forEach(n => {
    if (!n || !n.id || !byId[n.id]) return;
    const node = byId[n.id];
    if (n.label) node.label = String(n.label).slice(0, 14);
    if (n.purpose) node.purpose = String(n.purpose).slice(0, 60);
    if (Array.isArray(n.choices)) {
      /* 按 to 匹配形状里的目标；文字若缺失则留空，由后续校验要求补齐 */
      n.choices.forEach(c => {
        if (!c || !c.to) return;
        const slot = (node.choices || []).filter(x => x.to === c.to)[0];
        if (slot && c.text) slot.text = String(c.text).slice(0, 24);
      });
    }
  });

  /* 校验：每个非结局节点的每个选项都要有文字；节点要有 purpose */
  const missing = [];
  s.outline.forEach(n => {
    if (n.endingId) return;
    (n.choices || []).forEach((c, i) => { if (!c.text || c.text.length < 2) missing.push(n.id + ' 第 ' + (i + 1) + ' 个选项'); });
    if (!n.purpose) missing.push(n.id + ' 缺少 purpose');
  });
  const bad = [];
  if (!s.title || s.title.length < 4) bad.push('title 缺失或过短');
  if (!s.summary || s.summary.length < 40) bad.push('summary 缺失或过短');
  if (!s.characters || s.characters.length < 2) bad.push('人物少于 2 个');
  if (!s.tags || s.tags.length < 2) bad.push('标签少于 2 个');
  const all = missing.concat(bad);
  if (all.length) return { ok: false, errors: all.slice(0, 8), story: s, notes };
  return { ok: true, errors: [], story: s, notes };
}

/* 分批填充：只处理指定 id 的节点（用于把大骨架拆成多次小输出）。
 * needMeta=true 时同时接收元数据（title/summary/characters/tags/endings）。 */
function fillSkeletonPartial(skeleton, parsed, shape, opts) {
  const ids = (opts && opts.ids) || [];
  const needMeta = !!(opts && opts.needMeta);
  const errors = [], notes = [];
  const s = JSON.parse(JSON.stringify(skeleton));
  const meta = (parsed && (parsed.story || parsed)) || {};
  const byId = {};
  s.outline.forEach(n => { byId[n.id] = n; });

  if (needMeta) {
    if (meta.title) s.title = String(meta.title).slice(0, 24);
    if (meta.tagline) s.tagline = String(meta.tagline).slice(0, 48);
    if (meta.summary) s.summary = String(meta.summary).slice(0, 140);
    if (meta.estimatedMinutes) s.estimatedMinutes = Math.max(3, Math.min(6, parseInt(meta.estimatedMinutes, 10) || 4));
    if (meta.cover && typeof meta.cover === 'object') s.cover = { pattern: String(meta.cover.pattern || 'waves'), hue: parseInt(meta.cover.hue, 10) || 205 };
    if (Array.isArray(meta.tags)) s.tags = meta.tags.slice(0, 5).map(t => String(t).slice(0, 6));
    if (Array.isArray(meta.characters)) {
      s.characters = meta.characters.slice(0, 6).map((c, i) => ({
        id: String((c && c.id) || ('c' + (i + 1))).slice(0, 8),
        name: String((c && c.name) || '').slice(0, 10),
        desc: String((c && c.desc) || '').slice(0, 30)
      })).filter(c => c.name);
    }
    if (Array.isArray(meta.endings)) {
      meta.endings.forEach((e, i) => {
        if (!s.endings[i]) return;
        if (e && e.title) s.endings[i].title = String(e.title).slice(0, 14);
        if (e && ['happy', 'bittersweet', 'twist', 'open', 'regret', 'surprise'].indexOf(e.kind) >= 0) s.endings[i].kind = e.kind;
      });
      /* kind 去重：重复或缺失时按候选列表补足，保证两两不同（schema 硬要求） */
      const pool = ['happy', 'bittersweet', 'twist', 'open', 'regret', 'surprise'];
      const used = {};
      s.endings.forEach(e => {
        if (e.kind && !used[e.kind]) { used[e.kind] = true; return; }
        const alt = pool.filter(k => !used[k])[0] || pool[0];
        e.kind = alt;
        used[alt] = true;
        notes.push('结局 e' + (s.endings.indexOf(e) + 1) + ' kind 自动修正为 ' + alt);
      });
    }
  }

  const outline = Array.isArray(meta.outline) ? meta.outline : [];
  outline.forEach(n => {
    if (!n || !n.id || !byId[n.id] || ids.indexOf(n.id) === -1) return;
    const node = byId[n.id];
    if (n.label) node.label = String(n.label).slice(0, 14);
    if (n.purpose) node.purpose = String(n.purpose).slice(0, 60);
    if (Array.isArray(n.choices)) {
      n.choices.forEach(c => {
        if (!c || !c.to) return;
        const slot = (node.choices || []).filter(x => x.to === c.to)[0];
        if (slot && c.text) slot.text = String(c.text).slice(0, 24);
      });
    }
  });

  /* 只校验本批涉及的内容 */
  const missing = [];
  ids.forEach(id => {
    const n = byId[id];
    if (!n) return;
    if (n.endingId) return;
    (n.choices || []).forEach((c, i) => { if (!c.text || c.text.length < 2) missing.push(id + ' 第 ' + (i + 1) + ' 个选项'); });
    if (!n.purpose) missing.push(id + ' 缺少 purpose');
  });
  const bad = [];
  if (needMeta) {
    if (!s.title || s.title.length < 4) bad.push('title 缺失或过短');
    if (!s.summary || s.summary.length < 40) bad.push('summary 缺失或过短');
    if (!s.characters || s.characters.length < 2) bad.push('人物少于 2 个');
    if (!s.tags || s.tags.length < 2) bad.push('标签少于 2 个');
  }
  const all = missing.concat(bad);
  if (all.length) return { ok: false, errors: all.slice(0, 8), story: s, notes };
  return { ok: true, errors: [], story: s, notes };
}

/* 供写作阶段使用的层级表（同层 = 同一场戏的两种做法） */
function levelsForWrite(shape) {
  const d = {};
  (shape && shape.levels || []).forEach((ids, li) => ids.forEach(id => { d[id] = li; }));
  return d;
}
function fillGenre(story, genreId) {
  if (!story) return story;
  if (!story.genre) story.genre = genreId;
  return story;
}

/* 把写好的正文合并进骨架，产出正式 story 对象（结构合法、可直接交给 validator） */
function assemble(skeleton, texts) {
  const s = JSON.parse(JSON.stringify(skeleton));
  const byEid = {};
  (s.endings || []).forEach(e => { byEid[e.id] = e; });
  const nodes = (s.outline || []).map(n => {
    const t = texts[n.id];
    if (!t) return null;
    const node = { id: n.id, text: t };
    if (n.label) node.label = n.label;
    if (n.endingId) node.ending = { id: n.endingId, title: (byEid[n.endingId] || {}).title || '', kind: (byEid[n.endingId] || {}).kind || 'open' };
    else node.choices = (n.choices || []).map(c => ({ text: c.text, to: c.to }));
    return node;
  }).filter(Boolean);
  delete s.outline;
  delete s.pathMetrics;
  s.nodes = nodes;
  return s;
}

module.exports = { checkOutline, fillSkeleton, fillSkeletonPartial, assemble, fillGenre, levelsForWrite };
