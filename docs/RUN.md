# Запуск CRM Nemnovo (локально)

Инструкция для локальной разработки **без Docker**. По умолчанию используется **SQLite** — PostgreSQL не нужен.

---

## Требования

- **Python 3.11+**
- **Node.js 18+** (для фронтенда)
- **Redis 7** (для rate limiting и logout)

---

## 1. Redis (обязательно)

### macOS (Homebrew)

```bash
brew install redis
brew services start redis
```

---

## 2. Бэкенд (Python)

```bash
# Виртуальное окружение
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
# Проверка версии (должно быть 3.11+)
python --version

# Установка
python -m pip install --upgrade pip setuptools wheel
pip install -e ".[dev]"

# Конфиг (опционально — дефолты уже настроены)
cp .env.example .env
# SQLite: crm.db создаётся автоматически в корне проекта
# Redis: localhost:6379

# Миграции (первый запуск)
alembic revision --autogenerate -m "Initial"
alembic upgrade head

# Создать роли и первого админа
./scripts/run_seed.sh
# или: python3.11 scripts/seed.py
# Логин: admin@example.com  Пароль: admin123
# Или: ADMIN_EMAIL=user@mail.ru ADMIN_PASSWORD=mypass python scripts/seed.py

# Добавить ещё пользователя (опционально)
# Если видите "No module named bcrypt" — вы в другом venv (например `env/`), не в `.venv311/`.
# Используйте: source .venv311/bin/activate или .venv311/bin/python scripts/create_user.py ...
# Если видите ошибку "No module named sqlalchemy", значит запустили не из активного venv:
#   source .venv/bin/activate
#   which python && python -m pip show sqlalchemy
# Если в .venv случайно Python 3.9, создайте новое окружение на 3.11:
#   python3.11 -m venv .venv311
#   source .venv311/bin/activate
#   python -m pip install --upgrade pip setuptools wheel
#   pip install -e ".[dev]"
python scripts/create_user.py --email user@mail.ru --password mypass123 --name "Иван Петров"

# Запуск API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Тесты (SQLite test DB)
pytest -q
```

**API:** http://localhost:8000  
**Swagger:** http://localhost:8000/docs  
**Админка (SQLAdmin):** http://localhost:8000/admin — вход по email/паролю (роли admin, director)

Если база уже существовала до появления новых колонок в моделях, а автогенерация миграций не используется, добавьте недостающие поля вручную. Пример для поля `companies.segment` (тип B2B/B2C):

```sql
-- SQLite / PostgreSQL
ALTER TABLE companies ADD COLUMN segment VARCHAR(10) NOT NULL DEFAULT 'b2b';

-- Для счетов с выбором эмитента (компании)
ALTER TABLE invoices ADD COLUMN issuer_company_id CHAR(36) NULL;

-- Для движений склада (stock movements)
CREATE TABLE IF NOT EXISTS stock_movements (
  id CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  delta_qty INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  reason TEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL
);
```

---

## 3. Фронтенд (Next.js)

В **новом терминале**:

```bash
cd frontend

# Установка
npm install

# Запуск
npm run dev
```

**Фронтенд:** http://localhost:3000

---

## 4. Celery (опционально)

Для SMS, уведомлений и фоновых задач — в отдельных терминалах:

```bash
celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
```

### Быстрый тест SMS (если запущен worker)

1) Создать шаблон:

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"code":"test_sms","channel":"sms","subject":null,"body_template":"Тест: {{ text }}"}'
```

2) Отправить SMS:

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/sms/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"phone":"+79990000000","template_code":"test_sms","context":{"text":"привет"}}'
```

3) Посмотреть журнал:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" "http://localhost:8000/api/v1/notifications/logs?limit=50"
```

---

## Порты

| Сервис   | Порт |
|----------|------|
| Backend  | 8000 |
| Frontend | 3000 |
| Redis    | 6379 |

---

## Первый вход

- **Фронтенд:** http://localhost:3000  
- **Админка:** http://localhost:8000/admin  
- **Логин:** admin@example.com  
- **Пароль:** admin123  

(после `./scripts/run_seed.sh` или `python scripts/seed.py`)

---

## Переход на PostgreSQL

Когда понадобится, в `.env` задайте:

```
DATABASE_URL=postgresql+asyncpg://crm_user:crm_pass@localhost:5432/crm_db
```

И выполните `./scripts/setup_db.sh` для создания пользователя и БД.

---
## Резервные копии (NFR)

Для SQLite (файл `crm.db`) можно делать копии так:

```bash
./scripts/backup_db.sh
```

Пример cron (каждый день в 03:00):

```cron
0 3 * * * cd /path/to/crm_nemnovo && ./scripts/backup_db.sh >> backups/backup.log 2>&1
```
