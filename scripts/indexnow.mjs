// Meldet neue/geänderte Seiten per IndexNow an Bing, Yandex, Seznam, Naver …
// Läuft im Workflow erst NACH dem Veröffentlichen, damit die Seiten schon erreichbar sind.
import fs from 'node:fs';
const KEY = 'c688bc4ac501d6b8a3510cda87c3f894', SITE = 'https://dartsaktuell.com';
const file = process.argv[2] || 'indexnow-urls.json';
if (!fs.existsSync(file)) { console.log('IndexNow: keine Liste – nichts zu melden'); process.exit(0); }
const urls = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!urls.length) { console.log('IndexNow: nichts Neues'); process.exit(0); }
// Stichprobe: ist die erste neue Seite schon live? (GitHub Pages braucht manchmal ein paar Sekunden)
for (let i = 0; i < 6; i++) {
  try { const r = await fetch(urls[0], { method: 'HEAD', headers: { 'Cache-Control': 'no-cache' } }); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 10000));
}
for (let i = 0; i < urls.length; i += 10000) {
  const part = urls.slice(i, i + 10000);
  for (const ep of ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow']) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: 'dartsaktuell.com', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: part }) });
      console.log(`IndexNow ${new URL(ep).host}: ${part.length} URLs → HTTP ${r.status}${r.ok ? '' : ' ' + (await r.text()).slice(0, 200)}`);
    } catch (e) { console.warn(`IndexNow ${ep} fehlgeschlagen:`, e.message); }
  }
}
