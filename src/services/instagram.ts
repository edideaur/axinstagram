import type { MediaResult, Photo, ProfilePost } from "../types";
import { randomBase64url } from "../utils/url";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)";

function getRandomCookie(accounts?: string): string | undefined {
  if (!accounts) return undefined;
  const lines = accounts
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;
  return lines[Math.floor(Math.random() * lines.length)];
}

const EMBED_HEADERS = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Dest": "document",
};

function getNumber(name: string, html: string): number | undefined {
  const s = html.match(new RegExp(name + "=(\\d+)"))?.[1];
  return s ? +s : undefined;
}

function getJsonEntry(
  name: string,
  html: string,
): Record<string, unknown> | undefined {
  const raw = html.match(
    new RegExp('\\["' + name + '",.*?,({.*?}),\\d+\\]'),
  )?.[1];
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function tryMobileApi(
  postId: string,
  cookie?: string,
): Promise<Record<string, unknown> | null> {
  const oembedUrl = new URL("https://i.instagram.com/api/v1/oembed/");
  oembedUrl.searchParams.set("url", `https://www.instagram.com/p/${postId}/`);

  const oembed = await fetch(oembedUrl.toString(), {
    headers: { "User-Agent": MOBILE_UA, "x-ig-app-id": "936619743392459" },
  })
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .catch(() => null);

  const mediaId = oembed?.media_id as string | undefined;
  if (!mediaId) return null;

  const headers: Record<string, string> = {
    "User-Agent": MOBILE_UA,
    "x-ig-app-id": "936619743392459",
  };
  if (cookie) headers.cookie = cookie;

  return fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
    headers,
  })
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .then(
      (d) => ((d.items as unknown[])?.[0] as Record<string, unknown>) ?? null,
    )
    .catch(() => null);
}

async function tryHtmlEmbed(
  postId: string,
): Promise<Record<string, unknown> | null> {
  for (const suffix of ["/embed/captioned/", "/embed/"]) {
    const html = await fetch(`https://www.instagram.com/p/${postId}${suffix}`, {
      headers: EMBED_HEADERS,
    })
      .then((r) => r.text())
      .catch(() => null);

    if (!html) continue;

    try {
      const raw = html.match(/"init",\[\],\[(.*?)\]\],/s)?.[1];
      if (raw) {
        const embedData = JSON.parse(raw) as { contextJSON?: string };
        if (embedData?.contextJSON) {
          const ctx = JSON.parse(embedData.contextJSON);
          if (ctx) return ctx;
        }
      }
    } catch {}

    try {
      const ctxRaw = html.match(
        /"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/s,
      )?.[1];
      if (ctxRaw) {
        const unescaped = ctxRaw
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
          .replace(/\\n/g, "")
          .replace(/\\r/g, "");
        const ctx = JSON.parse(unescaped);
        if (ctx) return ctx;
      }
    } catch {}

    try {
      const idx = html.indexOf('"gql_data":');
      if (idx !== -1) {
        let depth = 0,
          start = -1;
        for (let i = idx; i >= 0; i--) {
          if (html[i] === "}") depth++;
          else if (html[i] === "{") {
            if (depth === 0) {
              start = i;
              break;
            }
            depth--;
          }
        }
        if (start !== -1) {
          const obj = JSON.parse(
            html.slice(start, html.indexOf("\n", idx + 1000)),
          );
          if (obj?.gql_data) return obj;
        }
      }
    } catch {}
  }

  return null;
}

async function tryGQL(
  postId: string,
  cookie?: string,
): Promise<Record<string, unknown> | null> {
  const pageRes = await fetch(`https://www.instagram.com/p/${postId}/`, {
    headers: EMBED_HEADERS,
  }).catch(() => null);
  if (!pageRes) return null;

  const html = await pageRes.text().catch(() => "");

  const lsd =
    (getJsonEntry("LSD", html) as { token?: string } | undefined)?.token ??
    randomBase64url(8);
  const csrf =
    (
      getJsonEntry("InstagramSecurityConfig", html) as
        | { csrf_token?: string }
        | undefined
    )?.csrf_token ?? "";
  const webConfig = getJsonEntry("DGWWebConfig", html) as
    | { appId?: string }
    | undefined;
  const siteData = getJsonEntry("SiteData", html) as
    | Record<string, unknown>
    | undefined;
  const bloksId = (
    getJsonEntry("WebBloksVersioningID", html) as
      | { versioningID?: string }
      | undefined
  )?.versioningID;
  const polaris = getJsonEntry("PolarisSiteData", html) as
    | { device_id?: string; machine_id?: string }
    | undefined;

  const anonCookie = [
    csrf && `csrftoken=${csrf}`,
    polaris?.device_id && `ig_did=${polaris.device_id}`,
    "wd=1280x720",
    "dpr=2",
    polaris?.machine_id && `mid=${polaris.machine_id}`,
    "ig_nrcb=1",
  ]
    .filter(Boolean)
    .join("; ");

  const body = new URLSearchParams({
    __d: "www",
    __a: "1",
    __req: "b",
    __ccg: "EXCELLENT",
    __user: "0",
    dpr: "2",
    lsd,
    av: "0",
    __comet_req: String(getNumber("__comet_req", html) ?? "7"),
    jazoest: String(
      getNumber("jazoest", html) ?? Math.floor(Math.random() * 10000),
    ),
    __spin_r: String(siteData?.__spin_r ?? "1019933358"),
    __spin_b: String(siteData?.__spin_b ?? "trunk"),
    __spin_t: String(siteData?.__spin_t ?? Math.floor(Date.now() / 1000)),
    __hsi: String(siteData?.hsi ?? "7436540909012459023"),
    __hs: String(
      siteData?.haste_session ?? "20126.HYP:instagram_web_pkg.2.1...0",
    ),
    __rev: String(
      (
        getJsonEntry("InstagramWebPushInfo", html) as
          | { rollout_hash?: string }
          | undefined
      )?.rollout_hash ?? "1019933358",
    ),
    __dyn: randomBase64url(154),
    __csr: randomBase64url(154),
    __s: "::" + randomBase64url(6),
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostActionLoadPostQueryQuery",
    variables: JSON.stringify({
      shortcode: postId,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    server_timestamps: "true",
    doc_id: "8845758582119845",
  });

  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      ...EMBED_HEADERS,
      "x-ig-app-id": webConfig?.appId ?? "936619743392459",
      "X-FB-LSD": lsd,
      "X-CSRFToken": csrf,
      ...(bloksId ? { "X-Bloks-Version-Id": bloksId } : {}),
      "x-asbd-id": "129477",
      cookie: cookie ?? anonCookie,
      "content-type": "application/x-www-form-urlencoded",
      "X-FB-Friendly-Name": "PolarisPostActionLoadPostQueryQuery",
    },
    body: body.toString(),
  }).catch(() => null);

  if (!res) return null;
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!json) return null;
  return { gql_data: json.data };
}

export type Candidate = { width: number; height: number; url: string };
export const biggest = (cs: Candidate[]) =>
  cs.length
    ? cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
        .url
    : "";
export const smallest = (cs: Candidate[]) =>
  cs.length
    ? cs.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b))
        .url
    : "";

function extractFromMobileData(
  data: Record<string, unknown>,
  _postId: string,
): MediaResult | null {
  const carousel = data.carousel_media as Record<string, unknown>[] | undefined;
  if (carousel) {
    const items = carousel.filter((e) => e.image_versions2);
    if (!items.length) return null;

    const photos: Photo[] = items.map((e) => {
      const imgCands = (e.image_versions2 as { candidates: Candidate[] })
        .candidates;
      const thumb = smallest(imgCands);
      if (e.video_versions) {
        return {
          thumb,
          full: biggest(e.video_versions as Candidate[]),
          isVideo: true,
        };
      }
      return { thumb, full: biggest(imgCands) };
    });

    return { photos, isPhoto: true };
  }

  if (data.video_versions) {
    const vids = data.video_versions as Candidate[];
    const best = vids.reduce((a, b) =>
      a.width * a.height >= b.width * b.height ? a : b,
    );
    return { videoUrl: best.url, width: best.width, height: best.height };
  }

  const imgVersions = data.image_versions2 as
    | { candidates: Candidate[] }
    | undefined;
  if (imgVersions?.candidates) {
    return {
      videoUrl: biggest(imgVersions.candidates),
      thumbUrl: smallest(imgVersions.candidates),
      isPhoto: true,
    };
  }

  return null;
}

export function extractFromGQL(
  data: Record<string, unknown>,
  _postId: string,
): MediaResult | null {
  const gqlData = data.gql_data as Record<string, unknown> | undefined;
  const media = (gqlData?.shortcode_media ?? gqlData?.xdt_shortcode_media) as
    | Record<string, unknown>
    | undefined;
  if (!media) return null;

  const sidecar = media.edge_sidecar_to_children as
    | { edges: { node: Record<string, unknown> }[] }
    | undefined;
  if (sidecar?.edges?.length) {
    const photos: Photo[] = sidecar.edges
      .filter((e) => e.node?.display_url ?? e.node?.video_url)
      .map((e) => {
        const node = e.node;
        const display = node.display_url as string;
        if (node.video_url)
          return {
            thumb: display,
            full: node.video_url as string,
            isVideo: true,
          };
        return { thumb: display, full: display };
      });
    if (!photos.length) return null;
    return { photos, isPhoto: true };
  }

  if (media.video_url) return { videoUrl: media.video_url as string };
  if (media.display_url) {
    const d = media.display_url as string;
    return { videoUrl: d, thumbUrl: d, isPhoto: true };
  }

  return null;
}

export function extractStoriesItems(
  items: Record<string, unknown>[],
): MediaResult {
  const photos: Photo[] = items.map((item) => {
    const imgCands =
      (item.image_versions2 as { candidates: Candidate[] } | undefined)
        ?.candidates ?? [];
    if (item.video_versions) {
      const vids = item.video_versions as Candidate[];
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

function extractFromHtmlEmbed(
  data: Record<string, unknown>,
  postId: string,
): MediaResult | null {
  return extractFromGQL(data, postId) ?? extractFromMobileData(data, postId);
}

export async function handleInstagram(
  url: URL,
  accounts?: string,
): Promise<MediaResult> {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "share") {
    const shareId = parts[1];
    if (!shareId) return { error: "fetch.empty" };
    const res = await fetch(`https://www.instagram.com/share/${shareId}/`, {
      headers: { "User-Agent": "curl/7.88.1" },
      redirect: "follow",
    }).catch(() => null);
    if (!res) return { error: "fetch.short_link" };
    return handleInstagram(new URL(res.url), accounts);
  }

  let postId: string | null = null;
  if (
    (parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels") &&
    parts[1]
  ) {
    postId = parts[1];
  }

  if (!postId) return { error: "link.unsupported" };

  const mobileData = await tryMobileApi(postId);
  if (mobileData) {
    const result = extractFromMobileData(mobileData, postId);
    if (result?.videoUrl || result?.photos?.length) return result;
  }

  const htmlData = await tryHtmlEmbed(postId);
  if (htmlData) {
    const result = extractFromHtmlEmbed(htmlData, postId);
    if (result?.videoUrl || result?.photos?.length) return result;
  }

  const gqlData = await tryGQL(postId);
  if (gqlData) {
    const result = extractFromGQL(gqlData, postId);
    if (result?.videoUrl || result?.photos?.length) return result;
  }

  const cookie = getRandomCookie(accounts);
  if (cookie) {
    const retryMobile = await tryMobileApi(postId, cookie);
    if (retryMobile) {
      const result = extractFromMobileData(retryMobile, postId);
      if (result?.videoUrl || result?.photos?.length) return result;
    }

    const retryData = await tryGQL(postId, cookie);
    if (retryData) {
      const result = extractFromGQL(retryData, postId);
      if (result?.videoUrl || result?.photos?.length) return result;
    }
  }

  return { error: "fetch.empty" };
}

const STORIES_HASH = "de8017ee0a7c9c45ec4260733d81ea31";
const GQL_HEADERS = { ...EMBED_HEADERS, Accept: "application/json" };

const MOBILE_STORY_HEADERS = {
  "User-Agent": MOBILE_UA,
  "x-ig-app-id": "936619743392459",
};

export function reelItems(
  json: Record<string, unknown> | null,
): Record<string, unknown>[] | undefined {
  const media =
    (json?.data as Record<string, unknown> | undefined)?.reels_media ??
    (json as Record<string, unknown> | null)?.reels_media;
  return (
    (media as Record<string, unknown>[] | undefined)?.[0] as
      | Record<string, unknown>
      | undefined
  )?.items as Record<string, unknown>[] | undefined;
}

export async function tryFetchStories(
  userId: string,
  accounts?: string,
): Promise<MediaResult> {
  const vars = encodeURIComponent(
    `{"reel_ids":[${userId}],"highlight_reel_ids":[],"precomposed_overlay":false}`,
  );

  const gql = await fetch(
    `https://www.instagram.com/graphql/query/?query_hash=${STORIES_HASH}&variables=${vars}`,
    { headers: GQL_HEADERS },
  )
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .catch(() => null);
  const items = reelItems(gql);
  if (items?.length) return extractStoriesItems(items);

  const mobile = await fetch(
    `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`,
    { headers: MOBILE_STORY_HEADERS },
  )
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .catch(() => null);
  const mobileItems = reelItems(mobile);
  if (mobileItems?.length) return extractStoriesItems(mobileItems);

  const cookie = getRandomCookie(accounts);
  if (cookie) {
    const retryGql = await fetch(
      `https://www.instagram.com/graphql/query/?query_hash=${STORIES_HASH}&variables=${vars}`,
      { headers: { ...GQL_HEADERS, cookie } },
    )
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .catch(() => null);
    const retryItems = reelItems(retryGql);
    if (retryItems?.length) return extractStoriesItems(retryItems);
  }

  return { error: "fetch.empty" };
}

export async function tryFetchHighlights(
  highlightId: string,
  accounts?: string,
): Promise<MediaResult> {
  const vars = encodeURIComponent(
    `{"reel_ids":[],"highlight_reel_ids":[${highlightId}],"precomposed_overlay":false}`,
  );

  const gql = await fetch(
    `https://www.instagram.com/graphql/query/?query_hash=${STORIES_HASH}&variables=${vars}`,
    { headers: GQL_HEADERS },
  )
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .catch(() => null);
  const items = reelItems(gql);
  if (items?.length) return extractStoriesItems(items);

  const mobile = await fetch(
    `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight:${highlightId}`,
    { headers: MOBILE_STORY_HEADERS },
  )
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .catch(() => null);
  const mobileItems = reelItems(mobile);
  if (mobileItems?.length) return extractStoriesItems(mobileItems);

  const cookie = getRandomCookie(accounts);
  if (cookie) {
    const retryGql = await fetch(
      `https://www.instagram.com/graphql/query/?query_hash=${STORIES_HASH}&variables=${vars}`,
      { headers: { ...GQL_HEADERS, cookie } },
    )
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .catch(() => null);
    const retryItems = reelItems(retryGql);
    if (retryItems?.length) return extractStoriesItems(retryItems);
  }

  return { error: "fetch.empty" };
}

function bestProfilePicUrl(user: Record<string, unknown>): string {
  type PicEntry = { width?: number; height?: number; url?: string };
  const hdInfo = user.hd_profile_pic_url_info as PicEntry | undefined;
  if (hdInfo?.url) return hdInfo.url;
  const versions =
    (user.hd_profile_pic_versions as PicEntry[] | undefined) ?? [];
  const best = versions
    .filter((v) => v.url)
    .reduce<PicEntry | null>(
      (a, b) =>
        !a ||
        (b.width ?? 0) * (b.height ?? 0) > (a.width ?? 0) * (a.height ?? 0)
          ? b
          : a,
      null,
    );
  if (best?.url) return best.url;
  return (user.profile_pic_url_hd ?? user.profile_pic_url ?? "") as string;
}

export async function tryFetchProfile(
  username: string,
  accounts?: string,
): Promise<MediaResult> {
  const allEdges: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let userInfo: Record<string, unknown> = {};
  let capped = false;
  const deadline = Date.now() + 25_000;

  const cookie = getRandomCookie(accounts);

  for (let page = 0; page < 100; page++) {
    if (Date.now() > deadline) {
      capped = true;
      break;
    }
    const vars = encodeURIComponent(
      JSON.stringify({
        data: {
          count: 12,
          include_relationship_info: true,
          latest_besties_reel_media: true,
          latest_reel_media: true,
          ...(cursor ? { after: cursor } : {}),
        },
        username,
        __relay_internal__pv__PolarisIsLoggedInrelayprovider: true,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
      }),
    );
    const json = await fetch(
      `https://www.instagram.com/graphql/query/?doc_id=8759034877476257&variables=${vars}`,
      { headers: cookie ? { ...GQL_HEADERS, cookie } : GQL_HEADERS },
    )
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .catch(() => null);

    const conn = (json?.data as Record<string, unknown> | undefined)
      ?.xdt_api__v1__feed__user_timeline_graphql_connection as
      | Record<string, unknown>
      | undefined;
    if (!conn) {
      if (page === 0) return { error: "fetch.empty" };
      break;
    }

    const edges = conn.edges as Record<string, unknown>[] | undefined;
    if (!edges?.length) break;

    if (page === 0) {
      const firstNode = (edges[0] as { node: Record<string, unknown> }).node;
      userInfo = (firstNode?.user as Record<string, unknown>) ?? {};
    }
    allEdges.push(...edges);

    const pageInfo = conn.page_info as
      | { has_next_page?: boolean; end_cursor?: string }
      | undefined;
    if (!pageInfo?.has_next_page || !pageInfo.end_cursor) break;
    cursor = pageInfo.end_cursor;
  }

  if (!allEdges.length) return { error: "fetch.empty" };

  const extractItem = (item: Record<string, unknown>): Photo => {
    const cands =
      (item.image_versions2 as { candidates: Candidate[] } | undefined)
        ?.candidates ?? [];
    if (item.video_versions) {
      const vids = item.video_versions as Candidate[];
      const sorted = [...vids].sort(
        (a, b) => b.width * b.height - a.width * a.height,
      );
      const qualities =
        sorted.length > 1
          ? sorted.map((v) => ({ url: v.url, label: `${v.width}×${v.height}` }))
          : undefined;
      return {
        thumb: cands.length ? biggest(cands) : sorted[0].url,
        full: sorted[0].url,
        qualities,
        isVideo: true,
      };
    }
    const sortedC = [...cands].sort(
      (a, b) => b.width * b.height - a.width * a.height,
    );
    const qualities =
      sortedC.length > 1
        ? sortedC.map((c) => ({ url: c.url, label: `${c.width}×${c.height}` }))
        : undefined;
    return {
      thumb: cands.length ? smallest(cands) : "",
      full: sortedC[0]?.url ?? "",
      qualities,
    };
  };

  const posts: ProfilePost[] = allEdges
    .map((e) => {
      const node = (e as { node: Record<string, unknown> }).node;
      const carousel = node.carousel_media as
        | Record<string, unknown>[]
        | undefined;
      const items = (carousel?.length ? carousel : [node])
        .map(extractItem)
        .filter((p) => p.full || p.thumb);
      return {
        code: (node.code ?? node.shortcode ?? "") as string,
        caption: ((node.caption as Record<string, unknown> | undefined)?.text ??
          "") as string,
        createdAt: (node.taken_at ??
          (node.caption as Record<string, unknown> | undefined)?.created_at ??
          null) as number | null,
        items,
      };
    })
    .filter((p) => p.items.length);

  if (!posts.length) return { error: "fetch.empty" };
  return {
    type: "profile",
    profile: {
      username: (userInfo.username ?? "") as string,
      profilePicUrl: bestProfilePicUrl(userInfo),
    },
    posts,
    ...(capped ? { capped: true } : {}),
  };
}
