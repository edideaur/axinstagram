// ==UserScript==
// @name         ax-helper
// @namespace    https://axinstagram.com
// @version      1.0
// @description  Lets axinstagram auto-fetch private Instagram data using your logged-in session
// @author       edideaur
// @match        https://axinstagram.com/*
// @match        https://axinstagram.pages.dev/*
// @match        https://instagram.prigoana.com/*
// @match        https://127.0.0.1:8788/*
// @match        http://127.0.0.1:8788/*
// @match        https://localhost:8788/*
// @match        http://localhost:8788/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.instagram.com
// @connect      i.instagram.com
// @run-at       document-start
// @downloadURL  https://axinstagram.com/ax-helper.user.js
// @updateURL    https://axinstagram.com/ax-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Signal to the page that the helper is active
  unsafeWindow.__axHelperReady = true;

  document.addEventListener('ax:fetch', (e) => {
    const { id, url } = e.detail;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      withCredentials: true,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-IG-App-ID': '936619743392459',
      },
      onload(r) {
        document.dispatchEvent(new CustomEvent('ax:response', {
          detail: { id, data: r.status >= 200 && r.status < 300 ? r.responseText : null },
        }));
      },
      onerror() {
        document.dispatchEvent(new CustomEvent('ax:response', { detail: { id, data: null } }));
      },
      ontimeout() {
        document.dispatchEvent(new CustomEvent('ax:response', { detail: { id, data: null } }));
      },
    });
  });
})();
