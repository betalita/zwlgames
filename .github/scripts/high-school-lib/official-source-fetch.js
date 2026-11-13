'use strict';

function checkedUrl(value, host) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('official source requires HTTPS');
  if (url.hostname.toLowerCase() !== host.toLowerCase() || url.username || url.password ||
      (url.port && url.port !== '443')) throw new Error('official source host mismatch');
  return url;
}

async function fetchOfficialSource(value, allowedHost, { fetchImpl = fetch, timeoutMs = 10000,
  maxBytes = 2 * 1024 * 1024 } = {}) {
  let url = checkedUrl(value, allowedHost);
  const controller = new AbortController();
  const started = Date.now();
  let phase = 'fetch';
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(url.href, { redirect: 'manual', signal: controller.signal,
        headers: { 'user-agent': 'cnhoops-official-results/1.0' } });
      if (response.status >= 300 && response.status < 400) {
        if (redirects === 3) throw new Error('too many official source redirects');
        const location = response.headers.get('location');
        if (!location) throw new Error('official source redirect missing location');
        url = checkedUrl(new URL(location, url).href, allowedHost);
        continue;
      }
      if (!response.ok) throw new Error(`official source HTTP ${response.status}`);
      phase = 'body';
      const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!['text/html', 'text/plain', 'application/pdf', 'text/calendar'].includes(contentType))
        throw new Error(`unsupported official source content type: ${contentType}`);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error('official source size limit exceeded');
      let size = 0;
      const parts = [];
      for await (const part of response.body) {
        size += part.byteLength;
        if (size > maxBytes) {
          controller.abort();
          throw new Error('official source size limit exceeded');
        }
        parts.push(Buffer.from(part));
      }
      return { url: url.href, contentType, body: Buffer.concat(parts) };
    }
    throw new Error('too many official source redirects');
  } catch (error) {
    if (timedOut) throw new Error(`official source timeout after ${Date.now() - started}ms during ${phase} at ${url.origin}${url.pathname}`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchOfficialSource };
