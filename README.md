# Estudo em Voz

Leitor de PDF em voz alta feito para estudar para concursos (INSS e outros).
Abre o PDF no próprio navegador, organiza o texto em parágrafos e frases e lê
com a voz do aparelho, respeitando a pontuação, a acentuação e as pausas.

Nada é enviado para servidor: o PDF é lido no seu navegador.

## O que ele faz

- **Leitura natural:** cada frase é falada separadamente, com pausa curta entre
  frases, maior entre parágrafos e maior ainda depois de títulos. O tamanho das
  pausas é ajustável.
- **Lei seca do jeito certo:**
  - `Art. 1º` → “artigo primeiro”; `Art. 18` → “artigo dezoito” (ordinal até o nono, como se lê em voz alta);
  - `§ 1º` → “parágrafo primeiro”; `§§ 2º e 3º` → “parágrafos segundo e terceiro”;
  - `I –` → “inciso 1”; `a)` → “alínea a”; `art. 5º, LXXIII` → “artigo quinto, inciso 73”;
  - `Lei nº 8.213/91` → “Lei número 8213, de 1991”; `CF/88` → “Constituição Federal de 1988”;
  - `CAPÍTULO II` → “capítulo 2”; `13º`, `2ª`, `R$ 1.412,00`, `01/01/2024`, `c/c`, `inc.`, `Dr.`…
  - pula as notas “(Redação dada pela Lei…)”, “(Incluído pela…)”, “(Vide…)” (opcional).
- **Limpeza do PDF:** junta linhas quebradas, desfaz a hifenização de fim de
  linha (“contribui-/ção” → “contribuição”, mantendo “auxílio-doença” e
  “aplica-se”) e remove cabeçalhos, rodapés e números de página repetidos.
- **Estudo:** marca-texto na frase lida, tocar em qualquer frase para ler dali,
  repetir a frase atual, voltar/avançar por frase ou parágrafo, ir para uma
  página, buscar no texto, velocidade de 0,5× a 2,5×, temporizador para parar
  sozinho e tempo estimado até o fim.
- **Continua de onde parou:** guarda a posição de cada PDF e reabre o último
  documento automaticamente.
- **Dicionário de pronúncia:** ensine siglas e palavras que a voz erra
  (`RGPS = R G P S`).

## Como usar

Abra o `index.html` por um servidor (o PDF.js precisa disso):

```bash
npm start            # http://localhost:8080
```

Ou publique a pasta no GitHub Pages (Settings › Pages › branch) e abra pelo
celular. No Chrome/Edge do celular, use “Adicionar à tela inicial” para ter o
app instalado (funciona offline depois da primeira visita).

### Qual navegador e voz usar

A qualidade depende da voz instalada no aparelho:

- **Microsoft Edge** (Windows, Android, Mac): tem vozes “Natural” em português
  (Francisca, Thalita, Antonio), as mais fluidas. Recomendado.
- **Chrome**: usa as vozes do Google; no Android instale “Serviços de fala do
  Google” e o pacote Português (Brasil).
- **Safari (iPhone/Mac)**: use as vozes “Luciana” ou “Felipe”; em Ajustes ›
  Acessibilidade › Conteúdo Falado › Vozes dá para baixar a versão “aprimorada”.

No celular, a leitura costuma parar se a tela apagar. O app pede para manter a
tela ligada enquanto lê, quando o navegador permite.

### Limitações

- PDF escaneado (imagem) não tem texto: passe por OCR antes (por exemplo,
  abrindo no Google Drive com o Google Docs).
- PDFs em duas colunas podem misturar as colunas na leitura.

## Desenvolvimento

```
index.html            página do app
css/style.css         visual
js/texto.js           extração, frases e preparação do texto para a voz (testável no Node)
js/app.js             interface, PDF.js e síntese de voz
js/exemplo.js         trecho de exemplo exibido antes de abrir um PDF
sw.js, manifest       app instalável/offline
tests/                testes do texto (npm test)
scripts/              gera dist/estudo-em-voz.html, versão em arquivo único
```

```bash
npm install
npm test
npm run build:artifact
```
