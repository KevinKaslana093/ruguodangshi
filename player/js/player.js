/* 故事加载 + 运行时校验（浏览器端）。加载后的故事若校验失败，一律拒绝进入，避免半截内容。 */
(function () {
  'use strict';

  var loaded = {};        // storyId → story
  var indexCache = null;

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('加载失败：' + url + '（HTTP ' + r.status + '）');
      return r.json();
    });
  }

  /* 相对站点根解析：开发布局为 /player/stories/，发布布局为 /stories/。
   * 播放器自身即站点根，因此统一用 './stories/...'（两种布局下都正确）。 */
  var BASE = './stories/';

  function loadIndex() {
    if (indexCache) return Promise.resolve(indexCache);
    return fetchJson(BASE + 'index.json').then(function (idx) {
      indexCache = idx;
      return idx;
    });
  }

  /* 运行时校验（精简但关键：与 shared/validate.js 的硬规则一致） */
  function validateBasic(story) {
    var S = window.RD.Schema, problems = [];
    if (!story || typeof story !== 'object') return ['故事文件不是对象'];
    if (story.schemaVersion !== S.SCHEMA_VERSION) problems.push('schemaVersion 不支持：' + story.schemaVersion);
    if (!S.LIMITS.storyIdPattern.test(String(story.storyId || ''))) problems.push('storyId 非法');
    if (!Array.isArray(story.nodes) || !story.nodes.length) problems.push('nodes 缺失');
    var ids = {};
    (story.nodes || []).forEach(function (n) {
      if (!n || !S.isStr(n.id)) { problems.push('存在无 id 的节点'); return; }
      if (ids[n.id]) problems.push('节点 id 重复：' + n.id);
      ids[n.id] = n;
      if (S.textShapeError(n.text)) problems.push(n.id + ' 正文格式非法');
    });
    if (!ids[story.startNodeId]) problems.push('startNodeId 不存在');
    (story.nodes || []).forEach(function (n) {
      if (!n || !Array.isArray(n.choices)) return;
      n.choices.forEach(function (c) {
        if (!c || !ids[c.to]) problems.push((n.id || '?') + ' 的选项指向不存在的节点：' + (c && c.to));
      });
    });
    (story.endings || []).forEach(function (e) {
      if (!e || !ids[e.nodeId]) problems.push('结局节点不存在：' + (e && e.nodeId));
    });
    if (!Array.isArray(story.endings) || story.endings.length < 3) problems.push('结局少于 3 个');
    return problems;
  }

  function loadStory(storyId) {
    if (loaded[storyId]) {
      var cached = validateBasic(loaded[storyId]);
      if (!cached.length) return Promise.resolve(loaded[storyId]);
      delete loaded[storyId];
    }
    return fetchJson(BASE + encodeURIComponent(storyId) + '.json').then(function (story) {
      var problems = validateBasic(story);
      if (problems.length) throw new Error('故事结构校验未通过：' + problems.slice(0, 3).join('；'));
      loaded[storyId] = story;
      return story;
    });
  }

  window.RDData = { loadIndex: loadIndex, loadStory: loadStory, validateBasic: validateBasic };
})();
