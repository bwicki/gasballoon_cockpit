// Gasballoon Cockpit - shared store proxy
// Paste this whole file into the Cloudflare Worker's "Edit code" editor,
// replacing the default template, then Deploy.
//
// Set these three as SECRETS (Settings -> Variables and Secrets -> Add,
// type "Secret") - never paste them directly into this code:
//   GITHUB_TOKEN  - your existing classic PAT with the "gist" scope
//   GIST_ID       - your existing Gist ID
//   APP_SECRET    - a new password you make up, used only by this worker
//
// The app then calls this worker's own URL instead of api.github.com
// directly, sending APP_SECRET in a header - the real GitHub token never
// reaches the browser at all, so it can no longer be read from the page
// source or dev tools on any device.

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const providedSecret = request.headers.get('X-App-Secret');
    if (providedSecret !== env.APP_SECRET) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const githubHeaders = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      // GitHub's API rejects any request without a User-Agent header - curl
      // supplies its own by default (which is why a direct curl test could
      // succeed), but Cloudflare Workers' own fetch() does not add one
      // automatically, so it has to be set explicitly here.
      'User-Agent': 'gbcockpit-worker',
    };

    if (request.method === 'GET') {
      const r = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, { headers: githubHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return new Response('GitHub error: ' + r.status + ' - ' + detail, { status: 502, headers: corsHeaders });
      }
      const j = await r.json();
      const file = j.files && j.files['gbcockpit-store.json'];
      return new Response(file ? file.content : '{"users":{},"flightProfiles":{}}', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text(); // the full store JSON, sent as-is by the app
      const r = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
        method: 'PATCH',
        headers: { ...githubHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { 'gbcockpit-store.json': { content: body } } }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return new Response('GitHub error: ' + r.status + ' - ' + detail, { status: 502, headers: corsHeaders });
      }
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  },
};
