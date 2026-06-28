# Временный публичный запуск через GitHub Codespaces

Бесплатно, без домена и без оплаты. Ссылка живёт, пока запущен Codespace
(засыпает после ~30 мин простоя — это нормально для «показать/потестить»).

## 1. Залить проект на GitHub (один раз)

Через GitHub CLI:

```bash
gh repo create spunbond-crm --private --source=. --remote=origin --push
```

Или вручную: создай пустой репозиторий на github.com → затем:

```bash
git remote add origin https://github.com/<твой-логин>/spunbond-crm.git
git push -u origin main
```

## 2. Открыть Codespace

На странице репозитория: зелёная кнопка **Code** → вкладка **Codespaces** →
**Create codespace on main**. Подождать, пока соберётся окружение
(`npm ci` выполнится автоматически).

## 3. Запустить стек

В терминале Codespace:

```bash
bash start.sh
```

Скрипт сам:
- пропишет публичные адреса Codespaces в `frontend/.env.local` и в CORS бэкенда;
- поднимет Postgres + FastAPI (Docker);
- попробует сделать порты **3000** и **8000** публичными;
- запустит Next.js.

## 4. Открыть приложение

Когда в логе появится `Ready`, открой адрес фронтенда
(`https://<имя>-3000.app.github.dev`) — его печатает `start.sh` в самом верху.

**Если страница не грузит данные** — значит порты не публичные. Вкладка **PORTS**
внизу → правый клик по **3000** и **8000** → **Port Visibility → Public**.

Логин суперадмина: `admin@example.com` / `admin12345`.

## Замечания
- Перед «настоящим» показом смени `JWT_SECRET` в `docker-compose.yml`.
- Бесплатный тариф Codespaces — 60–120 core-часов/мес; останови Codespace,
  когда не нужен (вкладка Codespaces → ⋯ → Stop), чтобы не тратить часы.
