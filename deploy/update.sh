#!/usr/bin/env bash
# Atualiza o código dos 3 apps e reconstrói só o que mudou.
set -euo pipefail
cd /opt/neovoip
for r in appquilometragem proposal-assistant mcp_bitrix24; do git -C "$r" pull --ff-only; done
cd mcp_bitrix24/deploy
docker compose up -d --build
docker image prune -f
docker compose ps
