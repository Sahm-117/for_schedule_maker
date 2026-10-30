// One shared password in front of the whole primer (HTTP Basic auth, checked on Cloudflare, never in the page).
// Set PRIMER_PASSWORD, and optionally PRIMER_USER (default "fof"), as encrypted variables in the Pages project:
// Settings -> Variables and Secrets. With no password set the site stays closed.
const encoder = new TextEncoder();

// Compares hashes so the check takes the same time however much of a guess is right.
async function same(a, b) {
  const [x, y] = await Promise.all([a, b].map((t) => crypto.subtle.digest('SHA-256', encoder.encode(t))));
  return crypto.subtle.timingSafeEqual(x, y);
}

export async function onRequest({ request, env, next }) {
  // The site folder is also the output folder, so keep this code itself from being served.
  if (new URL(request.url).pathname.startsWith('/functions/')) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const password = env.PRIMER_PASSWORD;
  if (!password) {
    return new Response('This page is not open yet.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const user = env.PRIMER_USER || 'fof';

  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    let given = '';
    try { given = atob(header.slice(6)); } catch { given = ''; }
    const split = given.indexOf(':');
    if (split >= 0) {
      const [userOk, passwordOk] = await Promise.all([same(given.slice(0, split), user), same(given.slice(split + 1), password)]);
      if (userOk && passwordOk) {
        const page = await next();
        const answer = new Response(page.body, page);
        answer.headers.set('Cache-Control', 'private, no-store');
        return answer;
      }
    }
  }

  return new Response('Sign in to see the FOF handover primer.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="FOF handover primer", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}
