export function isInstagram(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return (
    h === "instagram.com" ||
    h === "www.instagram.com" ||
    h.endsWith(".instagram.com")
  );
}

export function randomBase64url(byteCount: number): string {
  const arr = new Uint8Array(byteCount);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
