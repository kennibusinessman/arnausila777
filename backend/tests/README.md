# Тесты backend

Pytest-набор гоняется против отдельной БД `crm_test` в том же Postgres-контейнере
(создаётся/пересоздаётся автоматически на каждый запуск). Приложение вызывается
напрямую через `httpx.ASGITransport` — поднимать uvicorn не нужно.

## Запуск (через Docker)

```bash
# контейнеры подняты: docker compose up -d
docker compose exec backend pip install -r requirements-dev.txt   # один раз на жизнь контейнера
docker compose exec backend python -m pytest
```

`requirements-dev.txt` (pytest, pytest-asyncio, httpx) намеренно отделён от
`requirements.txt`, чтобы тестовые зависимости не попадали в прод-образ.

## Что покрыто

- `test_auth` — логин, неверный пароль, защита эндпоинтов, `/auth/me`.
- `test_orders` — расчёт сумм, переходы статусов, scope менеджера.
- `test_shifts` — движение склада при approve + атомарный откат при нехватке сырья.
- `test_expenses` — `PURCHASE_IN` при approve, запрет позиций для не-складских категорий.
- `test_shipments` — заказ → SHIPPED, овершип, нехватка остатка (откат), отмена с возвратом.
- `test_payments_reports` — жизненный цикл долга, суммы dashboard в обоих режимах выручки.
- `test_audit_rbac` — запись аудита, ролевой доступ к аудиту и отчётам.

Каждый тест получает чистую БД (TRUNCATE) и засеянного суперадмина
(`admin@test.com` / `admin12345`).
