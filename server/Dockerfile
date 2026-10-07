FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir piper-tts==1.2.0

ENV VOZ_DIR=/vozes CACHE_DIR=/cache PORT=8080 VOZ_PADRAO=pt_BR-faber-medium
WORKDIR /app
COPY server.py /app/server.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
VOLUME ["/vozes", "/cache"]
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
