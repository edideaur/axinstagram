const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "x-ig-app-id": "936619743392459",
  Accept: "application/json",
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const res = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: HEADERS },
  ).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const user = (json?.data as Record<string, unknown> | undefined)?.user as
    | Record<string, unknown>
    | undefined;
  if (!user) return Response.json({ error: "not found" }, { status: 404 });

  type PicEntry = { width?: number; height?: number; url?: string };
  const hdInfo = user.hd_profile_pic_url_info as PicEntry | undefined;
  const hdVersions =
    (user.hd_profile_pic_versions as PicEntry[] | undefined) ?? [];
  const bestVersion = hdVersions
    .filter((v) => v.url)
    .reduce<PicEntry | null>(
      (a, b) =>
        !a ||
        (b.width ?? 0) * (b.height ?? 0) > (a.width ?? 0) * (a.height ?? 0)
          ? b
          : a,
      null,
    );
  const profilePicUrl =
    hdInfo?.url ??
    bestVersion?.url ??
    user.profile_pic_url_hd ??
    user.profile_pic_url;

  return Response.json({
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    biography: user.biography,
    profilePicUrl,
    followerCount:
      (user.edge_followed_by as Record<string, unknown> | undefined)?.count ??
      user.follower_count,
    followingCount:
      (user.edge_follow as Record<string, unknown> | undefined)?.count ??
      user.following_count,
    postCount:
      (user.edge_owner_to_timeline_media as Record<string, unknown> | undefined)
        ?.count ?? user.media_count,
    isPrivate: user.is_private,
    isVerified: user.is_verified,
  });
};
