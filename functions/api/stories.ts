import { tryProfileInfo, tryTopSearch } from "./userid";
import { tryFetchStories } from "../../src/services/instagram";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const userId =
    (await tryProfileInfo(username)) ?? (await tryTopSearch(username));
  if (!userId) return Response.json({ error: "not found" }, { status: 404 });

  const result = await tryFetchStories(userId);
  return Response.json(result);
};
