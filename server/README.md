# Servidor de voz — Estudo em Voz

Gera a voz premium do app. Recebe um texto e devolve o áudio (MP3) usando a
voz neural de código aberto **Piper**. Guarda em cache o que já foi gerado,
então **não há custo por uso**: o único custo é o servidor onde isto roda.

Lê **qualquer** texto que o app mandar (não é uma biblioteca fixa).

## O que você precisa

- Um servidor Linux barato (VPS) com **Docker**. Ex.: Hetzner, Contabo,
  DigitalOcean, Oracle Cloud (tem máquina grátis). ~2 vCPU já roda bem.
- **HTTPS** no endereço do servidor (obrigatório — o app roda em https e o
  navegador bloqueia chamar um servidor http). O jeito mais fácil, sem
  domínio nem configurar certificado, é o **Cloudflare Tunnel** (abaixo).

## Subir o servidor

```bash
cd server
docker compose up -d --build
```

Na primeira vez ele baixa as vozes pt-BR (uns 60 MB) e sobe na porta 8080.
Teste local:

```bash
curl http://localhost:8080/saude
# deve listar as vozes: pt_BR-faber-medium, pt_BR-edresson-low
curl -X POST http://localhost:8080/tts -H 'Content-Type: application/json' \
  -d '{"texto":"Artigo primeiro. A Previdência Social tem por fim assegurar."}' --output teste.mp3
```

### Proteger com um token (recomendado)

```bash
TOKEN=uma-senha-longa docker compose up -d --build
```

Depois, no app, preencha o mesmo token no campo "Token".

## HTTPS com Cloudflare Tunnel (grátis, sem domínio próprio)

1. Crie uma conta na Cloudflare e, em **Zero Trust → Networks → Tunnels**,
   crie um túnel. Em "Public Hostname", aponte para `http://voz:8080`.
2. Copie o **token do túnel** e rode:

```bash
TUNNEL_TOKEN=seu-token-aqui docker compose --profile tunnel up -d --build
```

A Cloudflare te dá um endereço `https://algo.trycloudflare…` ou o subdomínio
que você escolher. **Esse endereço https** é o que vai no app.

### Alternativa: domínio próprio + Caddy

Se tiver um domínio apontando para o VPS, use um proxy reverso com HTTPS
automático (ex.: Caddy):

```
voz.seudominio.com.br {
    reverse_proxy localhost:8080
}
```

## Ligar no app

No app **Estudo em Voz** → ajustes (engrenagem) → **Voz** → tipo
**"Voz premium (servidor próprio)"** → cole o **endereço https** do servidor
(e o token, se definiu) → **testar conexão** → escolha a voz → **Testar voz**.

## Vozes

Vêm do projeto Piper (https://github.com/rhasspy/piper). Para adicionar
outras, baixe os arquivos `.onnx` e `.onnx.json` para a pasta `vozes/` e
reinicie. Lista de vozes: https://huggingface.co/rhasspy/piper-voices

Para uma voz mais natural ("de locutor"), o próximo passo é trocar o Piper por
um motor como o XTTS — precisa de um servidor com GPU (mais caro). A estrutura
do app já aceita, é só o servidor devolver o MP3 no mesmo formato.

## Endpoints

- `GET /saude` → `{ ok, vozes:[{id,nome}], padrao }`
- `POST /tts` com `{ "texto": "...", "voz": "pt_BR-faber-medium" }` → áudio MP3
- `GET /tts?texto=...&voz=...` → áudio MP3

## Variáveis de ambiente

| Variável | Padrão | O que faz |
|---|---|---|
| `TOKEN` | (vazio) | Se definido, exige `Authorization: Bearer <token>` |
| `VOZ_PADRAO` | pt_BR-faber-medium | Voz usada quando o app não especifica |
| `MAX_CONCORRENTE` | 2 | Quantas sínteses ao mesmo tempo |
| `MAX_CHARS` | 1200 | Tamanho máximo de texto por requisição |
| `PORT` | 8080 | Porta do servidor |
