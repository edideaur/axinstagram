export function isAllowedDlHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname;
    return host.endsWith("cdninstagram.com") || host.endsWith("fbcdn.net");
  } catch {
    return false;
  }
}

const THUMB_SIZE = "s320x320";
export function forceSmallInstagramUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.pathname = u.pathname.replace(/\/s\d+x\d+\//g, `/${THUMB_SIZE}/`);
    if (u.searchParams.has("stp")) {
      u.searchParams.set(
        "stp",
        u.searchParams.get("stp")!.replace(/s\d+x\d+/, THUMB_SIZE),
      );
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) return new Response("Missing url", { status: 400 });
  if (!isAllowedDlHost(target))
    return new Response("Forbidden", { status: 403 });

  const dlParam = url.searchParams.get("dl");
  const isDl = dlParam === "1";
  const isView = dlParam === "0" || url.searchParams.get("view") === "1";
  const useFullSize = isDl || isView;
  const smallTarget = useFullSize ? target : forceSmallInstagramUrl(target);
  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  const range = request.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  const upstream = await fetch(smallTarget, { headers: upstreamHeaders }).catch(
    () => null,
  );
  if (!upstream) return new Response("Upstream error", { status: 502 });

  const out = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cross-origin-resource-policy", "cross-origin");
  out.set("access-control-allow-origin", "*");
  if (isDl) {
    const ct = upstream.headers.get("content-type") ?? "";
    const ext = ct.startsWith("video")
      ? "mp4"
      : ct.includes("png")
        ? "png"
        : "jpg";
    out.set("content-disposition", `attachment; filename="media.${ext}"`);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
};
