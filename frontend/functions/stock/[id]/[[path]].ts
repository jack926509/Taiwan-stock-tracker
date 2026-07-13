type AssetsBinding = {
  fetch(input: Request): Promise<Response>;
};

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: { ASSETS: AssetsBinding };
}) {
  const url = new URL(request.url);
  url.pathname = url.pathname.endsWith("/index.txt") ? "/stock/index.txt" : "/stock/";
  return env.ASSETS.fetch(new Request(url, request));
}
