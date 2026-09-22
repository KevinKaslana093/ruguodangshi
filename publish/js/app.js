/* 「如果当时」播放器应用层：首页 / 故事卡 / 阅读 / 结局 / 分享 / 进度恢复。
 * 无模型调用、无生成入口：所有内容来自已发布的故事文件。 */
(function () {
  'use strict';

  var app, toastEl;
  var state = null;         // 当前游玩状态
  var current = null;       // 当前故事
  var filterGenre = 'all';

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }
  function genreName(id) {
    var g = window.RD.Schema.genreById(id);
    return g ? g.name : id;
  }
  function kindName(kind) {
    return ({ happy: '圆满', bittersweet: '苦甜', twist: '转折', open: '开放', regret: '遗憾', surprise: '意外' })[kind] || kind;
  }

  /* ── 封面（程序绘制图案 + 色相） ───────────────── */
  function coverEl(story, detailed) {
    var c = h('div', 'cover');
    c.style.setProperty('--hue', String((story.cover && story.cover.hue) || 210));
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'glyph');
    svg.setAttribute('viewBox', '0 0 400 120');
    svg.setAttribute('preserveAspectRatio', 'none');
    var hue = (story.cover && story.cover.hue) || 210;
    var stroke = 'hsl(' + hue + ' 45% 34%)';
    var pattern = (story.cover && story.cover.pattern) || 'grid';
    var inner = '';
    var i, j;
    if (pattern === 'grid') {
      for (i = 0; i <= 400; i += 40) inner += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="120"/>';
      for (j = 0; j <= 120; j += 30) inner += '<line x1="0" y1="' + j + '" x2="400" y2="' + j + '"/>';
    } else if (pattern === 'dots') {
      for (i = 20; i < 400; i += 34) for (j = 18; j < 120; j += 30) inner += '<circle cx="' + i + '" cy="' + j + '" r="3.2"/>';
    } else if (pattern === 'lines') {
      for (i = -120; i < 440; i += 26) inner += '<line x1="' + i + '" y1="120" x2="' + (i + 120) + '" y2="0"/>';
    } else if (pattern === 'waves') {
      for (j = 16; j < 130; j += 22) inner += '<path d="M-10,' + j + ' q25,-12 50,0 t50,0 t50,0 t50,0 t50,0 t50,0 t50,0 t50,0" fill="none"/>';
    } else if (pattern === 'rings') {
      for (i = 0; i < 5; i++) inner += '<circle cx="330" cy="60" r="' + (18 + i * 26) + '" fill="none"/>';
    } else if (pattern === 'arc') {
      for (i = 0; i < 7; i++) inner += '<path d="M' + (-40 + i * 40) + ',130 q80,-90 200,-110" fill="none"/>';
    }
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', stroke);
    svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('opacity', '0.55');
    svg.innerHTML = inner;
    c.appendChild(svg);
    c.appendChild(h('div', 'title-on', story.title));
    return c;
  }

  /* ── 路由 ─────────────────────────────────────── */
  function parseHash() {
    var m = /^#\/s\/([A-Za-z0-9_-]+)$/.exec(location.hash || '');
    if (m) return { name: 'story', storyId: decodeURIComponent(m[1]) };
    m = /^#\/play\/([A-Za-z0-9_-]+)$/.exec(location.hash || '');
    if (m) return { name: 'play', storyId: decodeURIComponent(m[1]) };
    return { name: 'home' };
  }
  function nav(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ── 首页 ─────────────────────────────────────── */
  function renderHome() {
    var wrap = h('div');
    var resume = window.RDStore.allProgress().filter(function (p) { return p && !p.ended; });

    if (resume.length) {
      var r = resume[0];
      var box = h('div', 'resume');
      var grow = h('div', 'grow');
      var idx = window.RDData.loadIndex();
      idx.then(function (index) {
        var st = (index.stories || []).filter(function (s) { return s.storyId === r.storyId; })[0];
        grow.appendChild(h('h3', null, '继续上次：' + (st ? st.title : r.storyId)));
        grow.appendChild(h('p', null, '读到第 ' + r.visited.length + ' 段 · ' + new Date(r.savedAt || Date.now()).toLocaleString('zh-CN')));
        box.appendChild(grow);
        var go = h('button', 'btn small', '继续');
        go.onclick = function () { nav('#/play/' + r.storyId); };
        box.appendChild(go);
      });
    }

    var filters = h('div', 'filters');
    var all = h('button', 'chip', '全部');
    all.setAttribute('aria-pressed', String(filterGenre === 'all'));
    all.onclick = function () { filterGenre = 'all'; render(); };
    filters.appendChild(all);
    window.RD.Schema.GENRES.forEach(function (g) {
      var b = h('button', 'chip', g.name);
      b.setAttribute('aria-pressed', String(filterGenre === g.id));
      b.onclick = function () { filterGenre = g.id; render(); };
      filters.appendChild(b);
    });

    var grid = h('div', 'grid');
    var note = h('p', 'tagline', '正在加载故事库…');
    window.RDData.loadIndex().then(function (index) {
      var list = (index.stories || []).filter(function (s) { return filterGenre === 'all' || s.genreId === filterGenre; });
      if (!list.length) {
        var e = h('div', 'empty', '这个题材下还没有故事。');
        grid.appendChild(e);
      }
      var unlockedMap = {};
      list.forEach(function (s) {
        var card = h('div', 'card');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.appendChild(coverEl(s));
        var body = h('div', 'card-body');
        var meta = h('div', 'card-meta');
        meta.appendChild(h('span', 'pill', genreName(s.genreId)));
        meta.appendChild(h('span', 'pill plain', (s.estimatedMinutes || 4) + ' 分钟'));
        meta.appendChild(h('span', 'pill plain', (s.endingCount || 0) + ' 个结局'));
        body.appendChild(meta);
        body.appendChild(h('p', 'tagline2', s.tagline || ''));
        var row = h('div', 'actions');
        var open = h('button', 'btn small', '查看');
        open.onclick = function (ev) { ev.stopPropagation(); nav('#/s/' + s.storyId); };
        row.appendChild(open);
        var un = window.RDStore.unlocked(s.storyId);
        if (un.length) row.appendChild(h('span', 'hint', '已解锁 ' + un.length + '/' + (s.endingCount || '?') + ' 个结局'));
        body.appendChild(row);
        card.appendChild(body);
        card.onclick = function () { nav('#/s/' + s.storyId); };
        card.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nav('#/s/' + s.storyId); } };
        grid.appendChild(card);
      });
      note.remove();
      wrap.appendChild(filters);
      wrap.appendChild(grid);
    }).catch(function (err) {
      note.remove();
      wrap.appendChild(h('div', 'err', '故事索引加载失败：' + err.message));
    });

    app.innerHTML = '';
    app.appendChild(h('div', 'topbar', null));
    var bar = app.querySelector('.topbar');
    bar.appendChild(h('div', 'brand', '如果当时'));
    bar.appendChild(h('span', 'spacer'));
    var rand = h('button', 'toggle-btn', '随机一故事');
    rand.onclick = function () {
      window.RDData.loadIndex().then(function (index) {
        var list = index.stories || [];
        if (!list.length) { toast('故事库是空的'); return; }
        var pick = list[Math.floor(Math.random() * list.length)];
        nav('#/s/' + pick.storyId);
      });
    };
    bar.appendChild(rand);
    bar.appendChild(motionToggle());
    app.appendChild(h('p', 'tagline', '预制互动剧情故事库：读一段，做一个选择，走到属于你的结局。内容已提前写好——打开就能玩，不需要等待。'));
    app.appendChild(wrap);
    app.appendChild(footNote());
  }

  function motionToggle() {
    var s = window.RDStore.settings();
    var b = h('button', 'toggle-btn', '减少动态效果');
    b.setAttribute('aria-pressed', String(s.motion === 'off'));
    b.onclick = function () {
      var next = window.RDStore.settings().motion === 'off' ? 'on' : 'off';
      window.RDStore.setSetting('motion', next);
      document.documentElement.setAttribute('data-motion', next);
      b.setAttribute('aria-pressed', String(next === 'off'));
      b.textContent = '减少动态效果';
    };
    return b;
  }

  function footNote() {
    var f = h('div', 'foot');
    f.appendChild(h('p', null, '全部故事与分支均已提前写好并保存在站点文件中：游玩不调用任何生成接口，也不依赖网络服务（已下载内容可离线游玩，首次访问仍需联网取回文件）。'));
    f.appendChild(h('p', null, '进度与解锁记录保存在本机浏览器。分享链接只包含故事 ID，不含私人内容。'));
    f.appendChild(h('p', null, '故事均为虚构创作，不对现实人物心理或行为做推断。'));
    return f;
  }

  /* ── 故事卡 ───────────────────────────────────── */
  function renderStory(storyId) {
    app.innerHTML = '';
    app.appendChild(h('div', 'topbar', null));
    var bar = app.querySelector('.topbar');
    var back = h('button', 'toggle-btn', '← 故事库');
    back.onclick = function () { nav('#/'); };
    bar.appendChild(back);
    bar.appendChild(h('span', 'spacer'));
    bar.appendChild(motionToggle());

    var loading = h('p', 'tagline', '正在加载故事…');
    app.appendChild(loading);

    window.RDData.loadStory(storyId).then(function (story) {
      loading.remove();
      var wrap = h('div', 'detail');
      wrap.appendChild(coverEl(story, true));
      var body = h('div', 'detail-body');
      var meta = h('div', 'card-meta');
      meta.appendChild(h('span', 'pill', genreName(story.genreId)));
      meta.appendChild(h('span', 'pill plain', story.estimatedMinutes + ' 分钟'));
      meta.appendChild(h('span', 'pill plain', story.endings.length + ' 个结局'));
      (story.tags || []).forEach(function (t) { meta.appendChild(h('span', 'pill plain', t)); });
      body.appendChild(meta);
      body.appendChild(h('p', 'summary', story.summary));
      var kv = h('div', 'kv');
      kv.appendChild(h('span', null, '人物：' + story.characters.map(function (c) { return c.name; }).join('、')));
      kv.appendChild(h('span', null, '开场：' + (story.nodes.filter(function (n) { return n.id === story.startNodeId; })[0] || {}).text.slice(0, 28) + '…'));
      body.appendChild(kv);

      var chars = h('div', 'chars');
      story.characters.forEach(function (c) {
        var chip = h('div', 'char');
        chip.appendChild(h('b', null, c.name));
        chip.appendChild(document.createTextNode(c.desc || ''));
        chars.appendChild(chip);
      });
      body.appendChild(chars);

      var actions = h('div', 'actions');
      var start = h('button', 'btn', '进入故事');
      var saved = window.RDStore.loadProgress(story.storyId);
      start.textContent = (saved && !saved.ended) ? '继续故事' : '从头开始';
      start.onclick = function () { nav('#/play/' + story.storyId); };
      actions.appendChild(start);
      if (saved) {
        var restart = h('button', 'btn ghost small', '重新开始（清空进度）');
        restart.onclick = function () {
          window.RDStore.clearProgress(story.storyId);
          toast('已清空这则故事的进度');
          render();
        };
        actions.appendChild(restart);
      }
      var shareBtn = h('button', 'btn ghost small', '复制分享链接');
      shareBtn.onclick = function () {
        window.RDShare.shareStory(story).then(function (r) {
          toast(r.how === 'copy' ? '分享链接已复制' : (r.how === 'native' ? '已打开系统分享' : '复制失败，请手动复制地址'));
        });
      };
      actions.appendChild(shareBtn);
      actions.appendChild(h('span', 'hint', '分享链接打开后是同一个已保存的故事，无需等待生成'));
      body.appendChild(actions);

      var ul = h('div', 'endings-list');
      ul.appendChild(h('div', 'section-title', '结局'));
      var unlocked = window.RDStore.unlocked(story.storyId);
      story.endings.forEach(function (e) {
        var row = h('div', 'row');
        var got = unlocked.indexOf(e.id) !== -1;
        var badge = h('span', 'badge' + (got ? ' unlocked' : ''), got ? '已解锁' : '未解锁');
        row.appendChild(badge);
        row.appendChild(h('span', null, got ? e.title : '???' + '（' + kindName(e.kind) + '）'));
        ul.appendChild(row);
      });
      body.appendChild(ul);
      wrap.appendChild(body);
      app.appendChild(wrap);
      app.appendChild(footNote());
    }).catch(function (err) {
      loading.remove();
      app.appendChild(h('div', 'err', '这则故事加载失败：' + err.message));
      app.appendChild(footNote());
    });
  }

  /* ── 阅读 ─────────────────────────────────────── */
  function renderPlay(storyId) {
    app.innerHTML = '';
    app.appendChild(h('div', 'topbar', null));
    var bar = app.querySelector('.topbar');
    var back = h('button', 'toggle-btn', '← 故事卡');
    back.onclick = function () { nav('#/s/' + storyId); };
    bar.appendChild(back);
    bar.appendChild(h('span', 'spacer'));
    var toLib = h('button', 'toggle-btn', '故事库');
    toLib.onclick = function () { nav('#/'); };
    bar.appendChild(toLib);

    var loading = h('p', 'tagline', '正在加载故事…');
    app.appendChild(loading);

    window.RDData.loadStory(storyId).then(function (story) {
      loading.remove();
      current = story;
      var saved = window.RDStore.loadProgress(story.storyId);
      state = saved ? window.RD.Runtime.restore(story, saved) : null;
      if (!state) { state = window.RD.Runtime.newState(story); }
      renderReader();
    }).catch(function (err) {
      loading.remove();
      app.appendChild(h('div', 'err', '故事加载失败：' + err.message));
    });
  }

  function renderReader() {
    var story = current;
    var node = window.RD.Runtime.nodeById(story, state.nodeId);
    if (!node) { app.appendChild(h('div', 'err', '节点不存在：' + state.nodeId)); return; }
    if (node.ending) { renderEnding(node); return; }

    var wrap = h('div', 'reader');
    if (node.label) wrap.appendChild(h('div', 'label', node.label));
    wrap.appendChild(h('p', 'text', node.text));

    var choices = window.RD.Runtime.availableChoices(story, node, state.flags);
    if (!choices.length) {
      wrap.appendChild(h('div', 'err', '这个节点没有可用选项（存档可能来自旧版本）。可以重新开始。'));
    }
    var box = h('div', 'choices');
    choices.forEach(function (c, i) {
      var b = h('button', 'choice');
      b.appendChild(h('span', 'num', String.fromCharCode(65 + i)));
      b.appendChild(document.createTextNode(c.text));
      b.onclick = function () { pick(i); };
      box.appendChild(b);
    });
    wrap.appendChild(box);

    var total = Math.max(story.nodes.length, state.visited.length);
    var prog = h('div', 'progress');
    var bar = h('div', 'bar');
    var fill = h('i');
    fill.style.width = Math.min(100, Math.round(state.visited.length / Math.max(6, Math.min(total, 12)) * 100)) + '%';
    bar.appendChild(fill);
    prog.appendChild(bar);
    prog.appendChild(h('span', null, '第 ' + state.visited.length + ' 段'));
    wrap.appendChild(prog);

    var foot = h('div', 'reader-foot');
    var save = h('button', 'btn ghost small', '保存进度');
    save.onclick = function () { window.RDStore.saveProgress(state); toast('进度已保存在本机'); };
    foot.appendChild(save);
    var restart = h('button', 'btn ghost small', '重新开始');
    restart.onclick = function () {
      window.RDStore.clearProgress(story.storyId);
      state = window.RD.Runtime.newState(story);
      toast('已从头开始');
      renderReader();
      window.RDStore.saveProgress(state);
    };
    foot.appendChild(restart);
    var shareBtn = h('button', 'btn ghost small', '分享这则故事');
    shareBtn.onclick = function () {
      window.RDShare.shareStory(story).then(function (r) { toast(r.how === 'fail' ? '复制失败，请手动复制地址' : '分享链接已就绪'); });
    };
    foot.appendChild(shareBtn);
    wrap.appendChild(foot);

    app.innerHTML = '';
    app.appendChild(h('div', 'topbar', null));
    var bar2 = app.querySelector('.topbar');
    var b2 = h('button', 'toggle-btn', '← 故事卡');
    b2.onclick = function () { nav('#/s/' + story.storyId); };
    bar2.appendChild(b2);
    bar2.appendChild(h('span', 'spacer'));
    bar2.appendChild(h('span', 'hint', '《' + story.title + '》'));
    app.appendChild(wrap);
  }

  function pick(idx) {
    try {
      state = window.RD.Runtime.step(current, state, idx);
    } catch (e) {
      toast('这一步没有生效：' + e.message);
      return;
    }
    window.RDStore.saveProgress(state);
    renderReader();
    window.scrollTo({ top: 0, behavior: window.RDStore.settings().motion === 'off' ? 'auto' : 'smooth' });
  }

  /* ── 结局 ─────────────────────────────────────── */
  function renderEnding(node) {
    var story = current;
    var e = node.ending;
    var unlocked = window.RDStore.markUnlocked(story.storyId, e.id);
    var wrap = h('div', 'ending');
    wrap.appendChild(h('div', 'kind', kindName(e.kind) + '结局'));
    wrap.appendChild(h('h1', null, e.title));

    var text = story.nodes.filter(function (n) { return n.id === node.id; })[0];
    wrap.appendChild(h('p', 'text', text.text));

    var stats = h('div', 'stats');
    stats.appendChild(h('span', null, '走了 ' + state.visited.length + ' 段'));
    stats.appendChild(h('span', null, '做了 ' + state.choices.length + ' 个选择'));
    stats.appendChild(h('span', null, '已解锁 ' + unlocked.length + '/' + story.endings.length + ' 个结局'));
    wrap.appendChild(stats);

    var review = h('div', 'review');
    review.appendChild(h('h2', null, '关键选择回顾'));
    var ol = h('ol');
    state.choices.forEach(function (c) {
      var node0 = window.RD.Runtime.nodeById(story, c.nodeId);
      ol.appendChild(h('li', null, (node0 && node0.label ? node0.label + ' · ' : '') + c.choiceText));
    });
    review.appendChild(ol);
    wrap.appendChild(review);

    var ul = h('div', 'unlocked');
    ul.appendChild(h('div', 'section-title', '这则故事的结局'));
    story.endings.forEach(function (en) {
      var got = unlocked.indexOf(en.id) !== -1;
      var row = h('div', 'row');
      row.appendChild(h('span', 'badge' + (got ? ' unlocked' : ''), got ? '已解锁' : '未解锁'));
      row.appendChild(h('span', null, got ? en.title : '???（' + kindName(en.kind) + '）'));
      ul.appendChild(row);
    });
    wrap.appendChild(ul);

    var actions = h('div', 'actions');
    actions.style.marginTop = '1.2rem';
    var again = h('button', 'btn', '再玩一次');
    again.onclick = function () {
      window.RDStore.clearProgress(story.storyId);
      state = window.RD.Runtime.newState(story);
      window.RDStore.saveProgress(state);
      renderReader();
      window.scrollTo(0, 0);
    };
    actions.appendChild(again);
    var lib = h('button', 'btn ghost', '返回故事库');
    lib.onclick = function () { nav('#/'); };
    actions.appendChild(lib);
    var shareBtn = h('button', 'btn ghost', '分享这个故事');
    shareBtn.onclick = function () {
      window.RDShare.shareStory(story, '我走到了《' + story.title + '》的「' + e.title + '」，你也来试试。').then(function (r) {
        toast(r.how === 'fail' ? '复制失败，请手动复制地址' : '分享链接已就绪');
      });
    };
    actions.appendChild(shareBtn);
    wrap.appendChild(actions);

    app.innerHTML = '';
    app.appendChild(h('div', 'topbar', null));
    var bar = app.querySelector('.topbar');
    bar.appendChild(h('div', 'brand', '如果当时'));
    bar.appendChild(h('span', 'spacer'));
    bar.appendChild(motionToggle());
    app.appendChild(wrap);
    app.appendChild(footNote());
  }

  /* ── 启动 ─────────────────────────────────────── */
  function render() {
    var r = parseHash();
    if (r.name === 'story') renderStory(r.storyId);
    else if (r.name === 'play') renderPlay(r.storyId);
    else renderHome();
  }

  function boot() {
    app = document.getElementById('app');
    toastEl = document.getElementById('toast');
    var s = window.RDStore.settings();
    document.documentElement.setAttribute('data-motion', s.motion || 'on');
    window.addEventListener('hashchange', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
