#!/bin/bash
# Создаёт пользователя PostgreSQL и базу данных для CRM.
# Запуск: ./scripts/setup_db.sh  или  bash scripts/setup_db.sh

DB_USER="${CRM_DB_USER:-crm_user}"
DB_PASS="${CRM_DB_PASS:-crm_pass}"
DB_NAME="${CRM_DB_NAME:-crm_db}"

echo "Создание пользователя $DB_USER и базы $DB_NAME..."

run_psql() {
  if psql postgres -tAc "SELECT 1" >/dev/null 2>&1; then
    psql postgres "$@"
  elif psql -U postgres postgres -tAc "SELECT 1" >/dev/null 2>&1; then
    psql -U postgres postgres "$@"
  else
    echo "Ошибка: не удалось подключиться к PostgreSQL."
    echo "Убедитесь, что PostgreSQL запущен: brew services start postgresql@16"
    exit 1
  fi
}

run_psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
run_psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
run_psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

echo "Готово."
echo "DATABASE_URL=postgresql+asyncpg://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
