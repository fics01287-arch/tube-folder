/* background.js — MV3 서비스워커
 *  - 확장 아이콘 클릭 → 매니저 탭 열기(이미 있으면 활성화)
 *  - 유튜브 페이지/링크 우클릭 "튜브폴더에 추가"
 */
importScripts('storage.js');

var MANAGER = 'manager.html';

chrome.action.onClicked.addListener(async function () {
  var url = chrome.runtime.getURL(MANAGER);
  var tabs = await chrome.tabs.query({});
  var ex = tabs.find(function (t) { return t.url && t.url.indexOf(url) === 0; });
  if (ex) chrome.tabs.update(ex.id, { active: true });
  else chrome.tabs.create({ url: url });
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'add-to-tubefolder',
      title: '튜브폴더에 추가',
      contexts: ['page', 'link'],
      documentUrlPatterns: ['*://*.youtube.com/*', '*://youtu.be/*']
    });
    chrome.contextMenus.create({
      id: 'open-tubefolder',
      title: '튜브폴더 열기',
      contexts: ['action']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (info.menuItemId === 'open-tubefolder') {
    chrome.tabs.create({ url: chrome.runtime.getURL(MANAGER) });
    return;
  }
  if (info.menuItemId !== 'add-to-tubefolder') return;

  var url = info.linkUrl || info.pageUrl || (tab && tab.url);
  var vid = TubeStore.extractVideoId(url);
  if (!vid) { flashBadge('!', '#888888'); return; }

  var title = (tab && tab.title) || url;
  title = title.replace(/\s*-\s*YouTube.*$/, '').trim() || url;

  await TubeStore.addVideo({
    url: url, title: title, videoId: vid,
    kind: String(url).indexOf('music.youtube') >= 0 ? 'music' : 'video'
  });
  flashBadge('+1', '#22a722');
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color: color });
  chrome.action.setBadgeText({ text: text });
  setTimeout(function () { chrome.action.setBadgeText({ text: '' }); }, 1600);
}
