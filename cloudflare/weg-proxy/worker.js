const ORIGIN = 'https://weg-u7n51ugfjz3.qoder.zone';
const IMMUTABLE_ASSET = /^\/assets\//;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Assign path on a fixed origin; resolving a `//host` path would escape to another site.
    const target = new URL(ORIGIN);
    target.pathname = url.pathname;
    target.search = url.search;

    const headers = new Headers(request.headers);
    for (const name of [
      'host',
      'cookie',
      'authorization',
      'accept-encoding',
      'cf-connecting-ip',
      'cf-ipcountry',
      'cf-ray',
    ]) {
      headers.delete(name);
    }

    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const isAsset = IMMUTABLE_ASSET.test(url.pathname);
    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
      cf: {
        cacheEverything: isRead,
        cacheTtl: isAsset ? 31536000 : 60,
      },
    };
    if (!isRead) init.body = request.body;

    let upstream;
    try {
      upstream = await fetch(target.toString(), init);
    } catch {
      return new Response('上游暂时不可用，请稍后再试。', {
        status: 502,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const name of [
      'content-encoding',
      'content-length',
      'transfer-encoding',
      'connection',
      'set-cookie',
    ]) {
      responseHeaders.delete(name);
    }

    responseHeaders.set(
      'cache-control',
      isRead ? (isAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=60') : 'no-store',
    );
    responseHeaders.set('x-weg-proxy', '1');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
