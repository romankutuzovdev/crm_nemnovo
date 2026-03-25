# Маппинг ТЗ → Архитектурные решения

Краткая справочная таблица: как каждое требование из ТЗ покрывается архитектурой.

---

## Роли пользователей

| ТЗ | Решение |
|----|---------|
| Администратор: пользователи, роли, права, SMS, телефония, интеграции | RBAC `admin`, модули Users, Integrations, Notifications |
| Руководитель: контроль менеджеров, аналитика, отчёты, загрузка | RBAC `director`, модули Reports, Calendar |
| Менеджер: клиенты, сделки, календарь, оплаты, SMS | RBAC `manager`, row-level фильтр по `assigned_to` |

---

## Модуль клиентов

| ТЗ | Решение |
|----|---------|
| Контакт: ФИО, телефон, email, компания, комментарий | `Contact` model |
| Ответственный менеджер | `Contact.manager_id` |
| История звонков, заказов, оплат, изменений | `activity_log` + `GET /contacts/{id}/activity` |
| Автосоздание при звонке/заявке | Webhook → поиск по phone → create Contact |
| Компания: название, B2B/B2C, контакты, сделки | `Company` model + `Contact.company_id` |

---

## Интеграция с сайтом

| ТЗ | Решение |
|----|---------|
| Автоприём заявок | `POST /integrations/webhooks/lead` |
| Проверка телефона, создание/привязка клиента | Service: `find_or_create_contact(phone)` |
| Создание заказа/сделки | Lead → Deal или Booking |
| Назначение менеджера | Round-robin или правило в Service |
| Уведомление менеджеру | Celery task → Notifications |
| Сущность «Заявка» | `Lead` model |

---

## Модуль активов

| ТЗ | Решение |
|----|---------|
| Универсальный «Актив» | `Asset` (name, type, status, price) |
| Байдарки | Asset + category kayak + meta |
| Номера хостела | Asset category hostel_room |
| Беседки, инвентарь | Asset categories |
| Транспорт | Asset + meta (plate_number, driver) |
| Инструкторы | Asset category instructor |
| Маршрут (сплав) | Отдельная сущность `Route` |

---

## Подмодуль «Сплавы»

| ТЗ | Решение |
|----|---------|
| Байдарка | Asset |
| Маршрут | `Route` |
| Инструктор | Asset instructor |
| ИП-машина | Asset transport |
| Сплав (заказ) | `RaftingBooking` |

---

## Подмодуль «Хостел»

| ТЗ | Решение |
|----|---------|
| Номер | Asset hostel_room или `HostelRoom` |
| Бронирование | `HostelBooking` |

---

## Подмодуль «Беседки и аренда»

| ТЗ | Решение |
|----|---------|
| Клиент, дата, позиции | `RentBooking` |

---

## Магазин и склад

| ТЗ | Решение |
|----|---------|
| Товары | `Product` |
| Остатки | `Product.stock_quantity` + `StockMovement` |
| Продажи | `Sale` |
| Движение товара | `StockMovement` |
| Связь с оплатами | Sale → Payment |

---

## Оплаты и финансы

| ТЗ | Решение |
|----|---------|
| Фиксация оплат | `Payment` |
| Контроль задолженности | `order.paid_amount`, `payment_status` |
| Частичные оплаты, возвраты | Payment.amount, Payment.status |
| Учёт по менеджерам | Payment.assigned_to |
| Сущность «Платеж» | `Payment` model |
| Онлайн: WebPay, ExpressPay, МТБанк | Адаптеры + webhooks |
| Счета от разных ЮЛ/ИП | `LegalEntity` + `Invoice` |

---

## Календарь

| ТЗ | Решение |
|----|---------|
| Единый календарь заказов | `GET /calendar/events` |
| День/неделя/месяц | Query params `from`, `to` |
| Фильтр по менеджеру | Query param `manager_id` |
| Цветовое разделение | Event `color` по типу |
| Перетаскивание | PATCH booking с новыми датами |
| Проверка пересечений | Service `check_conflicts()` |

---

## IP-телефония

| ТЗ | Решение |
|----|---------|
| Входящие/исходящие | Webhook + Telephony adapter |
| Автосоздание клиента | По номеру → Contact |
| История, записи | activity_log / calls table |

---

## SMS / Viber

| ТЗ | Решение |
|----|---------|
| Шаблоны сообщений | `MessageTemplate` |
| Рассылка | Celery + SMS/Viber adapter |

---

## Общие требования

| ТЗ | Решение |
|----|---------|
| Логирование действий | `audit_log` |
| История изменений | audit_log + JSON diff |
| Защита данных | JWT, RBAC, HTTPS |
| Резервное копирование | Cron + pg_dump |
| Адаптивный интерфейс | Tailwind, responsive |
| Масштабируемая архитектура | Модули, Celery, events |
