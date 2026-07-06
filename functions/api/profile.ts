import { tryFetchProfile } from "../../src/services/instagram";
import type { Env } from "../../src/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing" }, { status: 400 });

  const result = await tryFetchProfile(username, env.ACCOUNTS);
  return Response.json(result);
};
