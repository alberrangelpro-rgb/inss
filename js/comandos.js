/*
 * Comandos de voz: reconhece fala (pt-BR) e traduz para um comando do app.
 * A função `interpretar` é pura (testável no Node); o reconhecimento em si
 * usa a Web Speech API do navegador.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Comandos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Ordem importa: regras mais específicas vêm antes. Cada entrada é [id, regex].
  const REGRAS = [
    ['inicio', /(do inicio|do comeco|desde o (inicio|comeco)|volt[ae]r? ao (inicio|comeco)|recomec|comec(ar|a|e) de novo|do zero|la do comeco|primeira frase)/],
    ['proximoParagrafo', /(proxim[oa]|avanc\w*|pul\w*|segue|seguinte)(?:\s+\w+){0,2}\s+(artigo|paragrafo|item|inciso)/],
    ['paragrafoAnterior', /(artigo|paragrafo|item|inciso)\s+anterior|(volt\w+|retorn\w+)(?:\s+\w+){0,2}\s+(artigo|paragrafo|item|inciso)/],
    ['repetir', /(repet\w*|de novo|novamente|outra vez|mais uma vez|le\w* (isso )?de novo)/],
    ['maisRapido', /(mais rapido|aceler\w*|aument\w* (a )?velocidade|mais ligeiro)/],
    ['maisDevagar', /(mais devagar|mais lento|desaceler\w*|diminu\w* (a )?velocidade|com calma|bem devagar)/],
    ['parar', /\b(para|pare|parar|pausa|pausar|pause|stop|silencio|cala|chega|espera|espere)\b/],
    ['proxima', /\b(proxim[oa]|avanca|avancar|seguinte|pula|pular|adiante|avance)\b/],
    ['anterior', /\b(anterior|volta|voltar|volte|retorna|retornar|retrocede|retroceder)\b/],
    ['tocar', /\b(continua|continuar|continue|retoma|retomar|ler|leia|le|lê|toca|tocar|toque|play|prossegue|prossiga|segue|seguir|le ai|pode ler|comec\w* a ler)\b/],
  ];

  function interpretar(texto) {
    const t = norm(texto);
    if (!t) return null;
    for (const [id, re] of REGRAS) if (re.test(t)) return id;
    return null;
  }

  function suportado() {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  let atual = null;
  let manter = false;

  // cb: { onInicio, onComando(id, texto), onErro(tipo), onFim }
  function iniciar(cb) {
    parar();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { cb.onErro && cb.onErro('sem-suporte'); return false; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    manter = true;
    atual = rec;
    rec.onstart = () => { cb.onInicio && cb.onInicio(); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const texto = e.results[i][0].transcript;
        const id = interpretar(texto);
        if (id) cb.onComando && cb.onComando(id, texto);
      }
    };
    rec.onerror = (e) => {
      // "no-speech" e "aborted" são rotineiros; só avisamos os que impedem de ouvir.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        manter = false;
        cb.onErro && cb.onErro(e.error);
      }
    };
    rec.onend = () => {
      if (manter) {
        try { rec.start(); } catch (_) { setTimeout(() => { if (manter) { try { rec.start(); } catch (__) {} } }, 400); }
      } else {
        cb.onFim && cb.onFim();
      }
    };
    try { rec.start(); } catch (_) {}
    return true;
  }

  function parar() {
    manter = false;
    if (atual) { try { atual.stop(); } catch (_) {} atual = null; }
  }

  return { interpretar, suportado, iniciar, parar };
});
