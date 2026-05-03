const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "x-ig-app-id": "936619743392459",
  Accept: "application/json",
};

export async function tryProfileInfo(username: string): Promise<string | null> {
  const res = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: HEADERS },
  ).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const id = (json?.data as Record<string, unknown> | undefined)?.user as
    | Record<string, unknown>
    | undefined;
  return ((id?.id ?? id?.pk) as string | null) ?? null;
}

export async function tryTopSearch(username: string): Promise<string | null> {
  const res = await fetch(
    `https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(username)}&context=user`,
    { headers: HEADERS },
  ).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const users = json?.users as
    | { user: { username: string; pk: string } }[]
    | undefined;
  const match = users?.find((u) => u.user?.username === username);
  return match?.user?.pk ?? null;
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const userId =
    (await tryProfileInfo(username)) ?? (await tryTopSearch(username));
  if (!userId) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({ userId: String(userId) });
};
