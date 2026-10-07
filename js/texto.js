/*
 * Texto: transforma o conteúdo extraído do PDF em parágrafos e frases,
 * e prepara cada frase para ser falada em português (pt-BR).
 *
 * Funciona no navegador (window.Texto) e no Node (require), para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Texto = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- números

  const ORD_U = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
  const ORD_D = ['', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo', 'septuagésimo', 'octogésimo', 'nonagésimo'];
  const ORD_C = ['', 'centésimo', 'ducentésimo', 'trecentésimo', 'quadringentésimo', 'quingentésimo', 'sexcentésimo', 'septingentésimo', 'octingentésimo', 'nongentésimo'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function ordinal(n, feminino) {
    if (!(n >= 1 && n < 1000)) return String(n);
    const partes = [ORD_C[Math.floor(n / 100)], ORD_D[Math.floor(n / 10) % 10], ORD_U[n % 10]].filter(Boolean);
    const s = partes.join(' ');
    return feminino ? s.replace(/o(?![\p{L}])/gu, 'a') : s;
  }

  const ROMANO_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  function romano(s) {
    if (!s || !ROMANO_RE.test(s)) return null;
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const a = v[s[i]], b = v[s[i + 1]] || 0;
      total += a < b ? -a : a;
    }
    return total;
  }

  function ano(y) {
    if (y.length === 4) return y;
    const n = Number(y);
    return String(n >= 30 ? 1900 + n : 2000 + n);
  }

  const LETRAS = {
    a: 'á', b: 'bê', c: 'cê', d: 'dê', e: 'ê', f: 'éfe', g: 'gê', h: 'agá', i: 'í', j: 'jota', k: 'cá', l: 'éle', m: 'ême',
    n: 'êne', o: 'ó', p: 'pê', q: 'quê', r: 'érre', s: 'ésse', t: 'tê', u: 'ú', v: 'vê', w: 'dáblio', x: 'xis', y: 'ípsilon', z: 'zê',
  };
  const letra = (l) => LETRAS[l.toLowerCase()] || l;

  // ------------------------------------------------------ reconhecimento

  const TITULO_RE = /^(T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|LIVRO|PARTE)\s+([IVXLCDM]+|\d+)(?![\p{L}])/iu;

  function ehTitulo(t) {
    t = t.trim();
    if (!t || t.length > 140) return false;
    if (TITULO_RE.test(t)) return true;
    const letras = (t.match(/\p{L}/gu) || []).length;
    const maiusculas = (t.match(/\p{Lu}/gu) || []).length;
    return letras >= 4 && maiusculas / letras > 0.85 && !/[,;]$/.test(t);
  }

  function inicioInciso(t) {
    const m = /^([IVXLCDM]+)\s*[-–—]\s*/.exec(t);
    return m && romano(m[1]) ? m : null;
  }

  // Linha que sempre começa um bloco novo: artigo, parágrafo, inciso, alínea, item...
  const INICIO_ESTRUTURAL_RE = new RegExp([
    '^Arts?\\.?\\s*\\d',
    '^Artigo\\s+\\d',
    '^§',
    '^Par[áa]grafo\\s+[úu]nico',
    '^[a-z]\\)\\s',
    '^\\(?[A-E]\\)\\s',
    '^\\d{1,3}[.)]\\s+\\p{Lu}',
    '^(Quest[ãa]o|QUEST[ÃA]O)\\s+\\d',
    '^[•▪●◦■►✓✔❖➢]\\s?',
    '^[-–]\\s',
  ].join('|'), 'u');

  function inicioEstrutural(t) {
    return INICIO_ESTRUTURAL_RE.test(t) || !!inicioInciso(t) || TITULO_RE.test(t);
  }

  function tipoParagrafo(t) {
    if (ehTitulo(t)) return 'titulo';
    if (/^Arts?\.?\s*\d|^Artigo\s+\d/.test(t)) return 'artigo';
    if (/^§|^Par[áa]grafo\s+[úu]nico/.test(t) || inicioInciso(t) || /^[a-z]\)\s|^\(?[A-E]\)\s/.test(t)) return 'item';
    return 'texto';
  }

  // ------------------------------------------------------ hifenização

  // Pronomes ligados ao verbo: "aplica-se", "concedê-lo", "pagar-lhe".
  const ENCLITICOS = new Set(['se', 'lhe', 'lhes', 'me', 'te', 'vos', 'nos']);
  const ENCLITICOS_ACENTO = new Set(['lo', 'la', 'los', 'las']);
  // Segunda parte de palavras compostas comuns em textos de concurso.
  const COMPOSTAS = new Set([
    'doença', 'acidente', 'maternidade', 'família', 'reclusão', 'alimentação', 'transporte', 'feira', 'lei', 'geral',
    'membro', 'executivo', 'presidente', 'chefe', 'prima', 'base', 'contribuição', 'benefício', 'inclusão', 'creche',
    'funeral', 'natalidade', 'desemprego', 'educação', 'lo', 'la',
  ]);

  function juntarLinhas(anterior, proxima, palavras) {
    const m = /(\p{L}+)-$/u.exec(anterior);
    if (m && !/\s-$/.test(anterior)) {
      const a = m[1];
      const b = (/^\p{L}+/u.exec(proxima) || [''])[0];
      if (b && /^\p{Ll}/u.test(b)) {
        const junto = (a + b).toLowerCase();
        const comHifen = (a + '-' + b).toLowerCase();
        let manterHifen;
        if (palavras && palavras.has(junto)) manterHifen = false;
        else if (palavras && palavras.has(comHifen)) manterHifen = true;
        else if (ENCLITICOS_ACENTO.has(b)) manterHifen = /[áéêíóôú]$/i.test(a);
        else if (ENCLITICOS.has(b)) manterHifen = !(b === 'se' && /s$/i.test(a));
        else manterHifen = COMPOSTAS.has(b.toLowerCase());
        return manterHifen ? anterior + proxima : anterior.slice(0, -1) + proxima;
      }
      // "Decreto-\nLei": hífen de verdade, sem espaço.
      return anterior + proxima;
    }
    return anterior + ' ' + proxima;
  }

  function colecionarPalavras(linhas) {
    const set = new Set();
    for (const l of linhas) {
      const palavras = l.replace(/(\p{L}+)-$/u, '').match(/\p{L}+(?:-\p{L}+)*/gu) || [];
      for (const p of palavras) set.add(p.toLowerCase());
    }
    return set;
  }

  // ------------------------------------------------------ PDF → linhas

  function mediana(v) {
    if (!v.length) return 0;
    const s = [...v].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  function percentil(v, p) {
    if (!v.length) return 0;
    const s = [...v].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  }

  // items: [{str, x, y, w, h}] em coordenadas do PDF (y cresce para cima)
  function linhasDaPagina(items) {
    const validos = items.filter((it) => it.str && it.str.trim() !== '');
    validos.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos = [];
    for (const it of validos) {
      const g = grupos[grupos.length - 1];
      const tol = Math.max(2, 0.45 * (it.h || 10));
      if (g && Math.abs(g.y - it.y) <= tol) g.itens.push(it);
      else grupos.push({ y: it.y, itens: [it] });
    }
    return grupos.map((g) => {
      g.itens.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim = null;
      for (const it of g.itens) {
        const h = it.h || 10;
        if (fim !== null && it.x - fim > 0.15 * h && !texto.endsWith(' ') && !it.str.startsWith(' ')) texto += ' ';
        texto += it.str;
        fim = it.x + (it.w || 0);
      }
      return {
        texto: texto.replace(/\s+/g, ' ').trim(),
        y: g.y,
        x: g.itens[0].x,
        xFim: fim,
        h: mediana(g.itens.map((i) => i.h || 10)),
      };
    }).filter((l) => l.texto);
  }

  const NUMERO_PAGINA_RE = /^(p[áa]g(ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(\s*(de|\/)\s*\d{1,4})?$/i;

  // Remove cabeçalhos/rodapés repetidos e números de página. Só são candidatas
  // as linhas no topo ou no pé da página separadas do corpo por um espaço maior.
  function removerCabecalhos(paginas) {
    const n = paginas.length;
    const chave = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    const espacos = [];
    for (const linhas of paginas) {
      for (let i = 1; i < linhas.length; i++) {
        const d = linhas[i - 1].y - linhas[i].y;
        if (d > 0) espacos.push(d);
      }
    }
    const esp = percentil(espacos, 0.25) || 14;
    const separada = (a, b) => Math.abs(a.y - b.y) > 1.4 * esp;
    const candidatasDe = (linhas) => {
      const c = new Set();
      for (let i = 0; i < Math.min(3, linhas.length - 1); i++) {
        if (separada(linhas[i], linhas[i + 1])) { linhas.slice(0, i + 1).forEach((l) => c.add(l)); break; }
      }
      for (let i = linhas.length - 1; i > Math.max(0, linhas.length - 4); i--) {
        if (separada(linhas[i - 1], linhas[i])) { linhas.slice(i).forEach((l) => c.add(l)); break; }
      }
      if (linhas.length) {
        for (const l of [linhas[0], linhas[linhas.length - 1]]) if (NUMERO_PAGINA_RE.test(l.texto)) c.add(l);
      }
      return c;
    };
    const contagem = new Map();
    const candidatas = paginas.map((linhas) => {
      const c = candidatasDe(linhas);
      for (const k of new Set([...c].map((l) => chave(l.texto)))) contagem.set(k, (contagem.get(k) || 0) + 1);
      return c;
    });
    const minimo = Math.max(3, Math.ceil(n * 0.4));
    return paginas.map((linhas, i) => linhas.filter((l) => {
      if (!candidatas[i].has(l)) return true;
      if (NUMERO_PAGINA_RE.test(l.texto.trim())) return false;
      return !(n >= 3 && contagem.get(chave(l.texto)) >= minimo);
    }));
  }

  /**
   * paginas: [{items:[{str,x,y,w,h}]}]
   * devolve [{texto, pagina, tipo}]
   */
  function paginasParaParagrafos(paginas, opcoes = {}) {
    let linhasPorPagina = paginas.map((p) => linhasDaPagina(p.items || []));
    if (opcoes.removerCabecalhos !== false) linhasPorPagina = removerCabecalhos(linhasPorPagina);

    const todas = linhasPorPagina.flat();
    const palavras = colecionarPalavras(todas.map((l) => l.texto));
    const espacos = [];
    for (const linhas of linhasPorPagina) {
      for (let i = 1; i < linhas.length; i++) {
        const d = linhas[i - 1].y - linhas[i].y;
        if (d > 0 && d < 3 * linhas[i].h) espacos.push(d);
      }
    }
    const espacoTipico = mediana(espacos) || 14;
    const esquerda = percentil(todas.map((l) => l.x), 0.1);
    const direita = percentil(todas.map((l) => l.xFim), 0.9);
    const largura = Math.max(1, direita - esquerda);

    const paragrafos = [];
    let atual = null;
    let anterior = null;
    linhasPorPagina.forEach((linhas, iPagina) => {
      for (const linha of linhas) {
        let novo = !atual;
        if (atual) {
          const mesmaPagina = anterior.pagina === iPagina + 1;
          const fimFrase = /[.!?:;]["”)]?$/.test(anterior.texto);
          if (mesmaPagina && anterior.y - linha.y > 1.7 * espacoTipico) novo = true;
          else if (inicioEstrutural(linha.texto) || ehTitulo(linha.texto) || ehTitulo(anterior.texto)) novo = true;
          else if (fimFrase && anterior.xFim < direita - 0.15 * largura) novo = true;
          else if (fimFrase && /[.!?]["”)]?$/.test(anterior.texto) && linha.x > esquerda + 1.5 * linha.h) novo = true;
          else if (!mesmaPagina && /[.!?]["”)]?$/.test(anterior.texto) && /^\p{Lu}/u.test(linha.texto)) novo = true;
        }
        if (novo) {
          atual = { texto: linha.texto, pagina: iPagina + 1 };
          paragrafos.push(atual);
        } else {
          atual.texto = juntarLinhas(atual.texto, linha.texto, palavras);
        }
        anterior = { ...linha, pagina: iPagina + 1 };
      }
    });
    return paragrafos.map((p) => ({ ...p, tipo: tipoParagrafo(p.texto) }));
  }

  // Texto simples (TXT ou colado): linhas em branco separam parágrafos.
  function textoParaParagrafos(str) {
    const linhas = str.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    const palavras = colecionarPalavras(linhas);
    const paragrafos = [];
    let atual = null;
    for (const linha of linhas) {
      if (!linha) { atual = null; continue; }
      const novo = !atual || inicioEstrutural(linha) || ehTitulo(linha) || ehTitulo(atual.texto);
      if (novo) {
        atual = { texto: linha, pagina: 1 };
        paragrafos.push(atual);
      } else {
        atual.texto = juntarLinhas(atual.texto, linha, palavras);
      }
    }
    return paragrafos.map((p) => ({ ...p, tipo: tipoParagrafo(p.texto) }));
  }

  // ------------------------------------------------------ frases

  const ABREVIATURAS = new Set([
    'art', 'arts', 'inc', 'incs', 'al', 'dr', 'dra', 'drs', 'sr', 'sra', 'srs', 'sras', 'prof', 'profa', 'pág', 'págs', 'pag',
    'p', 'pp', 'fl', 'fls', 'n', 'nº', 'núm', 'num', 'ex', 'obs', 'cf', 'vol', 'ed', 'cap', 'caps', 'tít', 'min', 'rel',
    'des', 'exmo', 'exma', 'ilmo', 'ilma', 'ltda', 'jr', 'av', 'aprox', 'séc', 'tel', 'id', 'ibid', 'op', 'cit', 'ss', 'res',
    'dec', 'port', 'const', 'v', 'g', 'e', 'i', 'c', 's', 'a', 'd', 'al', 'et', 'vs', 'pg', 'parág', 'alín',
  ]);
  const ANTES_DE_NUMERO = new Set(['art', 'arts', '§', '§§', 'nº', 'n', 'inc', 'incs', 'lei', 'decreto', 'item', 'súmula']);

  const LIMITE_FRASE = 220;

  function dividirFrases(texto) {
    const frases = [];
    const re = /[.!?…]+["'”»)]*(?=\s+)/g;
    let inicio = 0;
    let m;
    while ((m = re.exec(texto))) {
      const fim = m.index + m[0].length;
      const resto = texto.slice(fim).trimStart();
      if (!resto) break;
      if (!/^[\p{Lu}\d§"“'(«\-–—]/u.test(resto)) continue;
      if (m[0][0] === '.' && m[0].length === 1) {
        const antes = texto.slice(inicio, m.index).split(/\s+/);
        const palavra = (antes[antes.length - 1] || '').replace(/^[("“'«]+/, '');
        const base = palavra.toLowerCase().replace(/\./g, '');
        if (ABREVIATURAS.has(base) || /^\p{Lu}$/u.test(palavra) || /^(\p{L}\.)+\p{L}$/u.test(palavra)) continue;
        if (/^[\d.]+[º°ª]?(-[A-Z])?$/.test(palavra)) {
          const previa = (antes[antes.length - 2] || '').toLowerCase().replace(/\.$/, '');
          if (ANTES_DE_NUMERO.has(previa)) continue;
        }
      }
      frases.push(texto.slice(inicio, fim).trim());
      inicio = fim;
    }
    const ultima = texto.slice(inicio).trim();
    if (ultima) frases.push(ultima);
    return frases.flatMap((f) => partirLonga(f, LIMITE_FRASE));
  }

  // Frases muito longas são cortadas por alguns navegadores: divide em
  // ponto e vírgula, dois-pontos ou vírgula, o mais perto do meio possível.
  function partirLonga(f, limite) {
    if (f.length <= limite) return [f];
    const meio = f.length / 2;
    for (const sep of [/;\s/g, /:\s/g, /,\s/g, /\s/g]) {
      let melhor = -1;
      let m;
      while ((m = sep.exec(f))) {
        const pos = m.index + 1;
        if (pos < 40 || f.length - pos < 40) continue;
        if (melhor < 0 || Math.abs(pos - meio) < Math.abs(melhor - meio)) melhor = pos;
      }
      if (melhor > 0) {
        return [...partirLonga(f.slice(0, melhor).trim(), limite), ...partirLonga(f.slice(melhor).trim(), limite)];
      }
    }
    return [f];
  }

  function criarDocumento(paragrafos) {
    const frases = [];
    const ps = paragrafos.map((p, i) => {
      const lista = dividirFrases(p.texto);
      const primeira = frases.length;
      for (const texto of lista) frases.push({ p: i, texto });
      return { ...p, primeira, frases: lista };
    });
    return { paragrafos: ps, frases };
  }

  // ------------------------------------------------------ fala

  const NOTA_RE = /\s*\((?:Reda[çc][ãa]o\s+dada|Inclu[íi]d[oa]s?|Acrescid|Acrescentad|Vide\b|Vig[êe]ncia|Regulamento|Regulamenta[çc][ãa]o|Produ[çc][ãa]o\s+de\s+efeito|Renumerad|Alterad|Promulga[çc][ãa]o|Express[ãa]o\s+suprimida|Convers[ãa]o\s+da|Mensagem\s+de\s+veto|Texto\s+compilado)[^()]*(?:\([^()]*\)[^()]*)*\)/giu;

  const ABREV_FALA = [
    ['p. ex.', 'por exemplo'], ['inc.', 'inciso'], ['incs.', 'incisos'], ['Inc.', 'Inciso'],
    ['Dr.', 'Doutor'], ['Dra.', 'Doutora'], ['Drs.', 'Doutores'], ['Sr.', 'Senhor'], ['Sra.', 'Senhora'], ['Srs.', 'Senhores'], ['Sras.', 'Senhoras'],
    ['Prof.', 'Professor'], ['Profa.', 'Professora'], ['pág.', 'página'], ['págs.', 'páginas'], ['fl.', 'folha'], ['fls.', 'folhas'],
    ['ex.:', 'exemplo:'], ['Ex.:', 'Exemplo:'], ['ex.', 'exemplo'], ['Ex.', 'Exemplo'],
    ['obs.:', 'observação:'], ['Obs.:', 'Observação:'], ['obs.', 'observação'], ['Obs.', 'Observação'],
    ['etc.', 'etcétera.'], ['etc', 'etcétera'], ['c/c', 'combinado com'], ['s/n', 'sem número'], ['e/ou', 'e ou'],
    ['v.g.', 'por exemplo'], ['i.e.', 'isto é'], ['e.g.', 'por exemplo'], ['cf.', 'conforme'], ['Cf.', 'Conforme'],
    ['aprox.', 'aproximadamente'], ['séc.', 'século'], ['tít.', 'título'], ['Tít.', 'Título'], ['cap.', 'capítulo'], ['Cap.', 'Capítulo'],
    ['vol.', 'volume'], ['Min.', 'Ministro'], ['Rel.', 'Relator'], ['Des.', 'Desembargador'], ['Exmo.', 'Excelentíssimo'], ['Exma.', 'Excelentíssima'],
    ['Ilmo.', 'Ilustríssimo'], ['Ilma.', 'Ilustríssima'], ['Ltda.', 'limitada'], ['S.A.', 'S A'], ['ss.', 'seguintes'],
    ['parág.', 'parágrafo'], ['alín.', 'alínea'],
  ].sort((a, b) => b[0].length - a[0].length);

  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  function regexTermo(termo) {
    const fimLetra = /[\p{L}\p{N}]$/u.test(termo);
    return new RegExp('(?<![\\p{L}\\p{N}])' + escapar(termo) + (fimLetra ? '(?![\\p{L}\\p{N}])' : ''), 'gu');
  }
  const ABREV_FALA_RE = ABREV_FALA.map(([de, para]) => [regexTermo(de), para]);

  // Siglas que continuam em maiúsculas (são lidas letra a letra ou como a voz preferir).
  const SIGLAS = new Set(('INSS CNIS LOAS PASEP CEBAS DATAPREV SUS FGTS CLT PIS BPC OAB ONU CPF CNPJ DER DIB DCB RMI NIT IN EC LC MP CF ' +
    'SAT RAT FAP NTEP CAT TCU AGU CGU ECA CTN CPC CPP CDC LINDB ADI ADC ADPF RE IRDR TNU TRF TST STJ STF CNJ ICMS IPI IR ' +
    'IRPF CSLL COFINS ITR IPTU ISS SELIC IPCA INPC IGP UF DF PDF CTPS RGPS RPPS RPC PEC CPMF ONG OIT MPS MTE SIAPE SESMT').split(' '));

  function suavizarMaiusculas(t, preservar) {
    const letras = (t.match(/\p{L}/gu) || []).length;
    const maiusculas = (t.match(/\p{Lu}/gu) || []).length;
    const tudo = letras >= 6 && maiusculas / letras > 0.7;
    return t.replace(/\p{L}+/gu, (w) => {
      if (w.length < (tudo ? 2 : 3) || w !== w.toUpperCase() || w === w.toLowerCase()) return w;
      if (SIGLAS.has(w) || preservar.has(w)) return w;
      if (!/[AEIOUÁÉÍÓÚÂÊÔÃÕÀ]/.test(w)) return w;
      return w.toLowerCase();
    });
  }

  /** "INSS = I N S S" por linha → [[termo, fala]] */
  function lerDicionario(texto) {
    return (texto || '').split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2)
      .map(([de, ...para]) => [de.trim(), para.join('=').trim()]).filter(([de]) => de);
  }

  const cacheDicionario = new WeakMap();
  function compilarDicionario(dic) {
    if (!dic || !dic.length) return [];
    if (cacheDicionario.has(dic)) return cacheDicionario.get(dic);
    const c = dic.map(([de, para]) => [regexTermo(de), para, de]);
    cacheDicionario.set(dic, c);
    return c;
  }

  /**
   * Prepara uma frase para a voz.
   * opcoes: { legislacao: bool, pularNotas: bool, dicionario: [[termo, fala]] }
   */
  function falar(texto, opcoes = {}) {
    const o = Object.assign({ legislacao: true, pularNotas: true, dicionario: [] }, opcoes);
    let t = texto;

    t = t.replace(/[­​-‍﻿]/g, '');
    t = t.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '');
    t = t.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");
    t = t.replace(/https?:\/\/\S+|www\.\S+/gi, 'link');
    if (o.pularNotas) t = t.replace(NOTA_RE, '');

    // "1o" escrito com a letra o no lugar de º
    t = t.replace(/(?<=(?:^|[^\d.,])\d{1,3})o(?![\p{L}\d])/gu, 'º');

    // Constituição e normas citadas com barra: CF/88, Lei 8.213/91
    t = t.replace(/(?<![\p{L}])CF\s*\/\s*(\d{4}|\d{2})(?!\d)/gu, (m, y) => 'CF de ' + ano(y));

    const preservar = new Set();
    for (const [re, para, de] of compilarDicionario(o.dicionario)) {
      t = t.replace(re, para);
      preservar.add(de);
    }
    for (const [re, para] of ABREV_FALA_RE) t = t.replace(re, para);
    t = t.replace(/(?<![\p{L}])p\.\s?(?=\d)/gu, 'página ');

    // Começo de dispositivo: "Art. 1º A ..." → "Art. 1º. A ..." (pausa após o número)
    t = t.replace(/^\s*(Arts?\.?\s*[\d.]+(?:\s*[º°ª])?(?:\s*-\s*[A-Z](?![\p{L}]))?|§+\s*\d+(?:\s*[º°])?(?:\s*-\s*[A-Z](?![\p{L}]))?|Par[áa]grafo\s+[úu]nico)\s*[.:\-–—]?\s+(?=[\p{Lu}("“])/u, '$1. ');
    if (o.legislacao) {
      t = t.replace(/^\s*([IVXLCDM]+)\s*[-–—]\s*/, (m, r) => {
        const n = romano(r);
        return n ? `Inciso ${n}. ` : m;
      });
      t = t.replace(/^\s*([a-z])\)\s*/, (m, l) => `Alínea ${letra(l)}. `);
    } else {
      t = t.replace(/^\s*([a-z])\)\s*/, (m, l) => `Letra ${letra(l)}. `);
    }
    t = t.replace(/^\s*\(?([A-E])\)\s+/, (m, l) => `Letra ${letra(l)}. `);

    // número / números
    t = t.replace(/(?<![\p{L}])([Nn])\s?\.?\s?[º°]\s?(s)?(?=\s*\d)/gu, (m, n, s) => (s ? 'números ' : 'número '));
    t = t.replace(/(?<![\p{L}])[Nn]\.\s?(?=\d)/gu, 'número ');

    // Datas 24/07/1991
    t = t.replace(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\d/])/g, (m, d, mes, y) => {
      const i = Number(mes) - 1;
      if (i < 0 || i > 11 || Number(d) < 1 || Number(d) > 31) return m;
      return `${Number(d) === 1 ? 'primeiro' : Number(d)} de ${MESES[i]} de ${ano(y)}`;
    });
    // Normas: 8.213/1991, 3.048/99, "EC nº 20/98"
    t = t.replace(/(?<![\d.,/])(\d{1,3}(?:\.\d{3})+|\d{3,})\s*\/\s*(\d{4}|\d{2})(?![\d/])/g, (m, n, y) => `${n}, de ${ano(y)}`);
    t = t.replace(/((?:Lei|Decreto|EC|MP|LC|Portaria|IN|Resolução|Emenda|Medida Provisória|número|números)\s+)(\d{1,3})\s*\/\s*(\d{4}|\d{2})(?![\d/])/g,
      (m, a, n, y) => `${a}${n}, de ${ano(y)}`);

    // Dinheiro
    t = t.replace(/R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g, (m, inteiro, cent) => {
      const n = inteiro.replace(/\./g, '');
      let s = `${n} ${n === '1' ? 'real' : 'reais'}`;
      if (cent && cent !== '00') s += ` e ${Number(cent)} ${Number(cent) === 1 ? 'centavo' : 'centavos'}`;
      return s;
    });

    // Artigos e parágrafos: até o nono se lê ordinal; do 10 em diante, cardinal.
    t = t.replace(/(?<![\p{L}])([Aa])rt(s?)\.?(?=\s*\d)/gu, (m, a, s) => (a === 'A' ? 'Artigo' : 'artigo') + (s ? 's' : ''));
    t = t.replace(/(?<![\p{L}])([Aa])rt(s?)\.(?![\p{L}])/gu, (m, a, s) => (a === 'A' ? 'Artigo' : 'artigo') + (s ? 's' : ''));
    t = t.replace(/§§\s*/g, 'parágrafos ').replace(/§\s*/g, 'parágrafo ');
    t = t.replace(/(?<![\p{L}])((?:[Aa]rtigo|[Pp]ar[áa]grafo)s?)\s+(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*[º°ª])?(?:\s*-\s*([A-Z])(?![\p{L}]))?/gu,
      (m, w, n, suf) => {
        const num = !n.includes('.') && Number(n) <= 9 ? ordinal(Number(n)) : n;
        return `${w} ${num}${suf ? ' ' + suf : ''}`;
      });

    if (o.legislacao) {
      // "art. 5º, LXXIII" → "artigo quinto, inciso 73"
      t = t.replace(/((?:[Aa]rtigos?)\s+[\p{L}\d.]+(?:\s+[A-Z](?![\p{L}]))?)\s*,\s*([IVXLCDM]+)(?![\p{L}])/gu,
        (m, a, r) => (romano(r) ? `${a}, inciso ${romano(r)}` : m));
      // "incisos I a IV"
      t = t.replace(/((?:[Ii]ncisos?|INCISOS?)\s+)([IVXLCDM]+(?:\s*(?:,|e|a|ou|até)\s*[IVXLCDM]+)*)(?![\p{L}])/gu,
        (m, a, lista) => a + lista.replace(/[IVXLCDM]+/g, (r) => romano(r) || r));
    }
    // "CAPÍTULO II" → "CAPÍTULO 2"
    t = t.replace(/((?:T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|LIVRO|PARTE|ANEXO|Título|Capítulo|Seção|Subseção|Livro|Parte|Anexo|título|capítulo)\s+)([IVXLCDM]+)(?![\p{L}])/gu,
      (m, a, r) => (romano(r) ? a + romano(r) : m));

    // Ordinais 1º, 2ª
    t = t.replace(/(\d+)\s?[º°](?!\s?[CF](?![\p{L}]))/gu, (m, n) => ordinal(Number(n)));
    t = t.replace(/(\d+)\s?ª/g, (m, n) => ordinal(Number(n), true));

    // Separador de milhar: "8.213" → "8213" (algumas vozes leem "ponto")
    t = t.replace(/(?<![\d,.])(\d{1,3}(?:\.\d{3})+)(?!\d|[.,]\d)/g, (m) => m.replace(/\./g, ''));

    t = suavizarMaiusculas(t, preservar);

    // Pontuação para pausas naturais
    t = t.replace(/\s*[–—]\s*/g, ', ').replace(/\s+-\s+/g, ', ');
    t = t.replace(/[•▪●◦■►✓✔❖➢→]/g, ' ');
    t = t.replace(/\s*\(\s*/g, ', ').replace(/\s*\)\s*/g, ', ');
    t = t.replace(/[[\]{}"]/g, '').replace(/&/g, ' e ');
    for (let i = 0; i < 2; i++) {
      t = t.replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/,(\s*,)+/g, ',')
        .replace(/,\s*([.;:!?])/g, '$1')
        .replace(/([.;:!?])\s*,/g, '$1')
        .replace(/\.\s*\./g, '.');
    }
    return t.replace(/^[\s,;.:]+/, '').replace(/[\s,]+$/, '').trim();
  }

  return {
    ordinal, romano, ehTitulo, tipoParagrafo, inicioEstrutural, juntarLinhas,
    linhasDaPagina, removerCabecalhos, paginasParaParagrafos, textoParaParagrafos,
    dividirFrases, criarDocumento, falar, lerDicionario, LIMITE_FRASE,
  };
});
