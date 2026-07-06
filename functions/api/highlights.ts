import { tryFetchHighlights } from "../../src/services/instagram";
import type { Env } from "../../src/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing" }, { status: 400 });

  const result = await tryFetchHighlights(id, env.ACCOUNTS);
  return Response.json(result);
};
