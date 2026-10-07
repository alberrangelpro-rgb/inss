(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fala = window.speechSynthesis;
  const CHAVE = 'estudo-voz:';
  const VELOCIDADES = [0.75, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2, 2.25, 2.5];
  const DICIONARIO_PADRAO = [
    'INSS = I N S S',
    'RGPS = R G P S',
    'RPPS = R P P S',
    'CTPS = C T P S',
    'CF = Constituição Federal',
    'EC = Emenda Constitucional',
    'LC = Lei Complementar',
    'BPC = B P C',
  ].join('\n');

  // ------------------------------------------------------------ armazenamento

  const armazenar = {
    ler(chave, padrao) {
      try {
        const v = localStorage.getItem(CHAVE + chave);
        return v == null ? padrao : JSON.parse(v);
      } catch (e) { return padrao; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(CHAVE + chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
    },
  };

  const config = Object.assign({
    voz: '',
    vozModo: 'aparelho',      // 'aparelho' (voz do dispositivo) ou 'servidor' (voz premium)
    servidorUrl: '',
    servidorToken: '',
    servidorVoz: '',
    velocidade: 1,
    tom: 1,
    pausas: 1,
    legislacao: true,
    pularNotas: true,
    removerCabecalhos: true,
    seguirTexto: true,
    dicionario: DICIONARIO_PADRAO,
    timer: 0,
  }, armazenar.ler('config', {}));
  const salvarConfig = () => armazenar.gravar('config', config);

  // ------------------------------------------------------------ estado

  const estado = {
    doc: null,          // { id, titulo, paginas, paragrafos, frases }
    pos: 0,             // índice da frase atual
    tocando: false,
    repetir: false,
    passo: 0,           // muda a cada frase falada; descarta eventos atrasados
    esperandoFala: false,
    inicioFala: 0,
    temporizador: null,
    fimTimer: 0,
    dicionario: Texto.lerDicionario(config.dicionario),
    rolagemManual: 0,
    wakeLock: null,
    vozes: [],
    audio: typeof Audio !== 'undefined' ? new Audio() : null,
    audioDesbloqueado: false,
    ouvindo: false,
  };
  if (estado.audio) { estado.audio.preload = 'auto'; estado.audio.playsInline = true; }

  // mp3 silencioso (0,05 s): tocado no primeiro gesto para liberar o áudio no iOS.
  const SILENCIO = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABAAAAR4Aurq6urq6urq6urq6urq6urq6urq6urq60dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0ejo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Oj/////////////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCcQAAAAAAAAEeqyLcVwAAAAAAAAAAAAAAAAD/8xDEAAAAA0gAAAAATEFNRTMuMTAwVVVVVf/zEMQNAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxBoAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEJwAAA0gAAAAAVVVVVVVVVVVVVVVVVQ==';

  // ------------------------------------------------------------ avisos

  let avisoTimeout;
  function avisar(msg, ms = 3500) {
    const el = $('aviso');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(avisoTimeout);
    avisoTimeout = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ------------------------------------------------------------ vozes

  const ehAppleIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Qualidade da voz: "aprimorada"/premium e neural soam bem mais naturais que
  // a "compacta" padrão. Detecta pelo identificador (voiceURI) e pelo nome.
  function ehAprimorada(v) {
    return /premium|enhanced|neural|natural|wavenet/i.test(v.voiceURI + ' ' + v.name);
  }
  function ehCompacta(v) {
    return /compact/i.test(v.voiceURI) && !ehAprimorada(v);
  }

  function pontuarVoz(v) {
    let p = 0;
    if (/^pt[-_]BR/i.test(v.lang)) p += 10;
    else if (/^pt/i.test(v.lang)) p += 5;
    if (ehAprimorada(v)) p += 6;
    if (/online/i.test(v.name) || !v.localService) p += 3;
    if (/google/i.test(v.name)) p += 2;
    if (/francisca|thalita|antonio|luciana|felipe|joana|catarina/i.test(v.name)) p += 1;
    if (ehCompacta(v)) p -= 3;
    return p;
  }

  function carregarVozes() {
    if (!fala) return;
    const todas = fala.getVoices();
    if (!todas.length) return;
    const pt = todas.filter((v) => /^pt/i.test(v.lang)).sort((a, b) => pontuarVoz(b) - pontuarVoz(a));
    const outras = todas.filter((v) => !/^pt/i.test(v.lang));
    estado.vozes = todas;
    const sel = $('voz');
    sel.innerHTML = '';
    const grupo = (rotulo, lista) => {
      if (!lista.length) return;
      const g = document.createElement('optgroup');
      g.label = rotulo;
      for (const v of lista) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        const marca = ehAprimorada(v) ? ' ✨ aprimorada' : (ehCompacta(v) ? ' · compacta' : (v.localService ? '' : ' · online'));
        o.textContent = `${v.name} (${v.lang})${marca}`;
        g.appendChild(o);
      }
      sel.appendChild(g);
    };
    grupo('Português', pt);
    grupo('Outros idiomas', outras);
    if (!todas.some((v) => v.voiceURI === config.voz)) config.voz = (pt[0] || todas[0]).voiceURI;
    sel.value = config.voz;
    $('vozDica').innerHTML = dicaDeVoz(pt);
  }

  function dicaDeVoz(pt) {
    const temAprimorada = pt.some(ehAprimorada);
    if (!pt.length) {
      return ehAppleIOS
        ? 'Nenhuma voz em português encontrada. Em <strong>Ajustes › Acessibilidade › Conteúdo Falado › Vozes › Português</strong>, baixe a voz <strong>Luciana</strong> ou <strong>Felipe</strong>.'
        : 'Nenhuma voz em português foi encontrada. No Android, instale “Serviços de fala do Google” e o idioma Português (Brasil). No Windows, adicione a voz em Configurações › Hora e idioma › Fala.';
    }
    if (temAprimorada) {
      return 'Para a leitura mais natural, escolha acima uma voz marcada com <strong>✨ aprimorada</strong>.';
    }
    if (ehAppleIOS) {
      return 'A voz está na versão <strong>compacta</strong>, por isso soa robótica. Para a versão natural (grátis): <strong>Ajustes › Acessibilidade › Conteúdo Falado › Vozes › Português</strong>, toque em <strong>Luciana</strong> (ou Felipe) e baixe a opção <strong>Aprimorada</strong> ou <strong>Premium</strong>. Depois volte aqui e selecione essa voz.';
    }
    return 'Dica: no computador, o Microsoft Edge traz vozes “Natural” em português, bem mais fluidas. No Android, instale os “Serviços de fala do Google”.';
  }

  const vozAtual = () => estado.vozes.find((v) => v.voiceURI === config.voz) || null;

  // ------------------------------------------------------------ documento

  function abrirDocumento(doc, opcoes = {}) {
    parar();
    const montado = Texto.criarDocumento(doc.paragrafos);
    estado.doc = { ...doc, paragrafos: montado.paragrafos, frases: montado.frases };
    const salvo = armazenar.ler('pos:' + doc.id, 0);
    estado.pos = Math.min(Math.max(0, salvo), Math.max(0, montado.frases.length - 1));
    $('docTitulo').textContent = doc.titulo;
    $('docEtiqueta').textContent = doc.exemplo ? 'Exemplo' : (doc.paginas > 1 ? `${doc.paginas} páginas` : 'Documento');
    document.title = doc.exemplo ? 'Estudo em Voz' : `${doc.titulo} · Estudo em Voz`;
    renderizar();
    marcarAtual(true);
    if (!doc.exemplo && salvo > 0 && !opcoes.silencioso) avisar('Continuando de onde você parou.');
  }

  function renderizar() {
    const { paragrafos, frases, paginas } = estado.doc;
    const leitura = $('leitura');
    const frag = document.createDocumentFragment();
    let paginaAtual = 0;
    paragrafos.forEach((p, i) => {
      if (paginas > 1 && p.pagina !== paginaAtual) {
        paginaAtual = p.pagina;
        const m = document.createElement('div');
        m.className = 'pagina-marca';
        m.id = 'pagina-' + p.pagina;
        m.textContent = 'Página ' + p.pagina;
        frag.appendChild(m);
      }
      const el = document.createElement('p');
      el.className = 'p-' + p.tipo;
      el.dataset.p = i;
      p.frases.forEach((texto, j) => {
        if (j) el.appendChild(document.createTextNode(' '));
        const s = document.createElement('span');
        s.className = 'f';
        s.dataset.i = p.primeira + j;
        s.textContent = texto;
        el.appendChild(s);
      });
      frag.appendChild(el);
    });
    if (!frases.length) {
      const vazio = document.createElement('p');
      vazio.textContent = 'Nenhum texto encontrado neste arquivo.';
      frag.appendChild(vazio);
    }
    leitura.replaceChildren(frag);

    const sel = $('irPagina');
    sel.innerHTML = '';
    const total = Math.max(1, paginas || 1);
    sel.hidden = total < 2;
    const comTexto = new Set(paragrafos.map((p) => p.pagina));
    for (let n = 1; n <= total; n++) {
      if (!comTexto.has(n)) continue;
      const o = document.createElement('option');
      o.value = n;
      o.textContent = `Pág. ${n}/${total}`;
      sel.appendChild(o);
    }
  }

  function spanDaFrase(i) {
    return $('leitura').querySelector(`.f[data-i="${i}"]`);
  }

  function estaVisivel(el) {
    const r = el.getBoundingClientRect();
    const topo = document.querySelector('.topo').getBoundingClientRect().bottom;
    const base = document.querySelector('.player').getBoundingClientRect().top;
    return r.bottom > topo + 8 && r.top < base - 8;
  }

  function marcarAtual(forcarRolagem) {
    const { frases, paragrafos } = estado.doc;
    const anterior = $('leitura').querySelector('.f.atual');
    if (anterior) anterior.classList.remove('atual');
    const el = spanDaFrase(estado.pos);
    if (el) {
      el.classList.add('atual');
      const manual = Date.now() - estado.rolagemManual < 4000;
      if (forcarRolagem || (config.seguirTexto && !manual && !estaVisivel(el))) {
        el.scrollIntoView({ block: 'center', behavior: forcarRolagem ? 'auto' : 'smooth' });
      }
    }
    const total = frases.length;
    const frase = frases[estado.pos];
    $('statusPosicao').textContent = total
      ? `Frase ${estado.pos + 1} de ${total}` + (frase && estado.doc.paginas > 1 ? ` · página ${paragrafos[frase.p].pagina}` : '')
      : 'Sem texto';
    $('progressoBarra').style.width = total ? `${((estado.pos + 1) / total) * 100}%` : '0';
    $('playerFrase').textContent = frase ? frase.texto : '';
    if (frase && estado.doc.paginas > 1) $('irPagina').value = paragrafos[frase.p].pagina;
    atualizarRestante();
    atualizarBotaoVoltar();
  }

  function atualizarRestante() {
    const { frases } = estado.doc;
    let chars = 0;
    for (let i = estado.pos; i < frases.length; i++) chars += frases[i].texto.length;
    // ~14 caracteres por segundo na velocidade 1, somando as pausas
    const min = Math.round(chars / (14 * config.velocidade) / 60 + (frases.length - estado.pos) * 0.35 * config.pausas / 60);
    $('statusRestante').textContent = frases.length
      ? (min >= 60 ? `≈ ${Math.floor(min / 60)} h ${min % 60} min até o fim` : `≈ ${Math.max(1, min)} min até o fim`)
      : '';
  }

  function atualizarBotaoVoltar() {
    const el = spanDaFrase(estado.pos);
    $('voltarTrecho').hidden = !el || estaVisivel(el);
  }

  let gravarPosTimeout;
  function gravarPosicao() {
    clearTimeout(gravarPosTimeout);
    gravarPosTimeout = setTimeout(() => {
      if (estado.doc) armazenar.gravar('pos:' + estado.doc.id, estado.pos);
    }, 400);
  }

  // ------------------------------------------------------------ leitura em voz

  function opcoesFala() {
    return { legislacao: config.legislacao, pularNotas: config.pularNotas, dicionario: estado.dicionario };
  }

  const clampRate = (v) => Math.min(3, Math.max(0.5, v));
  const modoServidorAtivo = () => config.vozModo === 'servidor' && !!(config.servidorUrl || '').trim();
  const paramsServidor = () => ({ url: config.servidorUrl, token: config.servidorToken || '', voz: config.servidorVoz || '' });

  function desbloquearAudio() {
    if (!estado.audio || estado.audioDesbloqueado) return;
    estado.audioDesbloqueado = true;
    try {
      estado.audio.src = SILENCIO;
      const p = estado.audio.play();
      if (p && p.then) p.then(() => { try { estado.audio.pause(); } catch (e) {} }).catch(() => {});
    } catch (e) { /* ignora */ }
  }

  function pararAudioAtual() {
    if (!estado.audio) return;
    try { estado.audio.pause(); } catch (e) {}
    estado.audio.onended = null;
    estado.audio.onerror = null;
  }

  function falarAtual() {
    const frase = estado.doc.frases[estado.pos];
    if (!frase) return parar();
    marcarAtual(false);
    gravarPosicao();
    pararAudioAtual();
    const passo = ++estado.passo;
    const texto = Texto.falar(frase.texto, opcoesFala());
    if (!texto || !/[\p{L}\p{N}]/u.test(texto)) {
      estado.esperandoFala = false;
      return depoisDaFrase(passo);
    }
    if (modoServidorAtivo()) falarServidor(texto, passo);
    else falarDispositivo(texto, passo);
  }

  async function falarServidor(texto, passo) {
    estado.esperandoFala = false; // o vigia do Chrome é só para a voz do aparelho
    const a = estado.audio;
    if (!a) return falarDispositivo(texto, passo);
    try {
      const url = await VozServidor.sintetizar(texto, paramsServidor());
      if (passo !== estado.passo || !estado.tocando) return;
      a.src = url;
      a.playbackRate = clampRate(config.velocidade);
      a.onended = () => depoisDaFrase(passo);
      a.onerror = () => { if (passo === estado.passo) depoisDaFrase(passo); };
      await a.play();
      prefetchProxima();
    } catch (err) {
      if (passo !== estado.passo) return;
      tratarErroServidor(err);
    }
  }

  function prefetchProxima() {
    if (!modoServidorAtivo()) return;
    const prox = estado.doc.frases[estado.pos + 1];
    if (!prox) return;
    const t = Texto.falar(prox.texto, opcoesFala());
    if (t) VozServidor.sintetizar(t, paramsServidor()).catch(() => {});
  }

  function tratarErroServidor(err) {
    parar();
    const s = err && err.status;
    let msg;
    if (err && err.rede) msg = 'Não consegui falar com o servidor de voz. Confira se ele está ligado e se o endereço (https) está certo nos ajustes.';
    else if (s === 401 || s === 403) msg = 'O servidor de voz recusou o acesso. Confira o token nos ajustes.';
    else if (s === 429 || s === 503) msg = 'O servidor de voz está ocupado. Tente de novo em instantes.';
    else msg = 'Erro no servidor de voz. Dá para usar a voz do aparelho nos ajustes enquanto isso.';
    avisar(msg, 6000);
  }

  function falarDispositivo(texto, passo) {
    const u = new SpeechSynthesisUtterance(texto);
    const voz = vozAtual();
    if (voz) u.voice = voz;
    u.lang = voz ? voz.lang : 'pt-BR';
    u.rate = config.velocidade;
    u.pitch = config.tom;
    u.onend = () => depoisDaFrase(passo);
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (e.error === 'not-allowed') { parar(); avisar('Toque em Ouvir para liberar o áudio.'); return; }
      depoisDaFrase(passo);
    };
    estado.utterance = u; // evita que o navegador descarte o objeto antes do fim
    estado.esperandoFala = true;
    estado.inicioFala = Date.now();
    fala.speak(u);
  }

  function pausaDepois(i) {
    const { frases, paragrafos } = estado.doc;
    const atual = frases[i];
    const prox = frases[i + 1];
    if (!prox) return 0;
    let ms = 180;
    if (prox.p !== atual.p) {
      const tipo = paragrafos[atual.p].tipo;
      ms = tipo === 'titulo' ? 950 : 650;
      if (paragrafos[prox.p].tipo === 'titulo') ms = Math.max(ms, 900);
    }
    return ms * config.pausas;
  }

  function depoisDaFrase(passo) {
    if (passo !== estado.passo || !estado.tocando) return;
    estado.passo++;
    estado.esperandoFala = false;
    const proximoPasso = estado.passo;
    if (estado.fimTimer && Date.now() >= estado.fimTimer) {
      parar();
      avisar('Temporizador encerrado. Bons estudos!');
      return;
    }
    const repetir = estado.repetir;
    if (!repetir && estado.pos >= estado.doc.frases.length - 1) {
      parar();
      avisar('Fim do documento.');
      return;
    }
    const espera = repetir ? 700 * Math.max(0.5, config.pausas) : pausaDepois(estado.pos);
    clearTimeout(estado.temporizador);
    estado.temporizador = setTimeout(() => {
      if (!estado.tocando || proximoPasso !== estado.passo) return;
      if (!repetir) estado.pos++;
      falarAtual();
    }, espera);
  }

  function tocar() {
    if (config.vozModo === 'servidor' && !(config.servidorUrl || '').trim()) {
      avisar('Configure o endereço do servidor de voz nos ajustes, ou use a voz do aparelho.', 6000);
      return;
    }
    if (!fala && !modoServidorAtivo()) { avisar('Este navegador não tem leitura em voz. Use Chrome, Edge ou Safari atualizados.', 6000); return; }
    if (!estado.doc || !estado.doc.frases.length) return;
    desbloquearAudio();
    if (fala) fala.cancel();
    estado.tocando = true;
    document.body.classList.add('tocando');
    $('btPlay').setAttribute('aria-label', 'Pausar');
    if (config.timer > 0 && !estado.fimTimer) estado.fimTimer = Date.now() + config.timer * 60000;
    pedirTelaLigada();
    falarAtual();
  }

  function parar() {
    estado.tocando = false;
    estado.passo++;
    estado.esperandoFala = false;
    estado.fimTimer = 0;
    clearTimeout(estado.temporizador);
    pararAudioAtual();
    if (fala) fala.cancel();
    document.body.classList.remove('tocando');
    $('btPlay').setAttribute('aria-label', 'Ouvir');
    $('timerInfo').hidden = true;
    liberarTela();
  }

  function alternar() { estado.tocando ? parar() : tocar(); }

  function irPara(i, opcoes = {}) {
    if (!estado.doc || !estado.doc.frases.length) return;
    estado.pos = Math.min(Math.max(0, i), estado.doc.frases.length - 1);
    estado.rolagemManual = 0;
    if (estado.tocando) {
      estado.passo++;
      clearTimeout(estado.temporizador);
      pararAudioAtual();
      if (fala) fala.cancel();
      setTimeout(() => { if (estado.tocando) falarAtual(); }, 60);
    } else {
      marcarAtual(false);
      gravarPosicao();
      if (opcoes.tocar) tocar();
    }
  }

  function paragrafoRelativo(delta) {
    const { frases, paragrafos } = estado.doc;
    const p = frases[estado.pos].p;
    if (delta < 0) {
      // volta ao começo do parágrafo atual; se já estiver nele, ao anterior
      const inicio = paragrafos[p].primeira;
      if (estado.pos > inicio) return irPara(inicio);
      for (let q = p - 1; q >= 0; q--) if (paragrafos[q].frases.length) return irPara(paragrafos[q].primeira);
      return irPara(0);
    }
    for (let q = p + 1; q < paragrafos.length; q++) if (paragrafos[q].frases.length) return irPara(paragrafos[q].primeira);
  }

  // O Chrome às vezes não dispara "onend"; este vigia destrava a leitura.
  setInterval(() => {
    if (modoServidorAtivo()) return;
    if (!estado.tocando || !estado.esperandoFala || !fala) return;
    const decorrido = Date.now() - estado.inicioFala;
    const passo = estado.passo;
    if (decorrido > 1500 && !fala.speaking && !fala.pending) {
      depoisDaFrase(passo);
      return;
    }
    // Vozes online do Google no Chrome de computador param após ~15 s.
    const voz = vozAtual();
    if (voz && /google/i.test(voz.name) && !voz.localService && !/android/i.test(navigator.userAgent) && decorrido > 10000 && fala.speaking) {
      fala.pause();
      fala.resume();
    }
  }, 1000);

  setInterval(() => {
    const el = $('timerInfo');
    if (!estado.tocando || !estado.fimTimer) { el.hidden = true; return; }
    const resta = Math.max(0, Math.ceil((estado.fimTimer - Date.now()) / 60000));
    el.hidden = false;
    el.textContent = `para em ${resta} min`;
  }, 1000);

  async function pedirTelaLigada() {
    try {
      if ('wakeLock' in navigator && !estado.wakeLock) {
        estado.wakeLock = await navigator.wakeLock.request('screen');
        estado.wakeLock.addEventListener('release', () => { estado.wakeLock = null; });
      }
    } catch (e) { /* sem permissão: segue sem manter a tela ligada */ }
  }
  function liberarTela() {
    try { if (estado.wakeLock) estado.wakeLock.release(); } catch (e) { /* ignora */ }
    estado.wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.tocando) pedirTelaLigada();
  });

  // ------------------------------------------------------------ abrir arquivos

  function idDoArquivo(arquivo) {
    return [arquivo.name, arquivo.size, arquivo.lastModified].join('|');
  }

  function mostrarCarregando(texto, fracao) {
    $('carregando').hidden = false;
    $('carregandoTexto').textContent = texto;
    $('carregandoBarra').style.width = `${Math.round((fracao || 0) * 100)}%`;
  }

  async function abrirArquivo(arquivo) {
    if (!arquivo) return;
    const ehTexto = /\.txt$/i.test(arquivo.name) || arquivo.type === 'text/plain';
    const titulo = arquivo.name.replace(/\.(pdf|txt)$/i, '');
    try {
      let paragrafos;
      let paginas = 1;
      if (ehTexto) {
        paragrafos = Texto.textoParaParagrafos(await arquivo.text());
      } else {
        if (!window.pdfjsLib) throw new Error('O leitor de PDF não carregou. Verifique a conexão e recarregue a página.');
        mostrarCarregando('Abrindo o PDF…', 0);
        const dados = new Uint8Array(await arquivo.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: dados, isEvalSupported: false }).promise;
        paginas = pdf.numPages;
        const lidas = [];
        for (let n = 1; n <= paginas; n++) {
          const pagina = await pdf.getPage(n);
          const conteudo = await pagina.getTextContent();
          lidas.push({
            items: conteudo.items.filter((it) => typeof it.str === 'string').map((it) => ({
              str: it.str,
              x: it.transform[4],
              y: it.transform[5],
              w: it.width,
              h: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
            })),
          });
          pagina.cleanup();
          if (n % 3 === 0 || n === paginas) {
            mostrarCarregando(`Lendo página ${n} de ${paginas}…`, n / paginas);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        pdf.destroy();
        paragrafos = Texto.paginasParaParagrafos(lidas, { removerCabecalhos: config.removerCabecalhos });
        const letras = paragrafos.reduce((s, p) => s + p.texto.length, 0);
        if (letras < 40 * paginas && letras < 400) {
          $('carregando').hidden = true;
          avisar('Este PDF parece ser uma imagem escaneada, sem texto selecionável. Ele precisa passar por OCR antes (por exemplo, no Google Drive: abrir com Google Docs).', 9000);
          if (!letras) return;
        }
      }
      const doc = { id: idDoArquivo(arquivo), titulo, paginas, paragrafos };
      $('carregando').hidden = true;
      abrirDocumento(doc);
      if (!armazenar.gravar('ultimo', { id: doc.id, titulo, paginas, paragrafos: paragrafos.map((p) => [p.texto, p.pagina, p.tipo]) })) {
        armazenar.gravar('ultimo', null);
      }
    } catch (erro) {
      console.error(erro);
      $('carregando').hidden = true;
      const senha = erro && erro.name === 'PasswordException';
      avisar(senha ? 'Este PDF tem senha. Remova a proteção e tente de novo.' : 'Não consegui ler este arquivo. ' + (erro.message || ''), 7000);
    }
  }

  function abrirExemplo() {
    abrirDocumento({ id: 'exemplo', titulo: EXEMPLO.titulo, paginas: 1, exemplo: true, paragrafos: Texto.textoParaParagrafos(EXEMPLO.texto) }, { silencioso: true });
  }

  // ------------------------------------------------------------ busca

  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function buscar(termo, deTras) {
    if (!termo.trim() || !estado.doc) return;
    const alvo = semAcento(termo.trim()).replace(/\s+/g, ' ');
    const { frases } = estado.doc;
    const n = frases.length;
    for (let k = 1; k <= n; k++) {
      const i = (estado.pos + (deTras ? -k : k) + n * 2) % n;
      if (semAcento(frases[i].texto).replace(/\s+/g, ' ').includes(alvo)) {
        irPara(i);
        const el = spanDaFrase(i);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('achado');
          setTimeout(() => el.classList.remove('achado'), 1800);
        }
        return;
      }
    }
    avisar(`“${termo}” não aparece no texto.`);
  }

  // ------------------------------------------------------------ ajustes

  const formatar = (n, casas = 1) => n.toFixed(casas).replace('.', ',');
  function rotuloPausa(v) {
    if (v === 0) return 'Nenhuma';
    if (v < 0.75) return 'Curta';
    if (v <= 1.25) return 'Normal';
    if (v <= 2) return 'Longa';
    return 'Bem longa';
  }

  function preencherAjustes() {
    $('velocidade').value = config.velocidade;
    $('tom').value = config.tom;
    $('pausas').value = config.pausas;
    $('legislacao').checked = config.legislacao;
    $('pularNotas').checked = config.pularNotas;
    $('removerCabecalhos').checked = config.removerCabecalhos;
    $('seguirTexto').checked = config.seguirTexto;
    $('dicionario').value = config.dicionario;
    $('timer').value = String(config.timer);
    $('vozModo').value = config.vozModo;
    $('servidorUrl').value = config.servidorUrl || '';
    $('servidorToken').value = config.servidorToken || '';
    preencherVozesServidor(config.servidorVoz ? [{ id: config.servidorVoz, nome: config.servidorVoz }] : []);
    atualizarBlocosVoz();
    atualizarRotulos();
  }

  function atualizarBlocosVoz() {
    const online = config.vozModo === 'servidor';
    $('blocoAparelho').hidden = online;
    $('blocoServidor').hidden = !online;
    $('campoTom').hidden = online; // o tom não se aplica à voz do servidor
  }

  function preencherVozesServidor(lista) {
    const sel = $('servidorVoz');
    const atual = config.servidorVoz;
    const itens = (lista && lista.length) ? lista : (atual ? [{ id: atual, nome: atual }] : []);
    sel.innerHTML = itens.length
      ? itens.map((v) => `<option value="${v.id}">${v.nome || v.id}</option>`).join('')
      : '<option value="">(teste a conexão para listar as vozes)</option>';
    if (atual && itens.some((v) => v.id === atual)) sel.value = atual;
  }

  function atualizarRotulos() {
    $('velocidadeValor').textContent = formatar(config.velocidade, 2).replace(/0$/, '') + '×';
    $('tomValor').textContent = formatar(config.tom);
    $('pausasValor').textContent = rotuloPausa(config.pausas);
    const sel = $('velocidadeRapida');
    const lista = VELOCIDADES.includes(config.velocidade) ? VELOCIDADES : [...VELOCIDADES, config.velocidade].sort((a, b) => a - b);
    sel.innerHTML = lista.map((v) => `<option value="${v}">${formatar(v, 2).replace(/0$/, '')}×</option>`).join('');
    sel.value = String(config.velocidade);
  }

  function mudarVelocidade(v) {
    config.velocidade = Math.min(2.5, Math.max(0.5, Math.round(v * 100) / 100));
    salvarConfig();
    $('velocidade').value = config.velocidade;
    atualizarRotulos();
    atualizarRestante();
    if (estado.tocando) {
      if (modoServidorAtivo() && estado.audio) estado.audio.playbackRate = clampRate(config.velocidade);
      else irPara(estado.pos); // recomeça a frase na nova velocidade
    }
  }

  // ------------------------------------------------------------ eventos

  $('arquivo').addEventListener('change', (e) => {
    abrirArquivo(e.target.files[0]);
    e.target.value = '';
  });
  $('btPlay').addEventListener('click', alternar);
  $('btFraseAnterior').addEventListener('click', () => irPara(estado.pos - 1));
  $('btProximaFrase').addEventListener('click', () => irPara(estado.pos + 1));
  $('btParagrafoAnterior').addEventListener('click', () => paragrafoRelativo(-1));
  $('btProximoParagrafo').addEventListener('click', () => paragrafoRelativo(1));
  $('btRepetir').addEventListener('click', () => {
    estado.repetir = !estado.repetir;
    $('btRepetir').setAttribute('aria-pressed', String(estado.repetir));
    avisar(estado.repetir ? 'Repetindo a frase atual. Toque de novo para seguir.' : 'Leitura contínua.', 2200);
  });
  $('velocidadeRapida').addEventListener('change', (e) => mudarVelocidade(Number(e.target.value)));
  $('voltarTrecho').addEventListener('click', () => {
    estado.rolagemManual = 0;
    const el = spanDaFrase(estado.pos);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('leitura').addEventListener('click', (e) => {
    const s = e.target.closest('.f');
    if (!s || String(window.getSelection()).length) return;
    irPara(Number(s.dataset.i), { tocar: !estado.tocando });
  });

  $('irPagina').addEventListener('change', (e) => {
    const n = Number(e.target.value);
    const p = estado.doc.paragrafos.find((q) => q.pagina >= n && q.frases.length);
    if (p) {
      irPara(p.primeira);
      const marca = $('pagina-' + p.pagina);
      (marca || spanDaFrase(p.primeira)).scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });

  $('busca').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); buscar(e.target.value, e.shiftKey); }
    if (e.key === 'Escape') e.target.blur();
  });

  ['wheel', 'touchmove'].forEach((ev) => window.addEventListener(ev, () => { estado.rolagemManual = Date.now(); }, { passive: true }));
  window.addEventListener('scroll', () => {
    requestAnimationFrame(atualizarBotaoVoltar);
  }, { passive: true });

  $('abrirAjustes').addEventListener('click', () => {
    preencherAjustes();
    const d = $('ajustes');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  });
  $('ajustes').addEventListener('click', (e) => { if (e.target === $('ajustes')) $('ajustes').close(); });
  $('ajustesForm').addEventListener('submit', (e) => { e.preventDefault(); $('ajustes').close(); });

  $('voz').addEventListener('change', (e) => {
    config.voz = e.target.value;
    salvarConfig();
    if (estado.tocando) irPara(estado.pos);
  });
  $('vozModo').addEventListener('change', (e) => {
    const tocava = estado.tocando;
    parar();
    config.vozModo = e.target.value;
    salvarConfig();
    atualizarBlocosVoz();
    atualizarRestante();
    if (tocava) tocar();
  });
  $('servidorUrl').addEventListener('change', (e) => { config.servidorUrl = e.target.value.trim(); salvarConfig(); });
  $('servidorToken').addEventListener('change', (e) => { config.servidorToken = e.target.value; salvarConfig(); });
  $('servidorVoz').addEventListener('change', (e) => {
    config.servidorVoz = e.target.value;
    salvarConfig();
    if (estado.tocando && modoServidorAtivo()) irPara(estado.pos);
  });
  $('testarConexao').addEventListener('click', async () => {
    config.servidorUrl = $('servidorUrl').value.trim();
    config.servidorToken = $('servidorToken').value;
    salvarConfig();
    if (!config.servidorUrl) { avisar('Preencha o endereço do servidor primeiro.'); return; }
    $('servidorDica').textContent = 'Conectando…';
    try {
      const vozes = await VozServidor.vozes(paramsServidor());
      if (!vozes.length) { $('servidorDica').textContent = 'Conectou, mas o servidor não tem nenhuma voz instalada.'; return; }
      preencherVozesServidor(vozes);
      if (!config.servidorVoz || !vozes.some((v) => v.id === config.servidorVoz)) {
        config.servidorVoz = vozes[0].id;
        $('servidorVoz').value = config.servidorVoz;
        salvarConfig();
      }
      $('servidorDica').textContent = `Conectado. ${vozes.length} voz(es) disponível(is).`;
    } catch (err) {
      $('servidorDica').textContent = err && err.rede
        ? 'Não conectou. Confira o endereço (precisa ser https) e se o servidor está ligado.'
        : `Não conectou (${(err && err.status) || 'erro'}). Confira o endereço e o token.`;
    }
  });
  $('velocidade').addEventListener('input', (e) => { config.velocidade = Number(e.target.value); atualizarRotulos(); });
  $('velocidade').addEventListener('change', (e) => mudarVelocidade(Number(e.target.value)));
  $('tom').addEventListener('input', (e) => { config.tom = Number(e.target.value); atualizarRotulos(); salvarConfig(); });
  $('pausas').addEventListener('input', (e) => { config.pausas = Number(e.target.value); atualizarRotulos(); salvarConfig(); });
  ['legislacao', 'pularNotas', 'removerCabecalhos', 'seguirTexto'].forEach((id) => {
    $(id).addEventListener('change', (e) => { config[id] = e.target.checked; salvarConfig(); });
  });
  $('dicionario').addEventListener('input', (e) => {
    config.dicionario = e.target.value;
    estado.dicionario = Texto.lerDicionario(config.dicionario);
    salvarConfig();
  });
  $('timer').addEventListener('change', (e) => {
    config.timer = Number(e.target.value);
    salvarConfig();
    estado.fimTimer = estado.tocando && config.timer ? Date.now() + config.timer * 60000 : 0;
  });
  $('testarVoz').addEventListener('click', async () => {
    parar();
    const amostra = 'Art. 5º, LXXIII, da CF/88: qualquer cidadão é parte legítima para propor ação popular. § 1º O INSS concederá o benefício, conforme a Lei nº 8.213/91.';
    const texto = Texto.falar(amostra, opcoesFala());
    if (modoServidorAtivo()) {
      desbloquearAudio();
      try {
        const url = await VozServidor.sintetizar(texto, paramsServidor());
        estado.audio.src = url;
        estado.audio.playbackRate = clampRate(config.velocidade);
        estado.audio.onended = null;
        estado.audio.onerror = null;
        await estado.audio.play();
      } catch (err) { tratarErroServidor(err); }
      return;
    }
    if (!fala) return;
    const u = new SpeechSynthesisUtterance(texto);
    const voz = vozAtual();
    if (voz) u.voice = voz;
    u.lang = voz ? voz.lang : 'pt-BR';
    u.rate = config.velocidade;
    u.pitch = config.tom;
    estado.utterance = u;
    fala.speak(u);
  });

  // ------------------------------------------------------------ índice

  function resumoTexto(t, max) {
    t = t.replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  }

  function abrirDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }

  function abrirIndice() {
    if (!estado.doc) return;
    const lista = $('indiceLista');
    lista.innerHTML = '';
    const itens = estado.doc.paragrafos.filter((p) => (p.tipo === 'titulo' || p.tipo === 'artigo') && p.frases.length);
    if (!itens.length) {
      const p = document.createElement('p');
      p.className = 'dica';
      p.textContent = 'Este documento não tem títulos ou artigos destacados para listar.';
      lista.appendChild(p);
    }
    for (const it of itens) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'indice-item indice-' + it.tipo;
      b.textContent = resumoTexto(it.texto, it.tipo === 'titulo' ? 70 : 90);
      b.addEventListener('click', () => {
        $('indice').close();
        irPara(it.primeira);
        const el = spanDaFrase(it.primeira);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      lista.appendChild(b);
    }
    abrirDialog($('indice'));
  }

  $('btIndice').addEventListener('click', abrirIndice);
  $('fecharIndice').addEventListener('click', () => $('indice').close());
  $('indice').addEventListener('click', (e) => { if (e.target === $('indice')) $('indice').close(); });

  // ------------------------------------------------------------ comandos de voz

  const ACOES_COMANDO = {
    parar: () => parar(),
    tocar: () => { if (!estado.tocando) tocar(); },
    repetir: () => irPara(estado.pos, { tocar: true }),
    proxima: () => irPara(estado.pos + 1, { tocar: estado.tocando }),
    anterior: () => irPara(estado.pos - 1, { tocar: estado.tocando }),
    proximoParagrafo: () => paragrafoRelativo(1),
    paragrafoAnterior: () => paragrafoRelativo(-1),
    inicio: () => irPara(0, { tocar: true }),
    maisRapido: () => mudarVelocidade(config.velocidade + 0.1),
    maisDevagar: () => mudarVelocidade(config.velocidade - 0.1),
  };
  const ROTULO_COMANDO = {
    parar: 'pausar', tocar: 'continuar', repetir: 'repetir frase', proxima: 'próxima frase',
    anterior: 'frase anterior', proximoParagrafo: 'próximo trecho', paragrafoAnterior: 'trecho anterior',
    inicio: 'começar do início', maisRapido: 'mais rápido', maisDevagar: 'mais devagar',
  };

  function pararComandos() {
    estado.ouvindo = false;
    Comandos.parar();
    $('btComandos').setAttribute('aria-pressed', 'false');
  }

  function alternarComandos() {
    if (!Comandos.suportado()) {
      avisar('Este navegador não reconhece comandos de voz. Funciona melhor no Chrome (Android/computador).', 6000);
      return;
    }
    if (estado.ouvindo) { pararComandos(); avisar('Comandos de voz desligados.', 1800); return; }
    estado.ouvindo = true;
    $('btComandos').setAttribute('aria-pressed', 'true');
    Comandos.iniciar({
      onInicio: () => avisar('Ouvindo. Diga: pausar, continuar, repetir, próxima, voltar, próximo artigo, começar do início, mais rápido, mais devagar.', 5000),
      onComando: (id) => { const f = ACOES_COMANDO[id]; if (f) { f(); avisar('🎙️ ' + (ROTULO_COMANDO[id] || id), 1400); } },
      onErro: (tipo) => {
        if (tipo === 'not-allowed' || tipo === 'service-not-allowed') { avisar('Preciso da permissão do microfone para os comandos de voz.', 5000); pararComandos(); }
        else if (tipo === 'audio-capture') { avisar('Não achei um microfone disponível.', 4000); pararComandos(); }
        else if (tipo === 'sem-suporte') { pararComandos(); }
      },
      onFim: () => { $('btComandos').setAttribute('aria-pressed', 'false'); },
    });
  }

  $('btComandos').addEventListener('click', alternarComandos);

  document.addEventListener('keydown', (e) => {
    const alvo = e.target;
    if (alvo.closest && alvo.closest('input, textarea, select, dialog[open]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); alternar(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? paragrafoRelativo(1) : irPara(estado.pos + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? paragrafoRelativo(-1) : irPara(estado.pos - 1); }
    else if (e.key === 'r' || e.key === 'R') $('btRepetir').click();
    else if (e.key === '+' || e.key === '=') mudarVelocidade(config.velocidade + 0.1);
    else if (e.key === '-' || e.key === '_') mudarVelocidade(config.velocidade - 0.1);
  });

  // Arrastar e soltar
  let arrastando = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    arrastando++;
    $('soltar').hidden = false;
  });
  window.addEventListener('dragleave', () => { if (--arrastando <= 0) { arrastando = 0; $('soltar').hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    arrastando = 0;
    $('soltar').hidden = true;
    const f = e.dataTransfer?.files?.[0];
    if (f) abrirArquivo(f);
  });

  window.addEventListener('pagehide', () => { if (estado.doc) armazenar.gravar('pos:' + estado.doc.id, estado.pos); });

  // ------------------------------------------------------------ início

  if (window.pdfjsLib) {
    // pdf.worker.min.js já foi carregado na página: o PDF é lido sem Worker separado.
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  atualizarRotulos();
  if (fala) {
    carregarVozes();
    fala.addEventListener?.('voiceschanged', carregarVozes);
    fala.cancel();
  } else {
    $('vozDica').textContent = 'Este navegador não oferece leitura em voz.';
  }

  const ultimo = armazenar.ler('ultimo', null);
  if (ultimo && ultimo.paragrafos && ultimo.paragrafos.length) {
    abrirDocumento({
      id: ultimo.id,
      titulo: ultimo.titulo,
      paginas: ultimo.paginas,
      paragrafos: ultimo.paragrafos.map(([texto, pagina, tipo]) => ({ texto, pagina, tipo })),
    });
  } else {
    abrirExemplo();
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
