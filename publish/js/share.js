/* 分享：静态哈希深链。链接不含原始故事、编辑凭据或任何密钥。 */
(function () {
  'use strict';

  function shareUrl(storyId) {
    var base = location.origin + location.pathname.replace(/index\.html$/, '');
    return base + '#/s/' + encodeURIComponent(storyId);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* 优先系统分享，失败回退到复制链接 */
  function shareStory(story, extra) {
    var url = shareUrl(story.storyId);
    var text = '《' + story.title + '》' + (extra ? extra : '我在「如果当时」读完了这个故事，你也来试试。');
    if (navigator.share) {
      return navigator.share({ title: story.title, text: text, url: url })
        .then(function () { return { how: 'native', url: url }; })
        .catch(function () { return copy(url).then(function (ok) { return { how: ok ? 'copy' : 'fail', url: url }; }); });
    }
    return copy(url).then(function (ok) { return { how: ok ? 'copy' : 'fail', url: url }; });
  }

  window.RDShare = { shareUrl: shareUrl, copy: copy, shareStory: shareStory };
})();
