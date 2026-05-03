import { tryFetchProfile } from "../../src/services/instagram";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const result = await tryFetchProfile(username);
  return Response.json(result);
};
