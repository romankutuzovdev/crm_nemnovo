# BACKLOG CRM Nemnovo

Обновлено: 2026-03-25

## Срочные блокеры

- [x] Исправить ошибку запуска API: `TypeError: 'function' object is not subscriptable` в `app/modules/deals/repository.py` (сигнатура `list_by_client`).
- [x] Починить окружение Python: `ModuleNotFoundError: No module named 'sqlalchemy'` при запуске `scripts/create_user.py`.
- [x] Проверить, что создание пользователя работает из текущего venv и документировать рабочую команду в `docs/RUN.md` (проверено в `.venv311`: пользователь создан).

## В работе

- [ ] `m3-deals-core`: Заказы (единая сущность) - жизненный цикл, статусы, ответственный, суммы. (сделано: валидация переходов статусов на бэкенде + endpoint `/orders/{id}/status` + UI выбора только допустимых переходов + вкладка истории `/orders/{id}/audit`)
- [ ] `m6-payments-core`: Оплаты - платежи, частичные оплаты, возвраты, авто-статусы оплаты. (сделано: возврат платежа из UI заказа + отображение статусов платежных транзакций)

## Не сделано (по плану)

- [ ] `m0-roles`: Роли/права (Admin/Owner/Manager) + ограничения видимости данных. (сделано: `Role.permissions` (JSON) теперь учитывается в `require_permission`; менеджеру запрещён доступ к чужим лидам на `GET/PATCH/convert`)
- [ ] `m0-audit`: Аудит и история изменений для ключевых сущностей. (сделано: `GET /leads/{id}/audit` + UI-модалка «История» на странице заявок)
- [ ] `m0-settings`: Системные настройки (SMS/телефония/интеграции), заглушки + UI/конфиг. (сделано: API `/webhooks/logs`, `/webhooks/configs` + расширена страница `/dashboard/settings` (site/telephony/SMS/online))
- [ ] `m3-services-rafting`: Подмодуль "Сплавы" (маршруты/инструкторы/транспорт + заказ сплава). (сделано: справочники + `RaftingTrip`, API `/rafting/trips`, миграция `20260327_rafting`, вкладка «Сплавы (заказы)» в `/dashboard/rafting`)
- [ ] `m3-services-hostel`: Подмодуль "Хостел" (номера + бронирования с гостями/стоимостью). (сделано: модели `hostel_rooms` / `hostel_bookings` / `hostel_guests`, API `/hostel/rooms`, `/hostel/bookings`, проверка пересечения дат, миграция `20260326_hostel`, UI `/dashboard/hostel`)
- [ ] `m3-services-rent`: Подмодуль "Беседки и аренда" (заказ на дату + позиции). (сделано: `rent_catalog_items`, `rent_orders`, `rent_order_lines`, API `/rent/catalog`, `/rent/orders`, пересчёт суммы по строкам, миграция `20260326_rent`, UI `/dashboard/rent`)
- [ ] `m4-assets`: Активы (универсальная сущность, статусы, история). (сделано: валидация переходов статуса `AssetStatus`, аудит `assets` при создании/изменении/смене статуса и при добавлении периода обслуживания, `GET /assets/{id}`, `POST /assets/{id}/status`, `GET /assets/{id}/audit`, `GET /assets/{id}/maintenances`, UI карточки `/dashboard/assets/[id]`)
- [ ] `m5-calendar-ui`: Календарь full-screen (day/week/month, цвета, drag&drop). (сделано: FullCalendar UI `/dashboard/calendar` с day/week/month/list, фильтрами и drag&drop через `/calendar/events/booking/{id}`)
- [ ] `m6-invoices-multi-company`: Счета от разных компаний (выбор эмитента). (сделано: API создания/списка счетов с `issuer_company_id` + UI в заказе для выбора эмитента)
- [ ] `m6-online-payments`: Онлайн-оплата (webpay/МТБанк): заглушки, затем интеграции. (сделано: `POST /payments/online/init` + создание pending online-платежа + кнопка "Оплатить онлайн" в заказе)
- [ ] `m7-stock`: Магазин/склад (товары, остатки, движения, продажи, связь с оплатами). (сделано: движения склада `stock_movements`, API `POST/GET /assets/products/{id}/adjust|movements`, UI «Учёт» в `/dashboard/stock`)
- [ ] `m8-telephony`: IP-телефония (вход/исход, автосоздание клиента, история, записи). (сделано: дедупликация событий по `call_id` + отображение `recording_url` из `lead.raw_payload` в истории звонков)
- [ ] `m8-sms`: SMS/Viber (шаблоны, отправка, статусы, журнал). (сделано: API шаблонов и отправки SMS + журнал через `/notifications/logs`, воркер теперь читает шаблон из БД при отсутствии в hard-coded)
- [ ] `m9-nfr-security`: НФТ безопасность (доступы, секреты, CORS, rate limit). (сделано: поправлен CORS в `app/main.py` — `allow_credentials` выключен при `allow_origins="*"` для корректной работы в браузере)
- [ ] `m9-nfr-backups`: НФТ резервное копирование (процедура + команда/cron). (сделано: добавлен `scripts/backup_db.sh` для SQLite + инструкция/cron в `docs/RUN.md`)
- [ ] `m9-nfr-observability`: НФТ метрики/логирование/трейсинг/алерты. (сделано: при исключениях в `RequestLoggingMiddleware` добавлено структурированное логирование `http.request_error` с traceback и тем же `request_id`)
- [ ] `m9-nfr-performance`: НФТ производительность (индексы, пагинация, кэш). (сделано: стабилизирована пагинация товаров — `ProductRepository.list()` теперь сортирует по `created_at desc`)
- [ ] `m10-qa`: Тесты unit/integration для критичных потоков. (сделано: поправлен тестовый DB на SQLite и приведены unit-тесты к SQLAlchemy-объектам; `pytest` проходит)
- [ ] `m10-docs`: Документация RUN + описание модулей + чек-лист релиза. (сделано: добавлен `docs/RELEASE_CHECKLIST.md`, обновлён `docs/RUN.md` — тесты и SMS smoke-test)

## Как вести файл

- Добавлять новые задачи только с коротким ID (например, `m11-...`).
- При старте задачи переносить в "В работе".
- После завершения переносить в отдельный блок "Сделано" (можно ниже).
