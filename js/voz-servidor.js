/*
 * Voz premium: fala com um servidor de síntese próprio (ex.: Piper) que
 * devolve o áudio de cada frase. Guarda em cache o que já foi gerado, para
 * não pedir duas vezes a mesma frase (reler, voltar, mesmo trecho de lei).
 */
(function (root) {
  'use strict';

  const cache = new Map();     // chave -> URL de blob
  const ordem = [];            // ordem de inserção, para descartar os mais antigos
  const emVoo = new Map();     // chave -> Promise em andamento
  const LIMITE = 150;

  const normUrl = (u) => (u || '').trim().replace(/\/+$/, '');

  function erroRede(msg) { const e = new Error(msg || 'rede'); e.rede = true; return e; }
  function erroHttp(status, msg) { const e = new Error(msg || ('HTTP ' + status)); e.status = status; return e; }

  function cabecalhos(p, extra) {
    const h = Object.assign({}, extra || {});
    if (p.token) h.Authorization = 'Bearer ' + p.token;
    return h;
  }

  async function sintetizar(texto, p) {
    const base = normUrl(p.url);
    if (!base) throw erroRede('sem endereço do servidor');
    const chave = base + '|' + (p.voz || '') + '|' + texto;
    if (cache.has(chave)) return cache.get(chave);
    if (emVoo.has(chave)) return emVoo.get(chave);

    const prom = (async () => {
      let r;
      try {
        r = await fetch(base + '/tts', {
          method: 'POST',
          headers: cabecalhos(p, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ texto, voz: p.voz || undefined }),
        });
      } catch (e) { throw erroRede(e && e.message); }
      if (!r.ok) throw erroHttp(r.status);
      const blob = await r.blob();
      if (!blob || !blob.size) throw erroRede('áudio vazio');
      const url = URL.createObjectURL(blob);
      cache.set(chave, url);
      ordem.push(chave);
      while (ordem.length > LIMITE) {
        const velha = ordem.shift();
        const u = cache.get(velha);
        cache.delete(velha);
        if (u) URL.revokeObjectURL(u);
      }
      return url;
    })();

    emVoo.set(chave, prom);
    try { return await prom; } finally { emVoo.delete(chave); }
  }

  async function saude(p) {
    const base = normUrl(p.url);
    if (!base) throw erroRede('sem endereço do servidor');
    let r;
    try { r = await fetch(base + '/saude', { headers: cabecalhos(p) }); }
    catch (e) { throw erroRede(e && e.message); }
    if (!r.ok) throw erroHttp(r.status);
    return r.json();
  }

  async function vozes(p) {
    const d = await saude(p);
    return Array.isArray(d && d.vozes) ? d.vozes : [];
  }

  function limpar() {
    for (const u of cache.values()) URL.revokeObjectURL(u);
    cache.clear();
    ordem.length = 0;
  }

  root.VozServidor = { sintetizar, saude, vozes, limpar };
})(typeof self !== 'undefined' ? self : this);
