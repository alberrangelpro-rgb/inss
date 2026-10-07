#!/usr/bin/env bash
set -e
mkdir -p "$VOZ_DIR" "$CACHE_DIR"

baixar() {
  local nome="$1" url="$2"
  if [ ! -f "$VOZ_DIR/$nome.onnx" ]; then
    echo "Baixando voz $nome…"
    curl -fL "$url.onnx"      -o "$VOZ_DIR/$nome.onnx"
    curl -fL "$url.onnx.json" -o "$VOZ_DIR/$nome.onnx.json"
  fi
}

# Vozes pt-BR do Piper (code aberto). Baixadas uma vez e guardadas no volume.
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"
baixar "pt_BR-faber-medium" "$BASE/faber/medium/pt_BR-faber-medium"
baixar "pt_BR-edresson-low" "$BASE/edresson/low/pt_BR-edresson-low"

exec python3 /app/server.py
