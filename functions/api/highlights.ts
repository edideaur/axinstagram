import { tryFetchHighlights } from "../../src/services/instagram";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing" }, { status: 400 });

  const result = await tryFetchHighlights(id);
  return Response.json(result);
};
