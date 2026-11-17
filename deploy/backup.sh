#!/usr/bin/env bash
# Backup diário do que NÃO está no GitHub nem no Supabase: .env, dados do bot e do Uptime Kuma.
# Cron sugerido (root):  15 3 * * * /opt/neovoip/mcp_bitrix24/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")"
DEST=/opt/neovoip/backups; mkdir -p "$DEST"
tar czf "$DEST/neovoip-$(date +%F).tar.gz" .env env/*.env volumes/
find "$DEST" -name 'neovoip-*.tar.gz' -mtime +14 -delete
