import { isInstagram } from "../src/utils/url";
import { handleInstagram } from "../src/services/instagram";
import { buildEmbedHTML, buildErrorHTML } from "../src/utils/html";
import type { MediaResult } from "../src/types";

interface Env {
  ASSETS: Fetcher;
}

const INSTAGRAM_SHORTHAND = /^\/(p|reel|reels|stories)(\/[^/].*)?$/;

function parseSourceURL(pathname: string): URL | null {
  if (INSTAGRAM_SHORTHAND.test(pathname)) {
    return new URL(`https://www.instagram.com${pathname}`);
  }
  const raw = pathname.slice(1);
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function isBrowser(req: Request): boolean {
  const ua = (req.headers.get("User-Agent") ?? "").toLowerCase();
  if (
    /discordbot|twitterbot|telegrambot|slackbot|whatsapp|facebookexternalhit|linkedinbot|applebot|googlebot|bingbot|ia_archiver/.test(
      ua,
    )
  ) {
    return false;
  }
  const accept = req.headers.get("Accept") ?? "";
  return accept.includes("text/html") && accept.includes("*/*");
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const { pathname } = new URL(request.url);
  if (pathname === "/favicon.ico" || pathname === "/favicon.svg") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#101010"/><text x="16" y="21" text-anchor="middle" font-family="'Courier New',monospace" font-weight="700" font-size="15" fill="#e8e8e8">ax</text></svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return env.ASSETS.fetch(request);
  }

  if (isBrowser(request)) {
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url)));
  }

  const { searchParams } = new URL(request.url);

  const sourceURL = parseSourceURL(pathname);
  if (!sourceURL) return new Response("Invalid URL", { status: 400 });

  if (!isInstagram(sourceURL))
    return new Response("Unsupported service", { status: 400 });

  let result: MediaResult;
  try {
    result = await handleInstagram(sourceURL);
  } catch {
    result = { error: "fetch.fail" };
  }

  const igParts = sourceURL.pathname.split("/").filter(Boolean);
  const imgIndexParam =
    igParts[0] === "p" ? searchParams.get("img_index") : null;

  const htmlHeaders = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  };

  if (result.error || (!result.videoUrl && !result.photos?.length)) {
    return new Response(buildErrorHTML(result.error ?? "unknown"), {
      status: 200,
      headers: htmlHeaders,
    });
  }

  return new Response(
    buildEmbedHTML({
      result,
      sourceURL: sourceURL.toString(),
      workerUrl: request.url,
      minimal: true,
      imgIndex: imgIndexParam ? parseInt(imgIndexParam, 10) : undefined,
    }),
    { status: 200, headers: htmlHeaders },
  );
};
