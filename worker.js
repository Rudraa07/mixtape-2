export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- ccMixter proxy ----
    if (url.pathname === '/api/ccmixter') {
      const q = url.searchParams.get('q') || '';
      try {
        const upstream = `https://ccmixter.org/api/query?f=json&dataview=upload_page&s=${encodeURIComponent(q)}&search_type=any&limit=24`;
        const res = await fetch(upstream, { headers: { 'User-Agent': 'MixtapeApp/1.0 (personal use)' } });
        const text = await res.text();
        return new Response(text, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'ccMixter lookup failed' }), {
          status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ---- Internet Archive proxy (two-step: search, then resolve a playable file per result) ----
    if (url.pathname === '/api/archive') {
      const q = url.searchParams.get('q') || '';
      try {
        const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+AND+mediatype:(audio)&fl[]=identifier&fl[]=title&fl[]=creator&rows=12&page=1&output=json`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const docs = (searchData.response && searchData.response.docs) || [];

        const results = [];
        for (const doc of docs) {
          try {
            const metaRes = await fetch(`https://archive.org/metadata/${doc.identifier}`);
            const meta = await metaRes.json();
            const files = meta.files || [];
            const audioFile = files.find(f => /\.(mp3|ogg)$/i.test(f.name || ''));
            if (audioFile) {
              results.push({
                id: doc.identifier,
                name: doc.title || doc.identifier,
                artist: doc.creator || 'Unknown artist',
                audioUrl: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(audioFile.name)}`,
                artUrl: `https://archive.org/services/img/${doc.identifier}`
              });
            }
          } catch (innerErr) { /* skip this one item, keep going */ }
        }
        return new Response(JSON.stringify({ results }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Archive.org lookup failed' }), {
          status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ---- Freesound proxy (keeps the API token server-side, never exposed to the browser) ----
    if (url.pathname === '/api/freesound') {
      const q = url.searchParams.get('q') || '';
      const token = env.FREESOUND_API_KEY;
      if (!token) {
        return new Response(JSON.stringify({ error: 'Freesound API key not configured yet' }), {
          status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      try {
        const upstream = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&token=${token}&fields=id,name,username,previews,images`;
        const res = await fetch(upstream);
        const text = await res.text();
        return new Response(text, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Freesound lookup failed' }), {
          status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ---- Everything else: serve the static site files as normal ----
    return env.ASSETS.fetch(request);
  }
};
