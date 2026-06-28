# Архитектура CRM-системы (спанбонд)

Полная архитектура Backend + Frontend по ТЗ «CRM-система для производства и продаж
изделий из спанбонда» и дополнению «Авторизация, регистрация и система ролей».

> Источник правды по складу — журнал `stock_movements`. Остаток никогда не редактируется
> напрямую, только через движение. Все критичные операции — в одной транзакции.
> Деньги — `NUMERIC(14,2)`, количества — `NUMERIC(14,3)`, PK — `UUID`.

---

## 0. Стек

| Слой | Технологии |
|------|------------|
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, JWT, passlib[bcrypt], Uvicorn/Gunicorn |
| БД | PostgreSQL 15/16+ (`asyncpg`) |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts |
| Инфра | Docker Compose, Caddy/Nginx + Let's Encrypt, GitHub Actions |

### Роли (MVP — 5 ролей, из дополнения)

```
SUPER_ADMIN        super_admin       технический владелец, полный доступ
BOSS               boss              директор, полный бизнес-доступ
WAREHOUSE_MANAGER  warehouse_manager склад, отгрузки, приёмка (без денег)
SHIFT_MASTER       shift_master      только свои сменные отчёты
SALES_MANAGER      sales_manager     клиенты, заказы, отгрузки, оплаты, долги
```

Резерв на будущее (не реализуем в MVP): `ACCOUNTANT`, `PURCHASER`, `WORKER`,
`PRODUCTION_MANAGER`.

---

# ЧАСТЬ I. BACKEND

## 1. Структура проекта

```
backend/
  app/
    main.py                  # сборка FastAPI, роутеры, middleware, CORS, exception handlers
    core/
      config.py              # Settings (pydantic-settings): DB URL, JWT secret, TTL, CORS
      database.py            # async engine, async_session_maker, get_db() dependency, Base
      security.py            # hash/verify password, create/decode JWT (access+refresh)
      permissions.py         # UserRole enum, require_roles(), role↔module матрица
      enums.py               # все строковые enum (статусы, типы движений и т.д.)
      exceptions.py          # доменные исключения (InsufficientStock, Forbidden, NotFound...)
    models/
      base.py                # Base, UUIDMixin, TimestampMixin, SoftDeleteMixin
      user.py  client.py  product.py  material.py
      order.py             # Order, OrderItem
      shift_report.py      # ShiftReport, ShiftReportWorker/Output/Material
      warehouse.py
      stock.py             # StockMovement, StockBalance
      shipment.py          # Shipment, ShipmentItem
      payment.py
      expense.py           # ExpenseCategory, Expense, ExpenseItem
      audit_log.py
    schemas/                 # Pydantic v2 (Create / Update / Read / List / фильтры)
      common.py user.py auth.py client.py product.py material.py order.py
      shift_report.py warehouse.py stock.py shipment.py payment.py expense.py report.py
    api/
      deps.py                # get_current_user, get_current_active_user, pagination, фильтры
      router.py              # сбор всех routes под /api
      routes/
        auth.py users.py clients.py products.py materials.py orders.py
        shift_reports.py warehouses.py stock.py shipments.py payments.py
        expenses.py reports.py audit_logs.py
    services/
      auth_service.py order_service.py shift_report_service.py stock_service.py
      shipment_service.py payment_service.py expense_service.py
      report_service.py audit_service.py user_service.py client_service.py
    repositories/
      base.py                # generic CRUD repo (get/list/create/update/soft_delete)
      ... (по сущности при необходимости)
    migrations/              # Alembic (env.py, versions/)
    tests/
  scripts/
    seed.py create_superadmin.py recalc_balances.py
  alembic.ini
  Dockerfile
  docker-compose.yml
  pyproject.toml / requirements.txt
  .env.example
```

---

## 2. core/

### 2.1 config.py
`Settings` через `pydantic-settings`:
- `DATABASE_URL` (`postgresql+asyncpg://...`)
- `JWT_SECRET`, `JWT_ALGORITHM=HS256`
- `ACCESS_TOKEN_TTL_MIN=30`, `REFRESH_TOKEN_TTL_DAYS=7`
- `CORS_ORIGINS: list[str]`
- `ALLOW_NEGATIVE_STOCK: bool = False` (бизнес-настройка п.12.4)
- `REVENUE_MODE_DEFAULT: "shipments" | "payments"`

### 2.2 database.py
```python
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): ...

async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session
```

### 2.3 security.py
- `hash_password(p)`, `verify_password(p, hash)` — passlib bcrypt.
- `create_access_token(sub, role)`, `create_refresh_token(sub)` — JWT с `exp`.
- `decode_token(token) -> TokenPayload`.
- JWT содержит `user_id`, но **роль на каждый запрос подтягивается из БД** (правило безопасности п.13).

### 2.4 enums.py
```python
class UserRole(str, Enum):
    SUPER_ADMIN="super_admin"; BOSS="boss"; WAREHOUSE_MANAGER="warehouse_manager"
    SHIFT_MASTER="shift_master"; SALES_MANAGER="sales_manager"

class ShiftType(str, Enum):          SHIFT_1; SHIFT_2
class ShiftReportStatus(str, Enum):  DRAFT; SUBMITTED; APPROVED; REJECTED
class WarehouseType(str, Enum):      RAW_MATERIALS; FINISHED_GOODS; MIXED
class ItemType(str, Enum):           PRODUCT; MATERIAL
class MovementType(str, Enum):       PURCHASE_IN; PRODUCTION_IN; PRODUCTION_OUT; SALE_OUT;
                                     ADJUSTMENT_IN; ADJUSTMENT_OUT; DEFECT_OUT; RETURN_IN
class SourceType(str, Enum):         EXPENSE; SHIFT_REPORT; SHIPMENT; MANUAL_ADJUSTMENT; RETURN
class PaymentMethod(str, Enum):      CASH; BANK_TRANSFER; CARD; OTHER
# Заказы и отгрузки статусов не имеют: заказ создаётся по факту продажи и сразу
# списывает остаток (отгрузка создаётся вместе с ним).
class ExpenseCategoryType(str, Enum):RAW_MATERIAL_PURCHASE; OPERATING; PAYROLL; EQUIPMENT; OTHER
class ExpenseStatus(str, Enum):      DRAFT; SUBMITTED; APPROVED; REJECTED; CANCELLED
```

### 2.5 permissions.py
```python
def require_roles(*allowed: UserRole):
    async def checker(user: User = Depends(get_current_active_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "Недостаточно прав")
        return user
    return checker
```
Дополнительно: `manager_scope` — для `SALES_MANAGER` ограничение «только свои клиенты»
(фильтр `manager_id == user.id` внутри сервиса).

---

## 3. Модели (SQLAlchemy 2.0, `Mapped` / `mapped_column`)

Миксины (`models/base.py`):
- `UUIDMixin`: `id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)`
- `TimestampMixin`: `created_at`, `updated_at` (server_default / onupdate)
- `SoftDeleteMixin`: `deleted_at: Mapped[datetime | None]`

| Модель | Таблица | Ключевые поля | Связи |
|--------|---------|---------------|-------|
| `User` | users | full_name, phone, email UNIQUE, password_hash, role, is_active, **must_change_password**, **last_login_at**, created_by FK→users, soft delete | clients (manager), shift_reports (master) |
| `Client` | clients | name, phone, email, company_name, address, comment, manager_id FK→users, soft delete | orders, payments, shipments |
| `Product` | products | name, sku UNIQUE, category, unit, default_price `NUMERIC(14,2)`, is_active | order_items, stock_movements |
| `Material` | materials | name, sku UNIQUE, category, unit, is_active | expense_items, stock_movements |
| `Order` | orders | order_number UNIQUE, client_id, manager_id, deadline, comment, total_amount, soft delete | items (cascade), shipments, payments |
| `OrderItem` | order_items | order_id (cascade), product_id, quantity `NUMERIC(14,3)`, unit_price, total_price | — |
| `ShiftReport` | shift_reports | shift_date, shift_type, master_id, status, comment, approved_by, approved_at | workers/outputs/materials (cascade) |
| `ShiftReportWorker` | shift_report_workers | shift_report_id (cascade), worker_id, hours_worked `NUMERIC(6,2)` | — |
| `ShiftReportOutput` | shift_report_outputs | shift_report_id (cascade), product_id, quantity, defect_quantity | — |
| `ShiftReportMaterial` | shift_report_materials | shift_report_id (cascade), material_id, quantity_used, waste_quantity | — |
| `Warehouse` | warehouses | name, type (RAW/FINISHED/MIXED), is_active | — |
| `StockMovement` | stock_movements | warehouse_id, item_type, product_id NULL, material_id NULL, movement_type, quantity, unit, unit_cost, total_cost, source_type, source_id, created_by | — |
| `StockBalance` | stock_balances | warehouse_id, item_type, product_id NULL, material_id NULL, quantity (кэш) | — |
| `Shipment` | shipments | shipment_number UNIQUE, order_id, client_id, warehouse_id, shipment_date, total_amount, created_by, soft delete | items (cascade) |
| `ShipmentItem` | shipment_items | shipment_id (cascade), product_id, quantity, unit_price, total_price | — |
| `Payment` | payments | client_id, order_id NULL, payment_date, amount, payment_method, comment, created_by, soft delete | — |
| `ExpenseCategory` | expense_categories | name, type, is_inventory_related, is_active | expenses |
| `Expense` | expenses | expense_date, category_id, amount, payment_method, supplier_name, status, created_by, approved_by, approved_at, soft delete | items (cascade) |
| `ExpenseItem` | expense_items | expense_id (cascade), material_id, warehouse_id, quantity, unit, unit_price, total_price | — |
| `AuditLog` | audit_logs | user_id, action, entity_type, entity_id, old_value `JSONB`, new_value `JSONB`, created_at | — |

**Инварианты (CHECK / валидация в сервисе):**
- `stock_movements`: `item_type=PRODUCT` ⇒ `product_id NOT NULL AND material_id IS NULL`;
  `item_type=MATERIAL` ⇒ наоборот. Реализовать `CHECK`-constraint в миграции.
- `order_items.total_price = quantity * unit_price`; `orders.total_amount = SUM(items)`.
- Денежные/количественные поля — только `Numeric`, не `Float`.

**Индексы** (создать в миграциях):
`orders(client_id, created_at, deadline)`,
`order_items(order_id, product_id)`,
`stock_movements(warehouse_id, item_type, product_id, material_id, movement_type, created_at, source_type, source_id)`,
`stock_balances` UNIQUE `(warehouse_id, item_type, product_id, material_id)`,
`shipments(order_id, client_id, shipment_date)`,
`payments(client_id, order_id, payment_date)`,
`expenses(category_id, status, expense_date)`,
`shift_reports(master_id, status, shift_date)`,
`audit_logs(user_id, entity_type, entity_id, created_at)`,
`users(email)` UNIQUE.

---

## 4. Схемы (Pydantic v2)

Соглашение на сущность: `XxxBase`, `XxxCreate`, `XxxUpdate`, `XxxRead`, `XxxListItem`,
`XxxFilter`. `model_config = ConfigDict(from_attributes=True)`. Деньги/кол-во — `Decimal`
с `condecimal`/`Field(ge=0)`.

**common.py:** `PageParams(page, size)`, `Page[T](items, total, page, size)`, `Message`.

**auth.py:** `LoginRequest(email, password)`, `TokenResponse(access_token, refresh_token, token_type)`,
`RefreshRequest(refresh_token)`, `ChangePasswordRequest(old_password, new_password)`, `MeResponse`.

**user.py:** `UserCreate(full_name, phone, email, role, temp_password, is_active)`,
`UserUpdate`, `UserRoleUpdate(role)`, `UserRead` (без `password_hash`).

**order.py:** `OrderItemCreate(product_id, quantity, unit_price, comment)`,
`OrderCreate(client_id, deadline, comment, manager_id?, items: list[OrderItemCreate])`,
`OrderUpdate` (только шапка), `OrderRead` (+ `total_amount`, `items`, client/manager),
`OrderFilter(client_id, manager_id, date_from, date_to, deadline_from, deadline_to, search)`.
> Сервер сам считает `total_price` и `total_amount` — клиент не присылает суммы.
> Статусов нет: позиции после создания неизменны (уже списаны со склада).

**shift_report.py:** вложенные `WorkerIn`, `OutputIn`, `MaterialIn`;
`ShiftReportCreate`, `ShiftReportUpdate`, `RejectRequest(comment)`, `ShiftReportRead`.

**stock.py:** `StockBalanceRead`, `StockMovementRead`,
`AdjustmentCreate(warehouse_id, item_type, product_id?, material_id?, quantity, direction(IN/OUT), comment)`,
`StockFilter`.

**shipment.py:** только чтение — `ShipmentItemRead`, `ShipmentRead`, `ShipmentListItem`
(отгрузка создаётся вместе с заказом, отдельного API создания нет).

**payment.py:** `PaymentCreate(client_id, order_id?, payment_date, amount, payment_method, comment)`, `PaymentRead`.

**expense.py:** `ExpenseItemIn(material_id, warehouse_id, quantity, unit, unit_price)`,
`ExpenseCreate(expense_date, category_id, amount, payment_method, supplier_name?, comment, items?)`,
`ExpenseRead`, `ExpenseCategoryCreate/Read`.

**report.py:** `DashboardResponse`, `PnLResponse`, `DebtRow`, `ProductionRow`,
`StockReportRow`, `ExpenseByCategoryRow`, `RevenueExpenseTrendPoint`,
`ReportFilter(date_from, date_to, revenue_mode)`.

---

## 5. Сервисы (бизнес-логика)

Сервисы принимают `AsyncSession`, инкапсулируют транзакции и пишут в `audit_service`.

### 5.1 stock_service.py — ядро системы
```
async def apply_movement(session, *, warehouse_id, item_type, product_id|material_id,
                         movement_type, quantity, unit, source_type, source_id,
                         unit_cost=None, created_by) -> StockMovement
```
- Определяет знак (IN/OUT) по `movement_type`.
- Для OUT проверяет остаток: если `not ALLOW_NEGATIVE_STOCK` и остаток < quantity →
  `InsufficientStockError` (HTTP 409).
- Создаёт `StockMovement` + обновляет `StockBalance` (upsert) **в той же транзакции**.
- `current_balance(...)`, `recalc_balances()` (пересчёт кэша из журнала — для скрипта).

### 5.2 shift_report_service.py
- `create / update` (только в `DRAFT`/`REJECTED`, только владелец).
- `submit` → `SUBMITTED`.
- `approve` (**атомарно**, одна транзакция): проверка достаточности сырья →
  `PRODUCTION_OUT` по материалам → `PRODUCTION_IN` по продукции →
  `DEFECT_OUT` по браку → статус `APPROVED`, `approved_by/at`. Если сырья мало —
  откат всей транзакции + 409. *Пока не утверждён — склад не меняется.*
- `reject(comment)` → `REJECTED`.

### 5.3 expense_service.py
- `create / update / submit`.
- `approve` (**атомарно**): если категория `is_inventory_related` — по каждой
  `expense_item` создаётся `PURCHASE_IN` (с `unit_cost`), увеличивается баланс;
  статус → `APPROVED`. Аудит `APPROVE_EXPENSE`.
- `reject`.

### 5.4 shipment_service.py (только чтение + хелперы для order_service)
- Статусов нет, отдельного API создания нет. Отгрузка создаётся вместе с заказом.
- `create_shipment_for_order` (вызывается из `order_service.create`): `_check_stock`
  (проверка остатков готовой продукции, иначе `InsufficientStockError` с именем товара и
  дефицитом) → `SALE_OUT` по каждой позиции → баланс уменьшается. Аудит `CREATE_SHIPMENT`.
- `reverse_shipment_stock` (вызывается из `order_service.delete`): `RETURN_IN` по позициям.
- Чтение: `list_shipments`, `get_full` (SaM видит только отгрузки своих заказов).

### 5.5 order_service.py
- `create` (**атомарно**): генерация `order_number`, пересчёт `total_amount`, затем
  `create_shipment_for_order` (списание остатка) — заказ = факт продажи. Статусов нет.
- `delete` (soft): `reverse_shipment_stock` возвращает остаток, отгрузка помечается удалённой.

### 5.6 payment_service.py
- `create` — фиксация платежа, аудит `CREATE_PAYMENT`. Долг пересчитывается на лету (не хранится).

### 5.7 report_service.py (всё за период; `revenue_mode`)
```
gross_revenue   = SUM(shipments.total_amount)          # все неудалённые отгрузки
cash_revenue    = SUM(payments.amount)
total_expenses  = SUM(expenses.amount)
net_profit      = (gross|cash)_revenue - total_expenses
accounts_receivable = SUM(shipments) - SUM(payments)   # долг по клиенту/всего, на лету
```
Методы: `dashboard`, `pnl`, `debts`, `production`, `stock`, `expenses_by_category`,
`revenue_expense_trend`.

### 5.8 auth_service.py / user_service.py
- `login`: проверка пароля, `last_login_at`, выдача токенов.
- `refresh`, `change_password` (сбрасывает `must_change_password`).
- `create_user` (только SUPER_ADMIN/BOSS), `update_role` — **Boss не может назначать/менять/удалять SUPER_ADMIN**.
- `deactivate` (soft) вместо удаления.

### 5.9 audit_service.py
`log(session, user_id, action, entity_type, entity_id, old, new)` — вызывается из сервисов
на: CREATE_ORDER, CREATE_SHIPMENT, APPROVE_SHIFT_REPORT, CREATE_EXPENSE,
CREATE_PAYMENT, MANUAL_STOCK_ADJUSTMENT.

---

## 6. API endpoints + матрица доступа

`SA`=SUPER_ADMIN, `B`=BOSS, `WM`=WAREHOUSE_MANAGER, `SM`=SHIFT_MASTER, `SaM`=SALES_MANAGER.

### Auth — `/api/auth`
| Метод | Путь | Доступ |
|---|---|---|
| POST | /login | все |
| POST | /refresh | все |
| POST | /logout | авторизованные |
| GET | /me | авторизованные |
| POST | /change-password | авторизованные |

### Users — `/api/users`
| GET / POST / PATCH `/{id}` | SA, B |
| DELETE `/{id}` | SA |
| PATCH `/{id}/role` | SA, B (B без SUPER_ADMIN) |

### Clients — `/api/clients` (`GET/POST/GET{id}/PATCH{id}`: SA,B,SaM; `DELETE`: SA,B)
`GET /{id}/balance`, `GET /{id}/history` — SA,B,SaM. *SaM — только свои при `manager_scope`.*

### Products / Materials — `/api/products`, `/api/materials`
CRUD: SA,B (справочники). `GET` продукции доступен и SaM/WM (для форм).
Materials скрыты от SaM/SM.

### Orders — `/api/orders`
`GET/POST/GET{id}/PATCH{id}`: SA,B,SaM; `DELETE{id}`: SA,B. Статусов нет — `POST`
сразу списывает остаток и наращивает долг клиента (при нехватке → 409 с именем товара).
Фильтры: client_id, manager_id, date_from/to, deadline_from/to, search.

### Shift Reports — `/api/shift-reports`
| GET (все) | SA, B |
| GET /my | SM |
| POST | SM, SA, B |
| GET /{id} | SA, B, owner SM |
| PATCH /{id} | owner SM (только DRAFT/REJECTED) |
| POST /{id}/submit | owner SM |
| POST /{id}/approve, /reject | SA, B |
| DELETE /{id} | SA, B |

### Warehouses / Stock — `/api/warehouses`, `/api/stock`
| GET balances / materials / movements | SA, B, WM |
| GET products | SA, B, WM, SaM (limited: без сырья/себестоимости) |
| POST adjustments | SA, B, WM (if allowed) |

### Shipments — `/api/shipments` (только чтение)
| GET / GET `/{id}` | SA, B, WM, SaM |
> Отгрузка создаётся вместе с заказом (`POST /api/orders`), отдельных
> create/confirm/cancel нет. *SaM видит только отгрузки своих заказов.*

### Payments — `/api/payments`
| GET / POST | SA, B, SaM |
| PATCH /{id} / DELETE /{id} | SA, B |

### Expenses — `/api/expenses`, `/api/expense-categories`
`GET/POST/PATCH/approve/reject`: SA, B; `DELETE`: SA. Категории — SA,B.

### Reports — `/api/reports`
`dashboard, pnl, revenue-expense-trend, expenses-by-category`: SA, B.
`debts`: SA, B, SaM. `production`, `stock`: SA, B (+WM для stock).
Параметры: `date_from`, `date_to`, `revenue_mode=shipments|payments`.

### Audit logs — `/api/audit-logs` — SA, B.

> Каждый защищённый endpoint объявляет
> `current_user: User = Depends(require_roles(...))`. Безопасность — на backend; скрытие
> меню на frontend — только UX.

---

## 7. Alembic

`alembic.ini` + `app/migrations/env.py` настроены на **async** engine и `Base.metadata`
(autogenerate видит все модели через `app.models`).

`env.py` (ключевое):
```python
from app.core.database import Base
from app.core.config import settings
import app.models  # noqa: регистрирует все модели в Base.metadata
target_metadata = Base.metadata

def run_migrations_online():
    connectable = create_async_engine(settings.DATABASE_URL)
    async def run():
        async with connectable.connect() as conn:
            await conn.run_sync(do_run_migrations)
    asyncio.run(run())
```

Команды:
```bash
alembic revision --autogenerate -m "init schema"
alembic upgrade head
alembic downgrade -1
alembic history
```

Порядок первой миграции (из-за FK): users → clients → products → materials → warehouses →
orders → order_items → shift_reports(+workers/outputs/materials) → stock_movements →
stock_balances → shipments(+items) → payments → expense_categories → expenses → expense_items →
audit_logs. В миграции добавить **CHECK** для `stock_movements` (product/material XOR) и все индексы из §3.

---

## 8. Скрипты (`backend/scripts/`)

- **create_superadmin.py** — создаёт первого `SUPER_ADMIN` из env (`SUPERADMIN_EMAIL/PASSWORD`),
  идемпотентно. Запуск: `python -m scripts.create_superadmin`.
- **seed.py** — справочники для разработки: склады (RAW/FINISHED), товары (простыня 160x200,
  дастархан, рулон, упаковка), материалы (спанбонд, тубус, плёнка, краситель, краска),
  категории расходов (5 типов), тестовые пользователи по ролям, демо-клиенты/заказы.
- **recalc_balances.py** — пересчитывает `stock_balances` из `stock_movements` (восстановление
  кэша). Использует `stock_service.recalc_balances()`.

`backend/entrypoint.sh` (для контейнера): `alembic upgrade head` → `create_superadmin` →
`gunicorn -k uvicorn.workers.UvicornWorker app.main:app`.

---

## 9. Docker

**Dockerfile** (backend): python:3.12-slim → install deps → copy app → entrypoint.

**docker-compose.yml**:
```yaml
services:
  db:       # postgres:16, volume pgdata, healthcheck
  backend:  # build ., depends_on db (healthy), env_file .env, expose 8000
  frontend: # build ./frontend, env NEXT_PUBLIC_API_URL
  proxy:    # caddy/nginx, 80/443, reverse proxy → frontend + /api → backend, SSL
volumes: { pgdata: {} }
```
Бэкап БД (cron `pg_dump`) и `seed initial data` — на этапе деплоя.

---

# ЧАСТЬ II. FRONTEND (Next.js App Router)

## 10. Структура

```
frontend/
  app/
    layout.tsx                 # провайдеры: QueryClient, Theme, Toaster
    (auth)/login/              # публичный
    (app)/                     # защищённая группа (server guard + client guard)
      layout.tsx               # Sidebar(desktop)/BottomNav(mobile) по роли
      dashboard/  orders/[id]/  clients/[id]/  production/
      shift-reports/(my|[id])  stock/  shipments/  payments/  debts/
      expenses/  reports/  users/  settings/  audit-logs/
  components/
    layout/   # Sidebar, Topbar, BottomNav, RoleMenu
    ui/       # shadcn/ui
    forms/    # OrderForm, ShiftReportWizard, ExpenseForm, PaymentForm, ShipmentForm
    tables/   # DataTable (TanStack Table) + фильтры
    charts/   # RevenueExpenseChart, ExpensePie, ProductionBar, KpiCard
    mobile/   # Card-списки, StepWizard, StickySubmit
  features/
    auth/ orders/ clients/ production/ stock/ shipments/
    payments/ debts/ expenses/ reports/ users/
      # на фичу: api.ts (запросы), hooks.ts (useQuery/useMutation), types.ts
  lib/
    api.ts            # fetch-обёртка: baseURL, Bearer, авто-refresh по 401
    auth.ts           # хранение токена, getMe, logout, redirect по роли
    permissions.ts    # ROLE_MENU, canAccess(role, route), HOME_BY_ROLE
    utils.ts          # формат денег/дат, cn()
    validations/      # Zod-схемы (зеркало backend schemas)
  stores/             # Zustand: authStore (user, token), uiStore
  types/              # общие TS-типы (enums, Page<T>)
  public/             # manifest.json, иконки (PWA)
```

## 11. Auth & Guard

- **lib/api.ts**: добавляет `Authorization: Bearer`; на `401` пытается `/auth/refresh`,
  при неудаче → logout + `/login`.
- **Серверный guard** в `app/(app)/layout.tsx`: нет токена → `redirect('/login')`.
- **Клиентский guard**: `canAccess(role, pathname)`; нет доступа → 403 / редирект на домашнюю.
- **HOME_BY_ROLE** (из дополнения):
  `SUPER_ADMIN→/dashboard, BOSS→/dashboard, WAREHOUSE_MANAGER→/stock, SHIFT_MASTER→/shift-reports/my, SALES_MANAGER→/orders`.
- **Login flow**: submit → `/auth/login` → сохранить токен → `GET /auth/me` → положить user
  в `authStore` → redirect по роли. Если `must_change_password` → экран смены пароля.
- **ROLE_MENU** скрывает пункты меню (см. §6 дополнения), но это только UX.

## 12. Технические требования (frontend)

- TypeScript обязателен; все формы — **React Hook Form + Zod** (`zodResolver`).
- Данные — **TanStack Query** (ключи по фичам, инвалидация после мутаций).
- Таблицы — **TanStack Table** (сортировка/фильтры/пагинация серверная).
- Графики — **Recharts** (линия доходы/расходы, пирог расходов, бары производства, KPI-карточки).
- UI — **shadcn/ui** + Tailwind.
- **Responsive / mobile-first**: breakpoints 360/768/1024/1440; на mobile — карточки вместо
  таблиц, кнопки ≥44px, нижняя навигация, одноколоночные формы, sticky submit снизу.
- **PWA**: `manifest.json`, иконка, «Добавить на главный экран», базовое кэширование
  (offline — вторая версия).

## 13. Ключевые экраны

- **Dashboard** — desktop: 8 KPI-карточек + график доходы/расходы + пирог расходов + таблицы
  (последние заказы, крупные долги, критичное сырьё). Mobile: 4 карточки + быстрые кнопки
  (заказ/смена/расход/оплата) + недельный график.
- **Заказы** — таблица+фильтры (desktop), карточки (mobile). Форма заказа: клиент, дедлайн,
  «+ Добавить товар», автоподсчёт суммы, черновик.
- **Отчёт смены** (важнейший mobile-экран) — пошаговый wizard: Смена → Работники
  (чекбоксы, кнопки 8ч/12ч) → Произведено (карточки +брак) → Сырьё → Проверка
  (сохранить черновик / отправить).
- **Утверждение смены** (desktop) — список SUBMITTED, детальный просмотр, предупреждение о
  нехватке сырья, Утвердить/Отклонить.
- **Склад** — табы (Готовая продукция / Сырьё / Движения / Корректировки) + фильтры; mobile —
  карточки с цветовым индикатором (зелёный/жёлтый/красный). Для SaM — только готовая продукция
  в ограниченном виде (Есть/Мало/Нет).
- **Отгрузки** — выбор заказа → позиции подтягиваются → факт. количество → доступный остаток →
  «Подтвердить отгрузку».
- **Оплаты** — форма (клиент, заказ?, дата, сумма, способ); mobile — крупное поле суммы.
- **Долги** — таблица (клиент, менеджер, сумма отгрузок/оплат, долг, последние даты,
  действия), сортировка по убыванию долга; mobile — карточки с «Позвонить»/«Добавить оплату».
- **Расходы** — быстрая форма; при категории «Закуп сырья» — блок «Позиции закупки»
  (материал, кол-во, цена, склад).
- **Отчёты P&L** — выбор периода + переключатель выручки (отгрузки/оплаты) + KPI/графики/таблицы.
- **Пользователи** (SA/B) — список, создать, изменить роль, отключить, сбросить пароль, фильтр/поиск.

---

## 14. Порядок реализации (из ТЗ)

**Backend сначала:** Models → Migrations → Schemas → Auth/Roles → CRUD справочников →
Services → **Stock logic (ядро)** → Reports.

**Затем Frontend:** Auth pages → Layout → Dashboard → Orders → Shift report (mobile) →
Stock → Expenses → Shipments → Payments → Debts → Reports.

**Поэтапно (MVP):**
1. Проектирование (ERD, роли, процессы, макеты, список API).
2. Backend foundation (FastAPI, PG, async SA, Alembic, JWT, Users/Roles, permissions).
3. Справочники (clients, products, materials, warehouses, expense_categories, users).
4. Заказы. 5. Склад (movements/balances/проверка минуса/корректировки/история).
6. Производство/сменные отчёты (+ авто-движение склада при approve).
7. Расходы и закуп сырья (+ авто PURCHASE_IN при approve).
8. Отгрузки/продажи (проверка остатков, SALE_OUT, статус заказа).
9. Оплаты и дебиторка. 10. Dashboard и P&L. 11. Тесты. 12. Деплой.

## 15. Критичные правила разработчика

1. Все операции склада — только через `stock_movements`, остаток не редактировать напрямую.
2. Деньги — `NUMERIC(14,2)`, кол-во — `NUMERIC(14,3)`, не `float`.
3. Утверждение смены / закупки / отгрузки / корректировка — в одной транзакции (атомарно).
4. Отгрузка проверяет остатки; запрет ухода в минус (если не разрешено настройкой).
5. Долги клиентов считаются автоматически (не хранятся).
6. Все важные действия — в `audit_logs`.
7. Безопасность ролей — на backend (403), frontend только скрывает меню.
8. Mobile UX — приоритет для форм ввода.
9. Soft delete (`deleted_at`) для orders/clients/expenses/payments/shipments/users.
10. `SUPER_ADMIN` нельзя удалить обычным способом; `BOSS` не может назначать `SUPER_ADMIN`.
```
