const OBJECT_KEY = "freellmapi/freeapi.db.backup";

function unauthorized() {
  return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/backup") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.BACKUP_TOKEN) {
      return new Response("Backup worker is not configured", { status: 503 });
    }

    const supplied = request.headers.get("Authorization") || "";
    if (supplied !== `Bearer ${env.BACKUP_TOKEN}`) {
      return unauthorized();
    }

    if (request.method === "GET") {
      const object = await env.DB_BACKUPS.get(OBJECT_KEY);
      if (!object) {
        return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      return new Response(object.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(object.size),
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (request.method === "PUT") {
      if (!request.body) {
        return new Response("Empty backup body", { status: 400 });
      }

      await env.DB_BACKUPS.put(OBJECT_KEY, request.body, {
        httpMetadata: { contentType: "application/octet-stream" },
      });

      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, PUT", "Cache-Control": "no-store" },
    });
  },
};
