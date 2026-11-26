/**
 * Static file server for the Dreamweaver web client.
 * No build step — just serves apps/web/public as-is.
 */

const PORT = parseInt(process.env.PORT || '8080');
const PUBLIC_DIR = `${import.meta.dir}/public`;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(`${PUBLIC_DIR}${path}`);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Dreamweaver web client on port ${PORT}`);
