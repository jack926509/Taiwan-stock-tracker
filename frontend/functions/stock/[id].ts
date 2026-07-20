export async function onRequest({ request, env }: { request: Request; env: { ASSETS: { fetch(input: Request): Promise<Response> } } }) {
  const url = new URL(request.url);
  url.pathname = "/stock/";
  return env.ASSETS.fetch(new Request(url, request));
}
