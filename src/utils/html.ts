import type { MediaResult } from "../types";

interface EmbedOptions {
  result: MediaResult;
  sourceURL: string;
  workerUrl: string;
  minimal: boolean;
  imgIndex?: number;
}

// Discord reads theme-color for the embed accent strip
const THEME_COLOR = "#000000";

export function buildEmbedHTML({
  result,
  sourceURL,
  workerUrl,
  minimal,
  imgIndex,
}: EmbedOptions): string {
  const {
    videoUrl,
    thumbUrl,
    photos,
    isPhoto,
    title,
    description,
    author,
    width = 1280,
    height = 720,
  } = result;

  const base = [
    `<meta charset="utf-8">`,
    `<meta name="theme-color" content="${THEME_COLOR}">`,
    `<meta property="og:url" content="${esc(workerUrl)}">`,
    `<link rel="canonical" href="${esc(workerUrl)}">`,
  ];

  if (!minimal) {
    if (title) {
      base.push(`<meta property="og:title" content="${esc(title)}">`);
      base.push(`<meta name="twitter:title" content="${esc(title)}">`);
    }
    if (description) {
      base.push(
        `<meta property="og:description" content="${esc(description)}">`,
      );
      base.push(
        `<meta name="twitter:description" content="${esc(description)}">`,
      );
    }
    if (author) {
      base.push(`<meta property="og:site_name" content="${esc(author)}">`);
    }
  }

  // Photo embed
  if (isPhoto) {
    const idx = imgIndex !== undefined ? imgIndex - 1 : 0;
    const photoUrl = photos
      ? (photos[idx]?.full ?? photos[0]?.full)
      : videoUrl!;

    const tags = [
      ...base,
      `<meta property="og:type" content="website">`,
      `<meta property="og:image" content="${esc(photoUrl)}">`,
      `<meta property="og:image:secure_url" content="${esc(photoUrl)}">`,
      `<meta property="og:image:type" content="image/jpeg">`,
      `<meta property="og:image:width" content="${width}">`,
      `<meta property="og:image:height" content="${height}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${esc(photoUrl)}">`,
    ];

    return page(
      tags,
      `<img src="${esc(photoUrl)}" style="max-width:100%;display:block;margin:0 auto">`,
      sourceURL,
    );
  }

  // Video embed
  const vid = videoUrl!;
  const tags = [
    ...base,
    `<meta property="og:type" content="video.other">`,
    `<meta property="og:video" content="${esc(vid)}">`,
    `<meta property="og:video:secure_url" content="${esc(vid)}">`,
    `<meta property="og:video:type" content="video/mp4">`,
    `<meta property="og:video:width" content="${width}">`,
    `<meta property="og:video:height" content="${height}">`,
    // Twitter / X player card
    `<meta name="twitter:card" content="player">`,
    `<meta name="twitter:player" content="${esc(vid)}">`,
    `<meta name="twitter:player:stream" content="${esc(vid)}">`,
    `<meta name="twitter:player:stream:content_type" content="video/mp4">`,
    `<meta name="twitter:player:width" content="${width}">`,
    `<meta name="twitter:player:height" content="${height}">`,
  ];

  if (!minimal && thumbUrl) {
    tags.push(`<meta property="og:image" content="${esc(thumbUrl)}">`);
    tags.push(`<meta property="og:image:width" content="${width}">`);
    tags.push(`<meta property="og:image:height" content="${height}">`);
    tags.push(`<meta name="twitter:image" content="${esc(thumbUrl)}">`);
  }

  return page(
    tags,
    `<video src="${esc(vid)}" controls style="max-width:100%;max-height:100vh;display:block;margin:0 auto"></video>`,
    sourceURL,
  );
}

function page(tags: string[], body: string, sourceURL: string): string {
  return `<!DOCTYPE html>
<html>
<head>
${tags.join("\n")}
</head>
<body>
${body}
<p><a href="${esc(sourceURL)}">View original</a></p>
</body>
</html>`;
}

export function buildErrorHTML(error: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta property="og:title" content="Failed to load media">
<meta property="og:description" content="${esc(error)}">
<meta name="theme-color" content="#000000">
</head>
<body><p>Could not load: ${esc(error)}</p></body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
