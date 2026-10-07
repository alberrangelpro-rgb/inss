// Gera dist/estudo-em-voz.html: uma página única (CSS e JS embutidos),
// sem <html>/<head>/<body>, pronta para publicar como Artifact no claude.ai.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

let html = ler('index.html');
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/gi, '')
  .replace(/<meta name="(apple-mobile-web-app-[\w-]+|mobile-web-app-capable)"[^>]*>\s*/gi, '')
  .replace(/<!-- iPad[^>]*-->\s*/g, '')
  .replace(/<link rel="stylesheet" href="css\/style\.css">/, () => `<style>\n${ler('css/style.css')}</style>`)
  .replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (m, f) => `<script>\n${ler(f).replace(/<\/script/gi, '<\\/script')}</script>`);

fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
const saida = path.join(raiz, 'dist', 'estudo-em-voz.html');
fs.writeFileSync(saida, html);
console.log(`${saida} (${(html.length / 1024).toFixed(0)} KB)`);
