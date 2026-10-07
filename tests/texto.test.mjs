import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../js/texto.js');
const falar = (t, o) => T.falar(t, o);

test('artigos: ordinal até o nono, cardinal a partir do 10', () => {
  assert.equal(falar('Art. 1º A Previdência Social tem por fim assegurar.'), 'Artigo primeiro. A Previdência Social tem por fim assegurar.');
  assert.equal(falar('Art. 18. O Regime Geral compreende:'), 'Artigo 18. O Regime Geral compreende:');
  assert.equal(falar('Art. 1.015. Cabe agravo.'), 'Artigo 1015. Cabe agravo.');
  assert.match(falar('conforme o art. 29-A da lei'), /artigo 29 A da lei/);
  assert.match(falar('nos termos do art. 201 da CF.'), /artigo 201 da CF\./);
});

test('parágrafos, incisos e alíneas', () => {
  assert.equal(falar('§ 1º Somente poderão beneficiar-se os segurados.'), 'parágrafo primeiro. Somente poderão beneficiar-se os segurados.');
  assert.match(falar('§§ 2º e 3º (Revogados).'), /^parágrafos segundo e terceiro, Revogados\.$/);
  assert.equal(falar('I - quanto ao segurado:'), 'Inciso 1. quanto ao segurado:');
  assert.equal(falar('e) auxílio-doença;'), 'Alínea ê. auxílio-doença;');
  assert.match(falar('art. 5º, LXXIII, da CF/88'), /artigo quinto, inciso 73, da CF de 1988/);
  assert.match(falar('os incisos I a IV do caput'), /incisos 1 a 4 do caput/);
  assert.equal(falar('I - quanto ao segurado:', { legislacao: false }), 'I, quanto ao segurado:');
});

test('notas de alteração são puladas, revogação não', () => {
  assert.equal(falar('c) aposentadoria; (Redação dada pela Lei Complementar nº 123, de 2006)'), 'Alínea cê. aposentadoria;');
  assert.match(falar('Art. 3º (Revogado pela Lei nº 9.032, de 1995)'), /Revogado/);
  assert.match(falar('texto (Incluído pela Lei nº 13.846, de 2019)', { pularNotas: false }), /Incluído/);
});

test('números de normas, datas, dinheiro e ordinais', () => {
  assert.match(falar('Lei nº 8.213/91'), /Lei número 8213, de 1991/);
  assert.match(falar('EC nº 103/2019 e EC 20/98'), /EC número 103, de 2019 e EC 20, de 1998/);
  assert.match(falar('em 01/01/2024'), /primeiro de janeiro de 2024/);
  assert.match(falar('R$ 1.412,00 e R$ 10,50'), /1412 reais e 10 reais e 50 centavos/);
  assert.match(falar('o 13º salário na 2ª parcela'), /décimo terceiro salário na segunda parcela/);
  assert.equal(T.ordinal(125), 'centésimo vigésimo quinto');
  assert.equal(T.ordinal(21, true), 'vigésima primeira');
});

test('títulos em maiúsculas e siglas', () => {
  assert.equal(falar('CAPÍTULO II DAS PRESTAÇÕES EM GERAL'), 'capítulo 2 das prestações em geral');
  assert.match(falar('O INSS NÃO concede'), /O INSS não concede/);
  const dicionario = T.lerDicionario('INSS = I N S S\nCF = Constituição Federal');
  assert.match(falar('O INSS e a CF/88', { dicionario }), /O I N S S e a Constituição Federal de 1988/);
});

test('abreviações não quebram frases', () => {
  const f = T.dividirFrases('Art. 18. O Regime compreende o seguinte. Conforme o art. 5º da Lei nº 8.213, o Dr. João decidiu. Outra frase.');
  assert.deepEqual(f, ['Art. 18. O Regime compreende o seguinte.', 'Conforme o art. 5º da Lei nº 8.213, o Dr. João decidiu.', 'Outra frase.']);
});

test('frases longas são divididas em partes menores', () => {
  const longa = 'O segurado especial, assim entendido o produtor rural, o pescador artesanal e seus assemelhados, que exerçam suas atividades em regime de economia familiar; o cônjuge ou companheiro, bem como os filhos maiores de dezesseis anos de idade, que trabalhem comprovadamente com o grupo familiar respectivo.';
  const partes = T.dividirFrases(longa);
  assert.ok(partes.length > 1);
  assert.ok(partes.every((p) => p.length <= T.LIMITE_FRASE));
  assert.equal(partes.join(' '), longa);
});

test('linhas quebradas: hifenização e estrutura', () => {
  const ps = T.textoParaParagrafos('Art. 1º A Previdência, mediante contribui-\nção, garante o auxílio-\ndoença e aplica-\nse ao caso. Concedê-\nlo.\nI - quanto ao\nsegurado:\na) teste;');
  assert.deepEqual(ps.map((p) => p.tipo), ['artigo', 'item', 'item']);
  assert.equal(ps[0].texto, 'Art. 1º A Previdência, mediante contribuição, garante o auxílio-doença e aplica-se ao caso. Concedê-lo.');
  assert.equal(ps[1].texto, 'I - quanto ao segurado:');
});

test('PDF: remove cabeçalho repetido e número de página, junta linhas', () => {
  const linha = (str, y) => ({ str, x: 50, y, w: str.length * 6, h: 12 });
  const pagina = (n, corpo) => ({ items: [
    linha('Apostila de Direito Previdenciário', 800),
    ...corpo.map((t, i) => linha(t, 740 - i * 16)),
    linha(String(n), 40),
  ] });
  const paginas = [
    pagina(1, ['Art. 25. A concessão das prestações depende dos seguintes', 'períodos de carência:', 'I - auxílio-doença: 12 contribuições;']),
    pagina(2, ['II - aposentadoria por idade: 180 contribui-', 'ções mensais.']),
    pagina(3, ['Parágrafo único. Em caso de parto antecipado.']),
  ];
  const ps = T.paginasParaParagrafos(paginas);
  assert.deepEqual(ps.map((p) => p.texto), [
    'Art. 25. A concessão das prestações depende dos seguintes períodos de carência:',
    'I - auxílio-doença: 12 contribuições;',
    'II - aposentadoria por idade: 180 contribuições mensais.',
    'Parágrafo único. Em caso de parto antecipado.',
  ]);
  assert.deepEqual(ps.map((p) => p.pagina), [1, 1, 2, 3]);
});
