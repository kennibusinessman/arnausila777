#!/usr/bin/env bash
# Поднимает весь стек (Postgres + FastAPI в Docker, Next.js dev-сервером).
# В GitHub Codespaces сам пропишет публичные URL в конфиги и (по возможности)
# сделает порты публичными. Локально — обычный localhost.
set -euo pipefail
cd "$(dirname "$0")"

# ── 1. Определяем адреса: Codespaces или локалхост ──────────────────────────
if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  FRONT_URL="https://${CODESPACE_NAME}-3000.${DOMAIN}"
  BACK_URL="https://${CODESPACE_NAME}-8000.${DOMAIN}"
else
  FRONT_URL="http://localhost:3000"
  BACK_URL="http://localhost:8000"
fi

echo "──────────────────────────────────────────────"
echo "  Frontend → ${FRONT_URL}"
echo "  Backend  → ${BACK_URL}"
echo "──────────────────────────────────────────────"

# ── 2. Прокидываем адреса в конфиги ─────────────────────────────────────────
# Фронт обращается к бэку по этому адресу (NEXT_PUBLIC_* инлайнится dev-сервером).
echo "NEXT_PUBLIC_API_URL=${BACK_URL}" > frontend/.env.local
# Бэку разрешаем CORS с адреса фронта (+ localhost для локальной разработки).
export CORS_ORIGINS="[\"${FRONT_URL}\",\"http://localhost:3000\"]"

# ── 3. Поднимаем БД + бэкенд (Docker) ───────────────────────────────────────
echo "→ Поднимаю Postgres + FastAPI (docker compose)…"
docker compose up -d --build

# ── 4. В Codespaces делаем порты публичными (best-effort) ───────────────────
if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null 2>&1; then
  if gh codespace ports visibility 3000:public 8000:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    echo "→ Порты 3000 и 8000 → public"
  else
    echo "⚠  Не удалось авто-открыть порты. Сделай вручную: вкладка PORTS →"
    echo "   правый клик по 3000 и 8000 → Port Visibility → Public."
  fi
fi

# ── 5. Стартуем фронт (в этом терминале, с логами) ──────────────────────────
echo "→ Запускаю Next.js…  после 'Ready' открой:  ${FRONT_URL}"
echo "   Логин суперадмина:  admin@example.com  /  admin12345"
cd frontend
exec npm run dev -- -H 0.0.0.0
