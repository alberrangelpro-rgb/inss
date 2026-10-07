import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Comandos = require('../js/comandos.js');
const i = (t) => Comandos.interpretar(t);

test('comandos de parar e continuar', () => {
  assert.equal(i('pausar'), 'parar');
  assert.equal(i('pare de ler'), 'parar');
  assert.equal(i('para'), 'parar');
  assert.equal(i('continuar'), 'tocar');
  assert.equal(i('pode ler'), 'tocar');
  assert.equal(i('continua a leitura'), 'tocar');
});

test('repetir vence "ler"', () => {
  assert.equal(i('leia novamente'), 'repetir');
  assert.equal(i('de novo'), 'repetir');
  assert.equal(i('repete isso'), 'repetir');
});

test('navegação por frase e por parágrafo', () => {
  assert.equal(i('próxima'), 'proxima');
  assert.equal(i('avança'), 'proxima');
  assert.equal(i('anterior'), 'anterior');
  assert.equal(i('volta'), 'anterior');
  assert.equal(i('próximo artigo'), 'proximoParagrafo');
  assert.equal(i('pula o parágrafo'), 'proximoParagrafo');
  assert.equal(i('artigo anterior'), 'paragrafoAnterior');
});

test('começar do início vence "volta" e "começa a ler"', () => {
  assert.equal(i('começar do início'), 'inicio');
  assert.equal(i('volta ao começo'), 'inicio');
  assert.equal(i('recomeçar'), 'inicio');
  assert.equal(i('do zero'), 'inicio');
});

test('velocidade', () => {
  assert.equal(i('mais rápido'), 'maisRapido');
  assert.equal(i('acelera'), 'maisRapido');
  assert.equal(i('mais devagar'), 'maisDevagar');
  assert.equal(i('vai com calma'), 'maisDevagar');
});

test('frases sem comando devolvem null', () => {
  assert.equal(i('qual o prazo de carência'), null);
  assert.equal(i(''), null);
  assert.equal(i('aposentadoria por idade'), null);
});
