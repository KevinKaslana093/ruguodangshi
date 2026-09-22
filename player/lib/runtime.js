/* 「如果当时」故事运行时（冻结 v1）
 * 纯函数式状态机：无 DOM、无网络、无 eval。Node 与浏览器共用。
 * 语义与 shared/validate.js 完全一致（验证器直接调用本模块枚举状态）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.RD = window.RD || {}; window.RD.Runtime = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function initialFlags(story) {
    var f = {};
    (story.vars || []).forEach(function (v) {
      if (v.type === 'bool') f[v.id] = false;
      else if (v.type === 'int') f[v.id] = v.min;
      else if (v.type === 'enum') f[v.id] = v.values[0];
    });
    return f;
  }

  function nodeById(story, id) {
    var ns = story.nodes || [];
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return ns[i];
    return null;
  }

  /* 声明式条件求值：仅白名单运算符；不做表达式解析 */
  function condPass(c, flags) {
    if (!c) return false;
    var v = flags[c.var];
    if (c.op === 'eq') return v === c.value;
    if (c.op === 'ne') return v !== c.value;
    if (c.op === 'gte') return typeof v === 'number' && v >= c.value;
    if (c.op === 'lte') return typeof v === 'number' && v <= c.value;
    if (c.op === 'in') return Array.isArray(c.value) && c.value.indexOf(v) !== -1;
    return false;
  }

  function choiceAvailable(choice, flags) {
    var cs = choice && choice.if;
    if (!cs || !cs.length) return true;
    for (var i = 0; i < cs.length; i++) if (!condPass(cs[i], flags)) return false;
    return true;
  }

  /* 当前状态下节点可用选项（保持文件顺序） */
  function availableChoices(story, node, flags) {
    if (!node || !node.choices) return [];
    return node.choices.filter(function (c) { return choiceAvailable(c, flags); });
  }

  function applyEffects(flags, effects) {
    var next = {};
    Object.keys(flags).forEach(function (k) { next[k] = flags[k]; });
    (effects || []).forEach(function (e) {
      if (e && Object.prototype.hasOwnProperty.call(next, e.var)) next[e.var] = e.set;
    });
    return next;
  }

  function newState(story) {
    return {
      schemaVersion: 1,
      storyId: story.storyId,
      contentVersion: story.contentVersion,
      nodeId: story.startNodeId,
      flags: initialFlags(story),
      visited: [story.startNodeId],
      choices: [],
      ended: false,
      endingId: null
    };
  }

  /* 选择一步：idx 为「可用选项」数组下标；非法选择抛错（不静默） */
  function step(story, state, idx) {
    if (state.ended) throw new Error('故事已结束');
    var node = nodeById(story, state.nodeId);
    if (!node) throw new Error('未知节点：' + state.nodeId);
    var avail = availableChoices(story, node, state.flags);
    if (idx < 0 || idx >= avail.length) throw new Error('无效选项下标：' + idx);
    var chosen = avail[idx];
    var next = nodeById(story, chosen.to);
    if (!next) throw new Error('选项指向不存在的节点：' + chosen.to);
    var st = {
      schemaVersion: 1,
      storyId: state.storyId,
      contentVersion: state.contentVersion,
      nodeId: next.id,
      flags: applyEffects(state.flags, chosen.effects),
      visited: state.visited.concat([next.id]),
      choices: state.choices.concat([{ nodeId: node.id, choiceIndex: idx, choiceText: chosen.text }]),
      ended: false,
      endingId: null
    };
    if (next.ending) { st.ended = true; st.endingId = next.ending.id; }
    return st;
  }

  /* 进度恢复校验：结构非法则返回 null（调用方安全重开） */
  function restore(story, saved) {
    if (!saved || saved.schemaVersion !== 1) return null;
    if (saved.storyId !== story.storyId) return null;
    if (saved.contentVersion !== story.contentVersion) return null;
    var node = nodeById(story, saved.nodeId);
    if (!node) return null;
    var valid = initialFlags(story);
    var keys = Object.keys(valid);
    if (Object.keys(saved.flags || {}).length !== keys.length) return null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = saved.flags[k];
      if (typeof v !== typeof valid[k]) return null;
    }
    if (!Array.isArray(saved.visited) || !saved.visited.length) return null;
    for (var j = 0; j < saved.visited.length; j++) {
      if (!nodeById(story, saved.visited[j])) return null;
      if (j > 0 && saved.visited[j] === saved.visited[j - 1]) return null;
    }
    if (saved.visited[saved.visited.length - 1] !== saved.nodeId) return null;
    if (!Array.isArray(saved.choices)) return null;
    return {
      schemaVersion: 1, storyId: saved.storyId, contentVersion: saved.contentVersion,
      nodeId: saved.nodeId, flags: saved.flags, visited: saved.visited.slice(),
      choices: saved.choices.slice(), ended: !!node.ending,
      endingId: node.ending ? node.ending.id : null
    };
  }

  function summarize(story, state) {
    var ending = null;
    if (state.endingId) {
      (story.endings || []).forEach(function (e) { if (e.id === state.endingId) ending = e; });
    }
    return {
      storyId: story.storyId,
      title: story.title,
      steps: state.choices.length,
      visitedCount: state.visited.length,
      ended: state.ended,
      ending: ending,
      choices: state.choices.map(function (c) { return { nodeId: c.nodeId, text: c.choiceText }; })
    };
  }

  return {
    initialFlags: initialFlags,
    nodeById: nodeById,
    condPass: condPass,
    choiceAvailable: choiceAvailable,
    availableChoices: availableChoices,
    applyEffects: applyEffects,
    newState: newState,
    step: step,
    restore: restore,
    summarize: summarize
  };
});
