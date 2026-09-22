/* 「如果当时」故事验证器（冻结 v1，Node 专用）
 * 职责：结构合法性、引用完整性、可达性、死路、长度、伪分支、结局区别、
 *       隐私、重复文本、路径枚举（穷举或覆盖+采样）、带状态可达性。
 * 输出结构化 errors / warnings / metrics，供生产流水线与验证工作包使用。
 * 无网络、无副作用（只读传参）。
 */
'use strict';

var S = require('./schema.js');
var R = require('./runtime.js');

var L = S.LIMITS;

function err(code, path, msg) { return { code: code, path: path, message: msg }; }

/* ---------- 状态空间 ---------- */
function stateSpaceSize(story) {
  var n = 1;
  (story.vars || []).forEach(function (v) {
    if (v.type === 'bool') n *= 2;
    else if (v.type === 'int') n *= ((v.max - v.min) + 1);
    else if (v.type === 'enum') n *= (v.values || []).length;
  });
  return n;
}

function flagKey(story, flags) {
  return (story.vars || []).map(function (v) { return String(flags[v.id]); }).join('|');
}

/* ---------- 路径枚举 ---------- */
/* 返回 { mode:'exhaustive'|'bounded', paths:[{nodes:[],endings:[],choices:[]}], capped:bool,
 *        visitedPairs:n, totalPairs:n } */
function enumeratePaths(story, opt) {
  opt = opt || {};
  var limit = opt.limit || L.maxPathsExhaustive;
  var space = stateSpaceSize(story);
  var start = R.newState(story);
  var paths = [];
  var capped = false;
  /* 带状态的 (node,flagKey) 覆盖统计 */
  var seenPairs = new Set();
  var allPairs = new Set();
  (story.nodes || []).forEach(function (node) {
    enumerateStates(story, node.id).forEach(function (fk) { allPairs.add(node.id + '#' + fk); });
  });

  function walk(state, acc, depth) {
    if (paths.length >= limit) { capped = true; return; }
    if (depth > L.pathNodes.max + 2) { capped = true; return; }
    var node = R.nodeById(story, state.nodeId);
    if (!node) return;
    seenPairs.add(node.id + '#' + flagKey(story, state.flags));
    acc.nodes.push(node.id);
    if (node.ending) {
      paths.push({ nodes: acc.nodes.slice(), choices: acc.choices.slice(), endingId: node.ending.id });
      acc.nodes.pop();
      return;
    }
    var avail = R.availableChoices(story, node, state.flags);
    if (!avail.length) { /* 死路：记录为空路径以便上层报错 */
      paths.push({ nodes: acc.nodes.slice(), choices: acc.choices.slice(), deadEnd: true });
      acc.nodes.pop();
      return;
    }
    for (var i = 0; i < avail.length; i++) {
      if (paths.length >= limit) { capped = true; break; }
      var chosen = avail[i];
      var flags2 = R.applyEffects(state.flags, chosen.effects);
      var st2 = {
        schemaVersion: 1, storyId: story.storyId, contentVersion: story.contentVersion,
        nodeId: chosen.to, flags: flags2, visited: state.visited.concat([chosen.to]),
        choices: state.choices.concat([{ nodeId: node.id, choiceIndex: i, choiceText: chosen.text }]),
        ended: false, endingId: null
      };
      acc.choices.push({ nodeId: node.id, choiceIndex: i, choiceText: chosen.text, to: chosen.to });
      walk(st2, acc, depth + 1);
      acc.choices.pop();
    }
    acc.nodes.pop();
  }
  walk(start, { nodes: [], choices: [] }, 1);
  return {
    mode: capped ? 'bounded' : 'exhaustive',
    capped: capped,
    paths: paths,
    visitedPairs: seenPairs.size,
    totalPairs: allPairs.size,
    stateSpace: space
  };
}

/* 枚举某节点在哪些状态组合下可达（用于死路检查的全状态覆盖） */
function enumerateStates(story, nodeId) {
  var vars = story.vars || [];
  if (!vars.length) return ['∅'];
  var combos = [''];
  vars.forEach(function (v) {
    var vals = [];
    if (v.type === 'bool') vals = [false, true];
    else if (v.type === 'int') { for (var i = v.min; i <= v.max; i++) vals.push(i); }
    else vals = (v.values || []).slice();
    var next = [];
    combos.forEach(function (c) { vals.forEach(function (val) { next.push(c ? c + '|' + val : String(val)); }); });
    combos = next;
  });
  return combos;
}

/* 可达 (节点, 任意状态) 集合（忽略状态，用于“图连通”判断） */
function reachableNodes(story) {
  var seen = new Set();
  var stack = [story.startNodeId];
  while (stack.length) {
    var id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    var node = R.nodeById(story, id);
    if (!node || !node.choices) continue;   // 结局节点不展开
    node.choices.forEach(function (c) { if (!seen.has(c.to)) stack.push(c.to); });
  }
  return seen;
}

function checkAcyclic(story) {
  var state = {};   // 0 未访问 1 在栈 2 完成
  var cycle = null;
  function dfs(id, trail) {
    if (cycle) return;
    state[id] = 1;
    var node = R.nodeById(story, id);
    (node && node.choices || []).forEach(function (c) {
      if (cycle) return;
      if (state[c.to] === 1) { cycle = trail.concat([c.to]); return; }
      if (!state[c.to]) dfs(c.to, trail.concat([c.to]));
    });
    state[id] = 2;
  }
  dfs(story.startNodeId, [story.startNodeId]);
  return cycle;
}

/* ---------- 主校验 ---------- */
function validateStory(story, opts) {
  opts = opts || {};
  var errors = [], warnings = [];
  var metrics = {};

  if (!S.isPlainObject(story)) return { ok: false, errors: [err('not_object', '', '故事必须是对象')], warnings: [], metrics: {} };

  /* 顶层字段 */
  if (story.schemaVersion !== S.SCHEMA_VERSION) errors.push(err('schema_version', 'schemaVersion', 'schemaVersion 必须等于 ' + S.SCHEMA_VERSION));
  if (!S.isStr(story.storyId) || !L.storyIdPattern.test(story.storyId)) errors.push(err('story_id', 'storyId', 'storyId 形如 sc-0001'));
  if (!Number.isInteger(story.contentVersion) || story.contentVersion < 1) errors.push(err('content_version', 'contentVersion', 'contentVersion 为正整数'));

  ['title', 'tagline', 'summary'].forEach(function (k) {
    var shape = S.textShapeError(story[k]);
    if (shape) errors.push(err('shape_' + k, k, k + shape));
  });
  if (S.isStr(story.title)) {
    var tl = S.charLen(story.title);
    if (tl < L.title.min || tl > L.title.max) errors.push(err('title_len', 'title', '标题 ' + L.title.min + '–' + L.title.max + ' 字（当前 ' + tl + '）'));
  }
  if (S.isStr(story.tagline) && S.charLen(story.tagline) > L.tagline.max) errors.push(err('tagline_len', 'tagline', '短句 ≤' + L.tagline.max + ' 字'));
  if (S.isStr(story.summary)) {
    var sl = S.charLen(story.summary);
    if (sl < L.summary.min || sl > L.summary.max) errors.push(err('summary_len', 'summary', '简介 ' + L.summary.min + '–' + L.summary.max + ' 字（当前 ' + sl + '）'));
  }
  if (!S.genreById(story.genreId)) errors.push(err('genre', 'genreId', '题材必须是 8 个题材之一'));
  if (!Number.isInteger(story.estimatedMinutes) || story.estimatedMinutes < L.estimatedMinutes.min || story.estimatedMinutes > L.estimatedMinutes.max) {
    errors.push(err('minutes', 'estimatedMinutes', '预计时长 ' + L.estimatedMinutes.min + '–' + L.estimatedMinutes.max + ' 分钟'));
  }
  if (!S.isPlainObject(story.cover) || S.COVER_PATTERNS.indexOf(story.cover.pattern) === -1) errors.push(err('cover', 'cover.pattern', '封面图案必须是允许值'));
  if (!Array.isArray(story.tags) || story.tags.length < L.tagsCount.min || story.tags.length > L.tagsCount.max) {
    errors.push(err('tags_len', 'tags', '标签 ' + L.tagsCount.min + '–' + L.tagsCount.max + ' 个'));
  } else {
    story.tags.forEach(function (t, i) {
      var shape = S.textShapeError(t);
      if (shape) errors.push(err('tag_shape', 'tags[' + i + ']', '标签' + shape));
      else if (S.charLen(t) < L.tag.min || S.charLen(t) > L.tag.max) errors.push(err('tag_len', 'tags[' + i + ']', '标签 ≤' + L.tag.max + ' 字'));
    });
    if (new Set(story.tags).size !== story.tags.length) errors.push(err('tag_dup', 'tags', '标签不得重复'));
  }

  /* 人物 */
  if (!Array.isArray(story.characters) || story.characters.length < L.characters.min || story.characters.length > L.characters.max) {
    errors.push(err('chars_len', 'characters', '人物 ' + L.characters.min + '–' + L.characters.max + ' 个'));
  } else {
    var charIds = new Set();
    story.characters.forEach(function (c, i) {
      if (!S.isPlainObject(c) || !S.isStr(c.id) || !c.id) { errors.push(err('char_id', 'characters[' + i + '].id', '人物需要 id')); return; }
      if (charIds.has(c.id)) errors.push(err('char_dup', 'characters[' + i + '].id', '人物 id 重复'));
      charIds.add(c.id);
      var ns = S.textShapeError(c.name);
      if (ns) errors.push(err('char_name_shape', 'characters[' + i + '].name', '人名' + ns));
      else if (S.charLen(c.name) < L.charName.min || S.charLen(c.name) > L.charName.max) errors.push(err('char_name_len', 'characters[' + i + '].name', '人名 ≤' + L.charName.max + ' 字'));
      if (c.desc !== undefined) {
        var ds = S.textShapeError(c.desc);
        if (ds) errors.push(err('char_desc_shape', 'characters[' + i + '].desc', '人物描述' + ds));
        else if (S.charLen(c.desc) > L.charDesc.max) errors.push(err('char_desc_len', 'characters[' + i + '].desc', '人物描述 ≤' + L.charDesc.max + ' 字'));
      }
      var ph = S.privacyHit(c.name) || S.privacyHit(c.desc);
      if (ph) errors.push(err('char_privacy', 'characters[' + i + ']', '人物信息含' + ph));
    });
  }

  /* 变量 */
  if (story.vars !== undefined && !Array.isArray(story.vars)) errors.push(err('vars_shape', 'vars', 'vars 必须是数组'));
  else {
    var vars = story.vars || [];
    if (vars.length > L.varsMax) errors.push(err('vars_len', 'vars', '变量最多 ' + L.varsMax + ' 个'));
    var varIds = new Set();
    vars.forEach(function (v, i) {
      var p = 'vars[' + i + ']';
      if (!S.isPlainObject(v) || !S.isStr(v.id) || !/^[a-z][a-z0-9_]{0,15}$/.test(v.id)) { errors.push(err('var_id', p + '.id', '变量 id 需为小写字母数字')); return; }
      if (varIds.has(v.id)) errors.push(err('var_dup', p + '.id', '变量 id 重复'));
      varIds.add(v.id);
      if (S.VAR_TYPES.indexOf(v.type) === -1) { errors.push(err('var_type', p + '.type', '变量类型必须是 ' + S.VAR_TYPES.join('/'))); return; }
      if (v.type === 'int' && (!Number.isInteger(v.min) || !Number.isInteger(v.max) || v.min > v.max)) errors.push(err('var_int', p, 'int 变量需要 min ≤ max 整数'));
      if (v.type === 'enum' && (!Array.isArray(v.values) || v.values.length < 2)) errors.push(err('var_enum', p, 'enum 变量需要 ≥2 个取值'));
      if (v.type === 'bool' && (v.min !== undefined || v.max !== undefined)) warnings.push(err('var_bool_extra', p, 'bool 变量忽略 min/max'));
    });
    if (stateSpaceSize(story) > L.stateSpaceMax) errors.push(err('state_space', 'vars', '状态空间过大（' + stateSpaceSize(story) + ' > ' + L.stateSpaceMax + '）'));
  }
  var varMap = {};
  (story.vars || []).forEach(function (v) { varMap[v.id] = v; });

  /* 节点 */
  var nodes = story.nodes;
  if (!Array.isArray(nodes) || !nodes.length) {
    errors.push(err('nodes_missing', 'nodes', 'nodes 必须是非空数组'));
    return { ok: false, errors: errors, warnings: warnings, metrics: metrics };
  }
  if (nodes.length < L.nodesTotal.min || nodes.length > L.nodesTotal.max) errors.push(err('nodes_count', 'nodes', '节点总数 ' + L.nodesTotal.min + '–' + L.nodesTotal.max + '（当前 ' + nodes.length + '）'));
  if (opts.premium && (nodes.length < L.nodesPremium.min || nodes.length > L.nodesPremium.max)) errors.push(err('nodes_count_premium', 'nodes', 'A 档精品节点 ' + L.nodesPremium.min + '–' + L.nodesPremium.max + '（当前 ' + nodes.length + '）'));

  var ids = new Set();
  nodes.forEach(function (n, i) {
    var p = 'nodes[' + i + ']';
    if (!S.isPlainObject(n)) { errors.push(err('node_shape', p, '节点必须是对象')); return; }
    if (!S.isStr(n.id) || !L.nodeIdPattern.test(n.id)) { errors.push(err('node_id', p + '.id', '节点 id 形如 n1')); return; }
    if (ids.has(n.id)) errors.push(err('node_dup', p + '.id', '节点 id 重复：' + n.id));
    ids.add(n.id);
    var ts = S.textShapeError(n.text);
    if (ts) errors.push(err('node_text_shape', p + '.text', '正文' + ts));
    else {
      var cjk = S.cjkCount(n.text);
      if (cjk < L.nodeText.min || cjk > L.nodeText.max) errors.push(err('node_text_len', p + '.text', '正文汉字数 ' + L.nodeText.min + '–' + L.nodeText.max + '（当前 ' + cjk + '）'));
      else if (cjk < L.nodeTextTarget.min || cjk > L.nodeTextTarget.max) warnings.push(err('node_text_target', p + '.text', '正文建议 60–140 汉字（当前 ' + cjk + '）'));
    }
    if (n.label !== undefined) {
      var ls = S.textShapeError(n.label);
      if (ls) errors.push(err('node_label_shape', p + '.label', '场景标签' + ls));
      else if (S.charLen(n.label) > L.nodeLabel.max) errors.push(err('node_label_len', p + '.label', '场景标签 ≤' + L.nodeLabel.max + ' 字'));
    }
    var hasEnding = !!n.ending;
    if (hasEnding) {
      if (n.choices !== undefined && (!Array.isArray(n.choices) || n.choices.length)) errors.push(err('ending_has_choices', p + '.choices', '结局节点不得有选项'));
      var e = n.ending;
      if (!S.isPlainObject(e) || !S.isStr(e.id) || !e.id) errors.push(err('ending_id', p + '.ending.id', '结局需要 id'));
      var es = S.textShapeError(e && e.title);
      if (es) errors.push(err('ending_title_shape', p + '.ending.title', '结局标题' + es));
      else if (S.charLen(e.title) > 14) errors.push(err('ending_title_len', p + '.ending.title', '结局标题 ≤14 字'));
      if (!e || S.ENDING_KINDS.indexOf(e.kind) === -1) errors.push(err('ending_kind', p + '.ending.kind', '结局类型必须是 ' + S.ENDING_KINDS.join('/')));
    } else {
      var cs = n.choices;
      if (!Array.isArray(cs) || cs.length < L.choicesPerNode.min || cs.length > L.choicesPerNode.max) {
        errors.push(err('choices_count', p + '.choices', '非结局节点选项 ' + L.choicesPerNode.min + '–' + L.choicesPerNode.max + ' 个'));
      } else {
        var texts = new Set();
        cs.forEach(function (c, j) {
          var cp = p + '.choices[' + j + ']';
          if (!S.isPlainObject(c)) { errors.push(err('choice_shape', cp, '选项必须是对象')); return; }
          var cts = S.textShapeError(c.text);
          if (cts) errors.push(err('choice_text_shape', cp + '.text', '选项文字' + cts));
          else {
            var cl = S.charLen(c.text);
            if (cl < L.choiceText.min || cl > L.choiceText.max) errors.push(err('choice_text_len', cp + '.text', '选项文字 ' + L.choiceText.min + '–' + L.choiceText.max + ' 字（当前 ' + cl + '）'));
          }
          if (texts.has(c.text)) errors.push(err('choice_text_dup', cp + '.text', '同节点选项文字重复'));
          texts.add(c.text);
          if (!S.isStr(c.to) || !ids.has(c.to)) {
            /* 目标可能后置定义：先在第二遍检查；此处仅记录占位 */
          }
          /* 条件与效果：白名单 */
          (c.if || []).forEach(function (cond, k) {
            var q = cp + '.if[' + k + ']';
            if (!S.isPlainObject(cond) || !varMap[cond.var]) { errors.push(err('cond_var', q + '.var', '条件引用了未声明变量')); return; }
            if (S.COND_OPS.indexOf(cond.op) === -1) { errors.push(err('cond_op', q + '.op', '运算符必须是 ' + S.COND_OPS.join('/'))); return; }
            var v = varMap[cond.var];
            if (cond.op === 'in') {
              if (!Array.isArray(cond.value)) errors.push(err('cond_value', q + '.value', 'in 运算符需要数组'));
              else cond.value.forEach(function (val) {
                if (v.type === 'enum' && v.values.indexOf(val) === -1) errors.push(err('cond_value_enum', q + '.value', '取值不在枚举内'));
                if (v.type === 'int' && (!Number.isInteger(val) || val < v.min || val > v.max)) errors.push(err('cond_value_int', q + '.value', '取值超出范围'));
              });
            } else if (v.type === 'enum' && v.values.indexOf(cond.value) === -1) {
              errors.push(err('cond_value_enum', q + '.value', '取值不在枚举内'));
            } else if (v.type === 'int' && (!Number.isInteger(cond.value) || cond.value < v.min || cond.value > v.max)) {
              errors.push(err('cond_value_int', q + '.value', '取值超出范围'));
            } else if (v.type === 'bool' && typeof cond.value !== 'boolean') {
              errors.push(err('cond_value_bool', q + '.value', 'bool 变量需要布尔值'));
            }
          });
          (c.effects || []).forEach(function (eff, k) {
            var q = cp + '.effects[' + k + ']';
            if (!S.isPlainObject(eff) || !varMap[eff.var]) { errors.push(err('effect_var', q + '.var', '效果引用了未声明变量')); return; }
            var v = varMap[eff.var];
            if (v.type === 'enum' && (v.values || []).indexOf(eff.set) === -1) errors.push(err('effect_value_enum', q + '.set', '设置值不在枚举内'));
            if (v.type === 'int' && (!Number.isInteger(eff.set) || eff.set < v.min || eff.set > v.max)) errors.push(err('effect_value_int', q + '.set', '设置值超出范围'));
            if (v.type === 'bool' && typeof eff.set !== 'boolean') errors.push(err('effect_value_bool', q + '.set', 'bool 变量需要布尔值'));
          });
        });
      }
    }
    var ph = S.privacyHit(n.text) || S.privacyHit(n.label);
    if (ph) errors.push(err('node_privacy', p, '正文/标签含' + ph));
  });

  /* 引用完整性（第二遍） */
  nodes.forEach(function (n, i) {
    if (!S.isPlainObject(n) || !Array.isArray(n.choices)) return;
    n.choices.forEach(function (c, j) {
      if (S.isPlainObject(c) && S.isStr(c.to) && !ids.has(c.to)) errors.push(err('choice_target', 'nodes[' + i + '].choices[' + j + '].to', '选项指向不存在的节点：' + c.to));
    });
  });

  /* 起点与结局 */
  if (!S.isStr(story.startNodeId) || !ids.has(story.startNodeId)) errors.push(err('start_missing', 'startNodeId', '起点必须是已定义节点'));
  if (!Array.isArray(story.endings) || story.endings.length < L.endingsMin) {
    errors.push(err('endings_count', 'endings', '结局至少 ' + L.endingsMin + ' 个'));
  } else {
    var ek = new Set(), eids = new Set();
    story.endings.forEach(function (e, i) {
      if (!S.isPlainObject(e) || !eids.has && !e.id) { errors.push(err('ending_ref', 'endings[' + i + ']', '结局需要 id')); return; }
      if (eids.has(e.id)) errors.push(err('ending_ref_dup', 'endings[' + i + ']', '结局 id 重复'));
      eids.add(e.id);
      if (ek.has(e.kind)) errors.push(err('ending_kind_dup', 'endings[' + i + '].kind', '结局类型必须两两不同'));
      ek.add(e.kind);
      var node = R.nodeById(story, e.nodeId);
      if (!node) errors.push(err('ending_node_missing', 'endings[' + i + '].nodeId', '结局节点不存在：' + e.nodeId));
      else if (!node.ending || node.ending.id !== e.id) errors.push(err('ending_node_mismatch', 'endings[' + i + ']', '结局登记与节点标记不一致：' + e.nodeId));
    });
  }

  /* 结局节点 ↔ endings 双向一致 */
  nodes.forEach(function (n, i) {
    if (S.isPlainObject(n) && n.ending && Array.isArray(story.endings)) {
      var found = story.endings.some(function (e) { return e && e.id === n.ending.id; });
      if (!found) errors.push(err('ending_unregistered', 'nodes[' + i + '].ending', '节点结局未登记在 endings 中'));
    }
  });

  /* 环 */
  if (errors.length === 0) {
    var cycle = checkAcyclic(story);
    if (cycle) errors.push(err('cycle', 'nodes', '存在环（v1 要求无环）：' + cycle.join(' → ')));
  }

  /* 可达性（图层面） */
  var reach = errors.length === 0 ? reachableNodes(story) : null;
  if (reach) {
    nodes.forEach(function (n) {
      if (S.isPlainObject(n) && !reach.has(n.id)) errors.push(err('unreachable', 'nodes.' + n.id, '节点不可从起点到达：' + n.id));
    });
  }

  /* 路径层级检查（穷举或覆盖+采样） */
  var enumRes = null;
  if (errors.length === 0) {
    enumRes = enumeratePaths(story, { limit: opts.pathLimit || L.maxPathsExhaustive });
    metrics.paths = { mode: enumRes.mode, counted: enumRes.paths.length, capped: enumRes.capped, visitedPairs: enumRes.visitedPairs, totalPairs: enumRes.totalPairs, stateSpace: enumRes.stateSpace };
    var lenMin = opts.premium ? L.pathNodesPremium.min : L.pathNodes.min;
    var lenMax = opts.premium ? L.pathNodesPremium.max : L.pathNodes.max;
    enumRes.paths.forEach(function (p, i) {
      if (p.deadEnd) { errors.push(err('dead_end', 'paths[' + i + ']', '路径在 ' + p.nodes[p.nodes.length - 1] + ' 出现无选项死路')); return; }
      if (p.nodes.length < lenMin || p.nodes.length > lenMax) errors.push(err('path_len', 'paths[' + i + ']', '路径长度 ' + lenMin + '–' + lenMax + '（当前 ' + p.nodes.length + '：' + p.nodes.join('→') + '）'));
    });
    metrics.endingReach = {};
    enumRes.paths.forEach(function (p) { if (p.endingId) metrics.endingReach[p.endingId] = (metrics.endingReach[p.endingId] || 0) + 1; });
    (story.endings || []).forEach(function (e) { if (e && e.id && !metrics.endingReach[e.id]) errors.push(err('ending_unreachable', 'endings.' + e.id, '结局不可达：' + e.id)); });

    /* 带状态全状态死路检查：任何可达 (节点,状态) 都必须有可用选项或是结局 */
    if ((story.vars || []).length) {
      nodes.forEach(function (n) {
        if (!S.isPlainObject(n) || n.ending) return;
        enumerateStates(story, n.id).forEach(function (fk) {
          var vals = fk === '∅' ? '' : fk.split('|');
          var flags = {};
          (story.vars || []).forEach(function (v, k) {
            flags[v.id] = v.type === 'int' ? parseInt(vals[k], 10) : (v.type === 'bool' ? vals[k] === 'true' : vals[k]);
          });
          var avail = R.availableChoices(story, n, flags);
          if (!avail.length) errors.push(err('state_dead_end', 'nodes.' + n.id, '状态 ' + fk + ' 下无可用选项（可能死路）'));
        });
      });
    }
  }

  /* 重复文本与伪分支 */
  var textMap = {};
  nodes.forEach(function (n) {
    if (!S.isPlainObject(n) || !S.isStr(n.text)) return;
    var key = n.text.trim();
    if (textMap[key]) errors.push(err('text_dup', 'nodes.' + n.id + '.text', '正文与 ' + textMap[key] + ' 完全相同'));
    else textMap[key] = n.id;
  });
  /* 伪分支：同节点两个选项 → 不同节点，但后继全文签名相同 */
  function subtreeSig(id, depth, visited) {
    if (depth <= 0) return '';
    var node = R.nodeById(story, id);
    if (!node) return '';
    if (visited.indexOf(id) !== -1) return id + ':…';
    var parts = [node.text || ''];
    (node.choices || []).forEach(function (c) { parts.push(subtreeSig(c.to, depth - 1, visited.concat([id]))); });
    return parts.join('\u0001');
  }
  if (errors.length === 0 || errors.filter(function (e) { return e.code !== 'text_dup'; }).length === 0) {
    nodes.forEach(function (n, i) {
      if (!S.isPlainObject(n) || !Array.isArray(n.choices) || n.choices.length < 2) return;
      for (var a = 0; a < n.choices.length; a++) {
        for (var b = a + 1; b < n.choices.length; b++) {
          var ca = n.choices[a], cb = n.choices[b];
          if (!ca || !cb || ca.to === cb.to) continue;
          var sa = subtreeSig(ca.to, 3, []), sb = subtreeSig(cb.to, 3, []);
          if (sa && sa === sb) errors.push(err('fake_branch', 'nodes[' + i + ']', '选项「' + ca.text + '」与「' + cb.text + '」后续内容完全相同（伪分支）'));
          else if (sa && sb && S.similarity(sa, sb) > 0.9) warnings.push(err('near_dup_branch', 'nodes[' + i + ']', '两个选项后续内容高度相似（' + ca.text + ' / ' + cb.text + '）'));
        }
      }
    });
  }

  /* 结局实质区别 */
  if (Array.isArray(story.endings) && story.endings.length >= 2) {
    for (var i = 0; i < story.endings.length; i++) {
      for (var j = i + 1; j < story.endings.length; j++) {
        var e1 = story.endings[i], e2 = story.endings[j];
        if (!e1 || !e2) continue;
        if (e1.kind === e2.kind) continue; /* 已在上面报错 */
        var n1 = R.nodeById(story, e1.nodeId), n2 = R.nodeById(story, e2.nodeId);
        var sim = S.similarity(e1.title + (n1 ? n1.text : ''), e2.title + (n2 ? n2.text : ''));
        if (sim > 0.6) errors.push(err('ending_similar', 'endings', '结局 ' + e1.id + ' 与 ' + e2.id + ' 内容过于相似（' + sim.toFixed(2) + '）'));
      }
    }
  }

  /* 隐私与凭据样式 */
  S.storyTexts(story).forEach(function (t, i) {
    var ph = S.privacyHit(t);
    if (ph) errors.push(err('privacy', 'texts[' + i + ']', '文本含' + ph));
  });

  metrics.nodeCount = nodes.length;
  metrics.endingCount = (story.endings || []).length;
  var cjkSum = 0, cjkN = 0, choices = 0;
  nodes.forEach(function (n) {
    if (S.isPlainObject(n) && S.isStr(n.text)) { cjkSum += S.cjkCount(n.text); cjkN++; }
    if (S.isPlainObject(n) && Array.isArray(n.choices)) choices += n.choices.length;
  });
  metrics.avgNodeCjk = cjkN ? Math.round(cjkSum / cjkN) : 0;
  metrics.totalChoices = choices;
  if (enumRes) {
    metrics.avgPathLen = enumRes.paths.length ? +(enumRes.paths.reduce(function (a, p) { return a + p.nodes.length; }, 0) / enumRes.paths.length).toFixed(2) : 0;
  }
  if (opts.wantPaths) metrics._paths = enumRes ? enumRes.paths : [];

  return { ok: errors.length === 0, errors: errors, warnings: warnings, metrics: metrics };
}

module.exports = {
  validateStory: validateStory,
  enumeratePaths: enumeratePaths,
  enumerateStates: enumerateStates,
  reachableNodes: reachableNodes,
  stateSpaceSize: stateSpaceSize
};
