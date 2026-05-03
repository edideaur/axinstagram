// ==UserScript==
// @name         ax-helper
// @namespace    https://axinstagram.com
// @version      1.3
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
      if (u.origin === location.origin && (u.pathname === '/api' || u.pathname.startsWith('/api/'))) return true;
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

  // --- API Port Logic ---

  const biggest = (cs) => cs.length ? cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b)).url : "";
  const smallest = (cs) => cs.length ? cs.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b)).url : "";

  function extractStoriesItems(items) {
    const photos = items.map((item) => {
      const imgCands = item.image_versions2?.candidates ?? [];
      if (item.video_versions) {
        const vids = item.video_versions;
        return {
          thumb: imgCands.length ? biggest(imgCands) : biggest(vids),
          full: biggest(vids),
          isVideo: true,
        };
      }
      return { thumb: smallest(imgCands), full: biggest(imgCands) };
    });
    return { photos, isPhoto: true };
  }

  function extractFromGQL(data) {
    const gqlData = data.gql_data || data;
    const media = gqlData?.shortcode_media || gqlData?.xdt_shortcode_media || (gqlData?.data?.shortcode_media) || (gqlData?.data?.xdt_shortcode_media);
    if (!media) return null;

    const sidecar = media.edge_sidecar_to_children;
    if (sidecar?.edges?.length) {
      const photos = sidecar.edges
        .filter((e) => e.node?.display_url || e.node?.video_url)
        .map((e) => {
          const node = e.node;
          const display = node.display_url;
          if (node.video_url) return { thumb: display, full: node.video_url, isVideo: true };
          return { thumb: display, full: display };
        });
      if (!photos.length) return null;
      return { photos, isPhoto: true };
    }

    if (media.video_url) return { videoUrl: media.video_url };
    if (media.display_url) {
      return { videoUrl: media.display_url, thumbUrl: media.display_url, isPhoto: true };
    }
    return null;
  }

  async function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url,
        headers: opts.headers || {},
        data: opts.body,
        withCredentials: true,
        onload: (res) => {
          resolve({
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            statusText: res.statusText,
            json: () => Promise.resolve(JSON.parse(res.responseText)),
            text: () => Promise.resolve(res.responseText),
            responseText: res.responseText
          });
        },
        onerror: (err) => reject(err)
      });
    });
  }

  async function resolveUserId(username) {
    try {
      const res = await gmFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      if (res.ok) {
        const json = await res.json();
        const id = json?.data?.user?.id || json?.data?.user?.pk;
        if (id) return String(id);
      }
      const res2 = await gmFetch(`https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(username)}&context=user`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      if (res2.ok) {
        const json = await res2.json();
        const match = json?.users?.find((u) => u.user?.username === username);
        if (match?.user?.pk) return String(match.user.pk);
      }
    } catch (e) {}
    return null;
  }

  async function handleLocalApi(u) {
    const path = u.pathname;
    const params = u.searchParams;

    if (path === '/api/userinfo') {
      const username = params.get('username');
      if (!username) return { error: 'missing' };
      const res = await gmFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      if (!res.ok) return { error: 'not found' };
      const json = await res.json();
      const user = json?.data?.user;
      if (!user) return { error: 'not found' };
      
      const hdVersions = user.hd_profile_pic_versions || [];
      const bestVersion = hdVersions.reduce((a, b) => !a || (b.width * b.height > a.width * a.height) ? b : a, null);

      return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        biography: user.biography,
        profilePicUrl: user.hd_profile_pic_url_info?.url || bestVersion?.url || user.profile_pic_url_hd || user.profile_pic_url,
        followerCount: user.edge_followed_by?.count ?? user.follower_count,
        followingCount: user.edge_follow?.count ?? user.following_count,
        postCount: user.edge_owner_to_timeline_media?.count ?? user.media_count,
        isPrivate: user.is_private,
        isVerified: user.is_verified,
      };
    }

    if (path === '/api/userid') {
      const username = params.get('username');
      const userId = await resolveUserId(username);
      return userId ? { userId } : { error: 'not found' };
    }

    if (path === '/api/stories') {
      const username = params.get('username');
      const userId = await resolveUserId(username);
      if (!userId) return { error: 'not found' };
      const res = await gmFetch(`https://www.instagram.com/graphql/query/?query_hash=de8017ee0a7c9c45ec4260733d81ea31&variables=${encodeURIComponent(JSON.stringify({reel_ids:[userId],highlight_reel_ids:[],precomposed_overlay:false}))}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      const json = await res.json();
      const items = json?.data?.reels_media?.[0]?.items;
      return items ? extractStoriesItems(items) : { error: 'fetch.empty' };
    }

    if (path === '/api/highlights') {
      const id = params.get('id');
      const res = await gmFetch(`https://www.instagram.com/graphql/query/?query_hash=de8017ee0a7c9c45ec4260733d81ea31&variables=${encodeURIComponent(JSON.stringify({reel_ids:[],highlight_reel_ids:[id],precomposed_overlay:false}))}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      const json = await res.json();
      const items = json?.data?.reels_media?.[0]?.items;
      return items ? extractStoriesItems(items) : { error: 'fetch.empty' };
    }

    if (path === '/api/profile') {
      const username = params.get('username');
      const vars = (cursor) => encodeURIComponent(JSON.stringify({
        data: { count: 12, include_relationship_info: true, latest_besties_reel_media: true, latest_reel_media: true, ...(cursor ? { after: cursor } : {}) },
        username,
        __relay_internal__pv__PolarisIsLoggedInrelayprovider: true,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
      }));
      const res = await gmFetch(`https://www.instagram.com/graphql/query/?doc_id=8759034877476257&variables=${vars()}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      const json = await res.json();
      const conn = json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
      if (!conn?.edges?.length) return { error: 'fetch.empty' };

      const extractPostItem = (item) => {
        const cands = item.image_versions2?.candidates ?? [];
        if (item.video_versions?.length) {
          const sorted = [...item.video_versions].sort((a, b) => b.width * b.height - a.width * a.height);
          const qualities = sorted.map((v) => ({ url: v.url, label: `${v.width}×${v.height}` }));
          return { thumb: cands.length ? biggest(cands) : sorted[0].url, full: sorted[0].url, qualities, isVideo: true };
        }
        const sortedC = [...cands].sort((a, b) => b.width * b.height - a.width * a.height);
        const qualities = sortedC.length > 1 ? sortedC.map((c) => ({ url: c.url, label: `${c.width}×${c.height}` })) : undefined;
        return { thumb: smallest(cands), full: sortedC[0]?.url || "", qualities };
      };

      const posts = conn.edges.map(e => {
        const node = e.node;
        const carousel = node.carousel_media;
        const items = (carousel?.length ? carousel : [node]).map(extractPostItem).filter(p => p.full || p.thumb);
        return {
          code: node.code || node.shortcode || "",
          caption: node.caption?.text || "",
          createdAt: node.taken_at || node.caption?.created_at || null,
          items,
        };
      }).filter(p => p.items.length);

      const userInfo = conn.edges[0]?.node?.user || {};
      const hdVersions = userInfo.hd_profile_pic_versions || [];
      const bestPic = hdVersions.reduce((a, b) => !a || (b.width * b.height > a.width * a.height) ? b : a, null)?.url || userInfo.profile_pic_url_hd || userInfo.profile_pic_url;

      return {
        type: "profile",
        profile: { username: userInfo.username || "", profilePicUrl: bestPic },
        posts,
      };
    }

    if (path === '/api') {
      const rawUrl = params.get('url');
      if (!rawUrl) return { error: 'missing' };
      const sourceURL = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      const parts = sourceURL.pathname.split("/").filter(Boolean);
      let postId = null;
      if ((parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels") && parts[1]) postId = parts[1];
      if (!postId) return { error: 'link.unsupported' };

      const vars = encodeURIComponent(JSON.stringify({ shortcode: postId, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }));
      const res = await gmFetch(`https://www.instagram.com/graphql/query/?doc_id=8845758582119845&variables=${vars}`, {
        headers: { 'x-ig-app-id': IG_APP_ID }
      });
      const json = await res.json();
      const result = extractFromGQL(json);
      if (result) {
        if (result.photos) {
          result.photos = result.photos.map(p => ({ ...p, thumb: '/dl?url=' + encodeURIComponent(p.thumb) }));
        } else if (result.isPhoto && result.videoUrl) {
           result.photos = [{ thumb: '/dl?url=' + encodeURIComponent(result.thumbUrl || result.videoUrl), full: result.videoUrl }];
           delete result.videoUrl;
        }
        return result;
      }
      return { error: 'fetch.empty' };
    }

    return { error: 'not implemented' };
  }

  // --- End API Port Logic ---

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
      const u = new URL(url, location.origin);
      if (u.origin === location.origin && (u.pathname === '/api' || u.pathname.startsWith('/api/'))) {
        const result = await handleLocalApi(u);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

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
  document.addEventListener('ax:fetch', async (e) => {
    const { id, url } = e.detail;
    const u = new URL(url, location.origin);
    if (u.origin === location.origin && (u.pathname === '/api' || u.pathname.startsWith('/api/'))) {
      const result = await handleLocalApi(u);
      document.dispatchEvent(new CustomEvent('ax:response', {
        detail: { id, data: JSON.stringify(result) },
      }));
      return;
    }
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
