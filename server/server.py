#!/usr/bin/env python3
"""
Servidor de voz do "Estudo em Voz".

Recebe um texto e devolve o áudio (MP3) gerado por uma voz neural de código
aberto (Piper). Guarda em cache o que já foi gerado, então reler o mesmo
trecho (ou o mesmo artigo de lei que todo mundo estuda) não gasta CPU de novo.

Não cobra por caractere: o custo é só o servidor onde isto roda.
"""
import os
import re
import json
import glob
import hashlib
import subprocess
import threading
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VOZ_DIR = os.environ.get("VOZ_DIR", "/vozes")
CACHE_DIR = os.environ.get("CACHE_DIR", "/cache")
TOKEN = os.environ.get("TOKEN", "").strip()
PORT = int(os.environ.get("PORT", "8080"))
MAX_CONCORRENTE = int(os.environ.get("MAX_CONCORRENTE", "2"))
MAX_CHARS = int(os.environ.get("MAX_CHARS", "1200"))
VOZ_PADRAO = os.environ.get("VOZ_PADRAO", "").strip()

os.makedirs(CACHE_DIR, exist_ok=True)
_sem = threading.Semaphore(MAX_CONCORRENTE)


def descobrir_vozes():
    vozes = {}
    for onnx in sorted(glob.glob(os.path.join(VOZ_DIR, "**", "*.onnx"), recursive=True)):
        vid = os.path.splitext(os.path.basename(onnx))[0]
        vozes[vid] = onnx
    return vozes


VOZES = descobrir_vozes()


def voz_padrao():
    if VOZ_PADRAO and VOZ_PADRAO in VOZES:
        return VOZ_PADRAO
    return next(iter(VOZES), None)


def taxa_amostragem(onnx):
    try:
        with open(onnx + ".json", encoding="utf-8") as f:
            return int(json.load(f)["audio"]["sample_rate"])
    except Exception:
        return 22050


def sintetizar(texto, onnx):
    sr = taxa_amostragem(onnx)
    piper = subprocess.run(
        ["piper", "--model", onnx, "--output-raw"],
        input=texto.encode("utf-8"),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if piper.returncode != 0 or not piper.stdout:
        raise RuntimeError("piper: " + piper.stderr.decode("utf-8", "ignore")[:300])
    ff = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
         "-codec:a", "libmp3lame", "-q:a", "5", "-f", "mp3", "pipe:1"],
        input=piper.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if ff.returncode != 0 or not ff.stdout:
        raise RuntimeError("ffmpeg: " + ff.stderr.decode("utf-8", "ignore")[:300])
    return ff.stdout


def audio_para(texto, vid):
    onnx = VOZES[vid]
    chave = hashlib.sha256((vid + "|" + texto).encode("utf-8")).hexdigest()
    destino = os.path.join(CACHE_DIR, chave + ".mp3")
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        with open(destino, "rb") as f:
            return f.read()
    with _sem:
        if os.path.exists(destino) and os.path.getsize(destino) > 0:
            with open(destino, "rb") as f:
                return f.read()
        dados = sintetizar(texto, onnx)
        tmp = destino + ".tmp"
        with open(tmp, "wb") as f:
            f.write(dados)
        os.replace(tmp, destino)
        return dados


class Handler(BaseHTTPRequestHandler):
    server_version = "EstudoEmVoz/1.0"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _audio(self, dados):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", "public, max-age=31536000")
        self.end_headers()
        self.wfile.write(dados)

    def _autorizado(self):
        if not TOKEN:
            return True
        if self.headers.get("Authorization", "") == "Bearer " + TOKEN:
            return True
        return self._q.get("token", [None])[0] == TOKEN

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        self._q = parse_qs(u.query)
        if u.path in ("/", "/saude"):
            return self._json(200, {
                "ok": True,
                "vozes": [{"id": k, "nome": k} for k in VOZES],
                "padrao": voz_padrao(),
            })
        if u.path == "/tts":
            if not self._autorizado():
                return self._json(401, {"erro": "não autorizado"})
            texto = (self._q.get("texto", [""])[0] or "").strip()
            vid = (self._q.get("voz", [""])[0] or "").strip() or voz_padrao()
            return self._responder(texto, vid)
        return self._json(404, {"erro": "rota desconhecida"})

    def do_POST(self):
        u = urlparse(self.path)
        self._q = parse_qs(u.query)
        if u.path != "/tts":
            return self._json(404, {"erro": "rota desconhecida"})
        if not self._autorizado():
            return self._json(401, {"erro": "não autorizado"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            corpo = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._json(400, {"erro": "json inválido"})
        texto = (corpo.get("texto") or "").strip()
        vid = (corpo.get("voz") or "").strip() or voz_padrao()
        return self._responder(texto, vid)

    def _responder(self, texto, vid):
        if not texto:
            return self._json(400, {"erro": "texto vazio"})
        if not VOZES:
            return self._json(503, {"erro": "nenhuma voz instalada no servidor"})
        if vid not in VOZES:
            return self._json(400, {"erro": "voz desconhecida: " + str(vid)})
        if len(texto) > MAX_CHARS:
            texto = texto[:MAX_CHARS]
        try:
            dados = audio_para(texto, vid)
        except Exception as e:
            return self._json(500, {"erro": str(e)[:300]})
        return self._audio(dados)


if __name__ == "__main__":
    print("Estudo em Voz — servidor de voz na porta %d | vozes: %s"
          % (PORT, ", ".join(VOZES) or "NENHUMA (instale um modelo em %s)" % VOZ_DIR),
          flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
