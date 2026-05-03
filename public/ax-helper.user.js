// ==UserScript==
// @name         ax-helper
// @namespace    https://axinstagram.com
// @version      1.2
// @description  Lets axinstagram auto-fetch private Instagram data using your logged-in session and bypasses CORS/CORP for media and API.
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
// @connect      instagram.com
// @connect      *.instagram.com
// @connect      cdninstagram.com
// @connect      *.cdninstagram.com
// @connect      fbcdn.net
// @connect      *.fbcdn.net
// @connect      fbsbx.com
// @connect      *.fbsbx.com
// @run-at       document-start
// @downloadURL  https://axinstagram.com/ax-helper.user.js
// @updateURL    https://axinstagram.com/ax-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Signal to the page that the helper is active
  unsafeWindow.__axHelperReady = true;

  const PROXY_PREFIX = '/dl?url=';
  const INTERCEPT_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'instagram.com'];
  const IG_APP_ID = '936619743392459';

  function shouldIntercept(url) {
    if (!url || typeof url !== 'string' || url.startsWith('blob:') || url.startsWith('data:')) return false;
    if (url.includes(PROXY_PREFIX)) return true;
    try {
      const u = new URL(url, location.origin);
      return INTERCEPT_HOSTS.some(host => u.hostname.endsWith(host));
    } catch (e) {
      return false;
    }
  }

  function getTargetUrl(url) {
    if (url.includes(PROXY_PREFIX)) {
      try {
        const u = new URL(url, location.origin);
        return u.searchParams.get('url');
      } catch (e) {
        return null;
      }
    }
    return url;
  }

  const blobCache = new Map();
  const pendingFetches = new Map();

  function fetchDirectly(url) {
    const target = getTargetUrl(url);
    if (!target) return Promise.resolve(url);
    if (blobCache.has(target)) return Promise.resolve(blobCache.get(target));
    if (pendingFetches.has(target)) return pendingFetches.get(target);

    const p = new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: target,
        responseType: 'blob',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            const blobUrl = URL.createObjectURL(res.response);
            blobCache.set(target, blobUrl);
            resolve(blobUrl);
          } else {
            resolve(url); // Fallback
          }
          pendingFetches.delete(target);
        },
        onerror: () => {
          resolve(url);
          pendingFetches.delete(target);
        },
      });
    });

    pendingFetches.set(target, p);
    return p;
  }

  // Intercept fetch
  const originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    if (shouldIntercept(url)) {
      const target = getTargetUrl(url);
      const isIG = target.includes('instagram.com');
      return new Promise((resolve, reject) => {
        const headers = new Headers(init?.headers || {});
        if (isIG && !headers.has('X-IG-App-ID')) {
          headers.set('X-IG-App-ID', IG_APP_ID);
        }
        
        GM_xmlhttpRequest({
          method: init?.method || 'GET',
          url: target,
          headers: Object.fromEntries(headers.entries()),
          withCredentials: isIG,
          responseType: 'blob',
          onload: (res) => {
            const resHeaders = new Headers();
            if (res.responseHeaders) {
              res.responseHeaders.split('\r\n').forEach(line => {
                const parts = line.split(': ');
                if (parts.length === 2) resHeaders.append(parts[0], parts[1]);
              });
            }
            resHeaders.set('Access-Control-Allow-Origin', '*');
            resolve(new Response(res.response, {
              status: res.status,
              statusText: res.statusText,
              headers: resHeaders
            }));
          },
          onerror: () => reject(new TypeError('Network request failed')),
        });
      });
    }
    return originalFetch(input, init);
  };

  // Property Patching
  const patch = (proto, prop) => {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc) return;
    Object.defineProperty(proto, prop, {
      get: function () { return desc.get.call(this); },
      set: function (val) {
        if (shouldIntercept(val)) {
          fetchDirectly(val).then(b => desc.set.call(this, b));
        } else {
          desc.set.call(this, val);
        }
      }
    });
  };

  if (unsafeWindow.HTMLImageElement) patch(unsafeWindow.HTMLImageElement.prototype, 'src');
  if (unsafeWindow.HTMLVideoElement) {
    patch(unsafeWindow.HTMLVideoElement.prototype, 'src');
    patch(unsafeWindow.HTMLVideoElement.prototype, 'poster');
  }
  if (unsafeWindow.HTMLSourceElement) patch(unsafeWindow.HTMLSourceElement.prototype, 'src');

  // MutationObserver for attribute changes
  const check = (el) => {
    if (!el.tagName) return;
    ['src', 'poster'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (shouldIntercept(val)) {
        fetchDirectly(val).then(b => {
          if (el.getAttribute(attr) === val) el.setAttribute(attr, b);
        });
      }
    });
  };

  const observer = new MutationObserver(ms => {
    ms.forEach(m => {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) {
            check(n);
            if (n.querySelectorAll) n.querySelectorAll('img, video, source').forEach(check);
          }
        });
      } else if (m.type === 'attributes') {
        check(m.target);
      }
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'poster']
  });

  // Original ax:fetch handler for API requests
  document.addEventListener('ax:fetch', (e) => {
    const { id, url } = e.detail;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      withCredentials: true,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-IG-App-ID': IG_APP_ID,
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
