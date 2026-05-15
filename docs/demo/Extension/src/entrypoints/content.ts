export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'ANHEDRAL_PAGE_SNAPSHOT') return false;

      sendResponse({
        title: document.title,
        location: window.location.href,
      });
      return true;
    });
  },
});
