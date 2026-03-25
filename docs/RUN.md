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

# Установка
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
python scripts/create_user.py --email user@mail.ru --password mypass123 --name "Иван Петров"

# Запуск API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**API:** http://localhost:8000  
**Swagger:** http://localhost:8000/docs  
**Админка (SQLAdmin):** http://localhost:8000/admin — вход по email/паролю (роли admin, director)

Если база уже существовала до появления новых колонок в моделях, а автогенерация миграций не используется, добавьте недостающие поля вручную. Пример для поля `companies.segment` (тип B2B/B2C):

```sql
-- SQLite / PostgreSQL
ALTER TABLE companies ADD COLUMN segment VARCHAR(10) NOT NULL DEFAULT 'b2b';
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
