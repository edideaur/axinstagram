import { tryProfileInfo, tryTopSearch } from "./userid";
import { tryFetchStories } from "../../src/services/instagram";
import type { Env } from "../../src/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const userId =
    (await tryProfileInfo(username)) ?? (await tryTopSearch(username));
  if (!userId) return Response.json({ error: "not found" }, { status: 404 });

  const result = await tryFetchStories(userId, env.ACCOUNTS);
  return Response.json(result);
};
