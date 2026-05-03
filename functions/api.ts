import { isInstagram } from "../src/utils/url";
import { handleInstagram } from "../src/services/instagram";
import type { MediaResult } from "../src/types";

function proxyPhotoThumbs(result: MediaResult, origin: string): MediaResult {
  const dl = (u: string) => `${origin}/dl?url=${encodeURIComponent(u)}`;
  if (result.photos) {
    return {
      ...result,
      photos: result.photos.map((p) => ({ ...p, thumb: dl(p.thumb) })),
    };
  }
  if (result.isPhoto && result.videoUrl) {
    return {
      ...result,
      photos: [
        {
          thumb: dl(result.thumbUrl ?? result.videoUrl),
          full: result.videoUrl,
        },
      ],
      videoUrl: undefined,
    };
  }
  return result;
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const rawUrl = url.searchParams.get("url");

  if (!rawUrl)
    return Response.json({ error: "missing url param" }, { status: 400 });

  let sourceURL: URL;
  try {
    sourceURL = new URL(
      /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    );
  } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }

  if (!isInstagram(sourceURL))
    return Response.json({ error: "link.unsupported" }, { status: 400 });

  let result: MediaResult;
  try {
    result = await handleInstagram(sourceURL);
  } catch {
    result = { error: "fetch.fail" };
  }

  result = proxyPhotoThumbs(result, url.origin);

  return Response.json(result, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};
