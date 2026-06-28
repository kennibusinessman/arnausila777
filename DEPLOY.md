# Деплой на свой сервер (VPS + Docker + Caddy, авто-HTTPS)

Всё крутится под **одним доменом**: `/` → фронтенд, `/api` → бэкенд.
Caddy сам берёт бесплатный сертификат Let's Encrypt. CORS не нужен (один домен).
Postgres наружу не выставлен.

## 0. Что нужно
- **VPS**: 2 ГБ RAM, 1–2 vCPU, Ubuntu 22.04/24.04 (Hetzner, DigitalOcean,
  Timeweb, Selectel, ps.kz, hoster.kz и т.п.).
- **Домен** (~$10/год).

## 1. Направить домен на сервер
В панели регистратора домена добавь **A-запись**:
`@` (или поддомен, напр. `crm`) → **IP твоего VPS**.
Подожди 5–30 минут. Проверка: `ping crm.твойдомен` должен отвечать IP сервера.

## 2. Зайти на сервер и поставить Docker
```bash
ssh root@IP_СЕРВЕРА
curl -fsSL https://get.docker.com | sh
```

## 3. Забрать код
```bash
git clone https://github.com/kennibusinessman/arnausila777.git
cd arnausila777
```

## 4. Заполнить секреты
```bash
cp .env.prod.example .env.prod
nano .env.prod
```
Впиши `DOMAIN`, пароли БД и админа, а `JWT_SECRET` сгенерируй:
```bash
openssl rand -hex 32
```

## 5. Открыть порты (если включён firewall)
```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 6. Запустить
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```
Первый запуск ~3–7 мин (сборка образов). Caddy получит HTTPS-сертификат
автоматически — для этого DNS из шага 1 уже должен указывать на сервер.

## 7. Открыть приложение
`https://твойдомен` → войти под `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`
из `.env.prod`.

## Обновление после изменений в коде
```bash
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## Полезные команды
```bash
# логи всех сервисов
docker compose -f docker-compose.prod.yml logs -f
# остановить
docker compose -f docker-compose.prod.yml down
# бэкап БД
docker exec crm_db_prod pg_dump -U crm crm > backup_$(date +%F).sql
```

## Если HTTPS не поднялся
- Проверь, что A-запись домена указывает на IP сервера (`ping домен`) и
  порты 80/443 открыты — без этого Caddy не получит сертификат.
- Смотри логи Caddy: `docker compose -f docker-compose.prod.yml logs caddy`.
