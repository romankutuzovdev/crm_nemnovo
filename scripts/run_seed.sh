#!/bin/bash
# Запуск seed с правильным Python (3.11+)
cd "$(dirname "$0")/.."

if [ -f .venv/bin/python3.11 ]; then
  exec .venv/bin/python3.11 scripts/seed.py "$@"
elif command -v python3.11 &>/dev/null; then
  exec python3.11 scripts/seed.py "$@"
else
  echo "Требуется Python 3.11. Установите: brew install python@3.11"
  exit 1
fi
