# Архитектурные решения CRM Nemnovo

> Документ описывает архитектурные блоки и решения для CRM-системы по ТЗ. Каждый блок — самодостаточная единица разработки с чёткими границами и контрактами.

---

## 1. Общая архитектура системы

### 1.1 Решение: Гексагональная архитектура + модульность

**Контекст:** CRM объединяет учёт клиентов, продажи, бронирование, финансы, активы, календарь, интеграции. Требуется гибкость и независимое развитие модулей.

**Решение:**
- **Backend:** FastAPI + SQLAlchemy (async) + PostgreSQL
- **Frontend:** React/Next.js (TypeScript) — SPA с адаптивным UI
- **Архитектурный стиль:** Гексагональная (порты и адаптеры) внутри каждого модуля
- **Слои модуля:** Router → Service → Repository → Model

**Структура модуля:**
```
modules/<domain>/
├── models.py      # SQLAlchemy модели
├── schemas.py     # Pydantic схемы
├── repository.py  # Доступ к данным
├── service.py     # Бизнес-логика
├── router.py      # API endpoints
└── __init__.py
```

---

### 1.2 Решение: Микросервисная готовность через события

**Контекст:** ТЗ требует масштабируемости. IP-телефония, SMS, WebPay — внешние системы.

**Решение:**
- **Синхронно:** Монолит с чёткими границами модулей
- **Асинхронно:** Celery + Redis для фоновых задач (SMS, уведомления, webhooks)
- **События:** `app/events/` — внутренние Domain Events для связки модулей (создание клиента → уведомление менеджеру)
- **API-first:** Все внешние интеграции — через абстракции (порты), реализация — адаптеры

---

## 2. Безопасность и авторизация

### 2.1 Решение: RBAC с тремя ролями

**По ТЗ:** Администратор, Руководитель (Owner), Менеджер.

**Решение:**
| Роль | Код | Права |
|------|-----|-------|
| Администратор | `admin` | Всё + пользователи, роли, настройки, SMS, телефония, интеграции |
| Руководитель | `director` | Аналитика, отчёты, контроль менеджеров, загрузка, финансы. Без системных настроек |
| Менеджер | `manager` | Только свои клиенты и заказы, календарь, платежи, SMS |

**Реализация:**
- JWT (access + refresh tokens)
- Middleware `require_role(["admin", "director"])` на эндпоинтах
- Row-level: `manager_id` / `assigned_to` на сущностях; фильтр в Repository по `current_user`

---

### 2.2 Решение: Audit Log для всех действий

**По ТЗ:** Логирование всех действий, история изменений.

**Решение:**
- Таблица `audit_logs`: `entity_type`, `entity_id`, `action` (CREATE/UPDATE/DELETE), `user_id`, `changes` (JSON diff), `created_at`
- Middleware/Hook на уровне Service: при изменении сущности — запись в audit
- Хранение изменений в JSONB для гибкого запроса

---

## 3. Модуль клиентов

### 3.1 Решение: Контакт и Компания как отдельные сущности

**По ТЗ:** Карточка клиента (ФИО, телефон, email, компания, комментарий, ответственный, история).

**Решение:**
- **Contact** (физическое лицо): `id`, `full_name`, `phone`, `email`, `comment`, `manager_id`, `company_id` (nullable)
- **Company** (B2B): `id`, `name`, `client_type` (B2B/B2C), контакты, сделки
- Связь: Contact → Company (optional)
- При входящем звонке/заявке: поиск по `phone`; при совпадении — привязка, иначе — создание Contact

---

### 3.2 Решение: Единая история активности

**По ТЗ:** История звонков, заказов, оплат, изменений.

**Решение:**
- Таблица `activity_log`: `contact_id`, `type` (call|order|payment|change), `entity_type`, `entity_id`, `payload` (JSON), `created_at`
- При создании звонка, заказа, платежа — запись в `activity_log`
- API: `GET /contacts/{id}/activity` — агрегированная лента

---

## 4. Интеграция с сайтом (модуль заявок)

### 4.1 Решение: Webhook API для заявок

**По ТЗ:** Автоматический приём заявок с сайта, проверка телефона, создание клиента/заказа, уведомление менеджера.

**Решение:**
- `POST /api/v1/integrations/webhooks/lead` — защищённый webhook (HMAC или API key)
- Тело: `phone`, `source`, `service_type`, `comment`, `metadata`
- Логика:
  1. Поиск Contact по `phone`
  2. Если нет → создание Contact
  3. Создание Lead/Deal (в зависимости от `service_type`)
  4. Назначение ответственного (round-robin или по правилу)
  5. Celery task → Push/Email менеджеру

---

### 4.2 Решение: Сущность Lead (Заявка)

**По ТЗ:** Дата, источник, тип услуги, клиент, комментарий, статус, ответственный.

**Решение:**
- **Lead:** `id`, `source` (site_form|telephony|manual), `service_type`, `contact_id`, `comment`, `status`, `assigned_to`, `created_at`
- Статусы: `new` → `in_progress` → `converted` / `rejected`
- При конвертации Lead → создание Deal/Booking

---

## 5. Модуль активов

### 5.1 Решение: Универсальная сущность Asset + специализированные типы

**По ТЗ:** Байдарки, номера, беседки, инвентарь, транспорт, инструкторы. Универсальный «Актив»: название, тип, статус, цена.

**Решение:**
- **AssetCategory:** справочник типов (kayak, hostel_room, gazebo, transport, instructor, equipment)
- **Asset:** `id`, `category_id`, `name`, `code`, `capacity`, `status` (free|busy|maintenance), `price`, `meta` (JSON для доп. полей)
- **AssetMaintenance:** период ремонта, причина

**Специфика по подмодулям (в `meta` или через наследование):**
- Байдарка: `type`, `capacity`, `condition`
- Маршрут: отдельная сущность **Route** (название, длина, время, сложность, цена)
- Инструктор: Asset с `category=instructor`, meta: `phone`, `category`, `notes`
- Транспорт: meta: `plate_number`, `driver`, `capacity`

---

## 6. Подмодуль «Сплавы»

### 6.1 Решение: Отдельные сущности + агрегирующий RaftingBooking

**По ТЗ:** Байдарка, маршрут, инструктор, ИП-машина, сплав (заказ).

**Решение:**
- **Route:** `id`, `name`, `distance_km`, `duration_hours`, `difficulty`, `price`
- **RaftingBooking** (расширяет Booking): `contact_id`, `route_id`, `date`, `participants_count`, `kayaks` (JSON: список asset_ids), `instructor_id`, `transport_id`, `extra_services` (JSON), `total_amount`, `paid_amount`, `status`, `payment_status`, `assigned_to`

---

## 7. Подмодуль «Хостел»

### 7.1 Решение: HostelRoom + HostelBooking

**По ТЗ:** Номер (название, вместимость, цена, статус), бронирование.

**Решение:**
- **HostelRoom:** Asset с `category=hostel_room` или отдельная таблица `hostel_rooms` (name, capacity, price, status)
- **HostelBooking:** `contact_id`, `room_id`, `check_in`, `check_out`, `guests_count`, `amount`, `paid_amount`, `status`, `payment_status`

---

## 8. Подмодуль «Беседки и аренда»

### 8.1 Решение: RentBooking как универсальная аренда

**По ТЗ:** Клиент, дата, позиции, стоимость, оплата, статус.

**Решение:**
- **RentBooking:** `contact_id`, `date`, `positions` (JSON: [{asset_id, quantity, price}]), `total_amount`, `paid_amount`, `status`, `payment_status`
- Позиции — аренда беседок, палаточного поля, базы, шатров, байдарок, велосипедов и т.д.

---

## 9. Модуль магазина и склада

### 9.1 Решение: Products + StockMovements + Sales

**По ТЗ:** Товары, остатки, продажи, движение, связь с оплатами.

**Решение:**
- **Product:** `id`, `name`, `sku`, `category`, `unit`, `price`, `stock_quantity`, `is_rentable`
- **StockMovement:** `product_id`, `type` (in|out|adjustment|sale), `quantity`, `reference_type`, `reference_id`, `created_at`
- **Sale:** `contact_id`, `items` (JSON), `total`, `payment_id` (связь с Payment)

---

## 10. Модуль оплат и финансов

### 10.1 Решение: Payment как центральная сущность + привязка к заказам

**По ТЗ:** Фиксация оплат, контроль задолженности, частичные оплаты, возвраты, учёт по менеджерам и услугам.

**Решение:**
- **Payment:** `id`, `contact_id`, `order_id` (polymorphic: deal_id / booking_id), `amount`, `date`, `method` (cash|card|online|transfer), `status`, `transaction_id` (для онлайн), `assigned_to`

**Полиморфизм заказа:**
- Базовый интерфейс `PayableOrder`: `total_amount`, `paid_amount`, `payment_status`
- Deal, RaftingBooking, HostelBooking, RentBooking, Sale — реализуют интерфейс
- `payment_status` пересчитывается при каждом новом Payment

---

### 10.2 Решение: Интеграции онлайн-оплаты

**По ТЗ:** WebPay, ExpressPay, МТБанк.

**Решение:**
- Адаптеры: `app/integrations/payments/webpay.py`, `expresspay.py`, `mtb.py`
- Webhook: `POST /integrations/webhooks/payment/{provider}` — приход callback от провайдера
- Обновление Payment + триггер пересчёта `order.paid_amount`

---

### 10.3 Решение: Счета от разных ЮЛ/ИП

**По ТЗ:** ИП Иванов — сплавы, ООО «База отдыха» — хостел, ИП Петров — транспорт.

**Решение:**
- **LegalEntity:** `id`, `name`, `type` (LLC|IE), `inn`, `kpp`, `address`, `bank_details` (JSON)
- **Invoice:** `id`, `legal_entity_id`, `order_id`, `amount`, `status`, `created_at`
- При создании счета менеджер выбирает `legal_entity_id`

---

## 11. Модуль календаря

### 11.1 Решение: Агрегирующий API поверх заказов

**По ТЗ:** Единый календарь сплавов, хостела, аренды, заявок. День/неделя/месяц, фильтр по менеджеру, цветовое разделение, перетаскивание, проверка пересечений.

**Решение:**
- **API:** `GET /calendar/events?from=&to=&manager_id=`
- Источники: RaftingBooking, HostelBooking, RentBooking, Lead
- Формат события: `{ id, type, title, start, end, manager_id, color, resource_ids, status }`
- **Frontend:** FullCalendar или аналог (React), drag-and-drop → `PATCH /bookings/{id}` с новыми датами
- Проверка пересечений: при сохранении — вызов сервиса `check_conflicts(asset_ids, start, end)` перед записью

---

## 12. IP-телефония

### 12.1 Решение: Адаптер + Webhook + автоматическое создание клиента

**По ТЗ:** Входящие/исходящие звонки, автосоздание клиента, история, записи.

**Решение:**
- Адаптер: `app/integrations/telephony/base.py` (абстракция), реализации под провайдера (Mango, Zadarma и т.п.)
- Webhook: `POST /integrations/webhooks/call` — событие звонка
- Логика: по номеру телефона искать Contact; если нет — создать; записать Call в `activity_log` или `calls`; если есть — привязать запись разговора (URL)

---

## 13. SMS / Viber рассылка

### 13.1 Решение: Шаблоны + Celery + провайдер

**По ТЗ:** Создание сообщений по шаблону.

**Решение:**
- **MessageTemplate:** `id`, `name`, `body`, `variables` (список подстановок)
- **Notification:** `id`, `contact_id`, `channel` (sms|viber), `template_id`, `payload`, `status`, `sent_at`
- Celery task `send_sms.delay(contact_id, template_id, context)` → вызов адаптера SMS/Viber

---

## 14. Frontend (TypeScript / React)

### 14.1 Решение: Next.js + React Query + Zustand

**Решение:**
- **Next.js (App Router)** — SSR/SSG где нужно, API routes для BFF при необходимости
- **React Query** — кэш и загрузка данных
- **Zustand** — глобальное состояние (auth, UI)
- **Tailwind CSS** — адаптивная вёрстка (по ТЗ)
- **React Hook Form + Zod** — формы и валидация

---

### 14.2 Решение: Роутинг и роли на фронте

- Защищённые роуты: middleware проверки JWT
- Рендер меню и страниц по роли (admin/director/manager)
- Менеджер видит только свои карточки (фильтр на бэке)

---

## 15. Инфраструктура

### 15.1 Решение: Docker Compose для разработки

**По ТЗ:** Масштабируемость, резервное копирование.

**Решение:**
- `docker-compose.yml`: app, postgres, redis, celery worker, celery beat
- Volume для PostgreSQL
- Cron/скрипт резервного копирования БД

---

## 16. Карта модулей и приоритетов

| # | Модуль | Приоритет | Зависимости |
|---|--------|-----------|-------------|
| 1 | Auth + Users + RBAC | P0 | — |
| 2 | Clients (Contact, Company) | P0 | Auth |
| 3 | Leads (заявки) | P0 | Clients |
| 4 | Assets (универсальные) | P0 | — |
| 5 | Deals + Bookings (базовые) | P0 | Clients, Assets |
| 6 | Payments | P0 | Deals, Bookings |
| 7 | Calendar API | P1 | Bookings |
| 8 | Webhook интеграция с сайтом | P1 | Leads, Clients |
| 9 | Подмодули: Сплавы, Хостел, Аренда | P1 | Assets, Bookings |
| 10 | Магазин/склад | P2 | Payments |
| 11 | Счета от разных ЮЛ | P2 | Payments |
| 12 | Онлайн-оплата (WebPay и др.) | P2 | Payments |
| 13 | IP-телефония | P2 | Clients |
| 14 | SMS/Viber | P2 | Notifications |
| 15 | Финансовые отчёты | P2 | Payments |
| 16 | Audit Log | P1 | — |

---

## 17. Соответствие ТЗ → архитектурные блоки

| Требование ТЗ | Архитектурный блок |
|---------------|--------------------|
| Учёт клиентов | Модуль Clients (Contact, Company, Activity) |
| Управление продажами и бронированием | Deals, Bookings (Rafting, Hostel, Rent) |
| Интеграция заявок с сайта | Webhooks + Leads |
| Контроль оплат и финансов | Payments + Invoices + LegalEntity |
| Учёт активов и склада | Assets + Products + StockMovements |
| Планирование загрузки | Calendar API + фронт с календарём |
| Аналитика | Reports модуль (выручка, задолженность, по менеджерам) |
| SMS и телефония | Integrations (Telephony, SMS adapters) |
| Управление сотрудниками и правами | Users + RBAC |
| Логирование, история, резервы | Audit + Activity + Backup |

---

*Документ подготовлен как основа для реализации CRM по ТЗ. Каждый блок можно развивать независимо с соблюдением контрактов между модулями.*
