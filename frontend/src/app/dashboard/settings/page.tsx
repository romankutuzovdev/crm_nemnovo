"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PREFIX = "/api/v1";
const SITE_WEBHOOK_PATH = `${API_PREFIX}/webhooks/site`;
const TELEPHONY_WEBHOOK_PATH = `${API_PREFIX}/webhooks/telephony`;

const EXAMPLE_JSON = `{
  "first_name": "Иван",
  "last_name": "Иванов",
  "phone": "+375291234567",
  "email": "user@example.com",
  "service_type": "rafting",
  "preferred_date": "2025-06-15",
  "guests_count": 2,
  "comment": "Заявка с формы на сайте",
  "page_url": "https://example.com/contacts"
}`;

const PYTHON_SIGN_SNIPPET = `import hashlib, hmac

secret = "YOUR_SITE_WEBHOOK_SECRET"  # как в .env CRM (SITE_WEBHOOK_SECRET)
# body — ровно те байты, что уйдут в POST (тот же JSON, без лишних пробелов)
body = b'{"first_name":"Иван","phone":"+375291234567"}'
sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
# Заголовок: X-Webhook-Signature: <значение sig>`;

export default function SettingsPage() {
  const fullUrl = `${API_URL}${SITE_WEBHOOK_PATH}`;
  const telephonyUrl = `${API_URL}${TELEPHONY_WEBHOOK_PATH}`;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Настройки</h1>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Приём заявок с сайта (webhook)</h2>
        <p className="text-sm text-slate-400 mb-4">
          CRM создаёт клиента по телефону (или находит существующего) и заявку со статусом «новая».
          Ответственный менеджер назначается автоматически: выбирается активный пользователь с ролью
          «manager» с наименьшим числом заявок в статусах «новая» и «в работе» (равномерная нагрузка).
          В продакшене обязательно задайте <code className="text-emerald-400/90">SITE_WEBHOOK_SECRET</code> в
          окружении API и передавайте подпись тела запроса.
        </p>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Метод и URL</dt>
            <dd>
              <code className="block mt-1 p-2 rounded-lg bg-slate-900 border border-slate-600 break-all">
                POST {fullUrl}
              </code>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Заголовок подписи</dt>
            <dd>
              <code className="text-emerald-400/90">X-Webhook-Signature</code> — hex HMAC-SHA256 от{" "}
              <strong>сырых байт</strong> тела (как в CRM: <code className="text-slate-400">hmac.new(secret, body, sha256).hexdigest()</code>
              ).
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Телефония (webhook)</h2>
        <p className="text-sm text-slate-400 mb-4">
          Входящие события телефонии создают заявку со статусом «Новая» и источником <code className="text-slate-300">telephony</code>.
          Дедупликация идёт по <code className="text-slate-300">call_id</code>.
        </p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Метод и URL</dt>
            <dd>
              <code className="block mt-1 p-2 rounded-lg bg-slate-900 border border-slate-600 break-all">
                POST {telephonyUrl}
              </code>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Заголовок подписи</dt>
            <dd>
              <code className="text-emerald-400/90">X-Telephony-Signature</code> — hex HMAC-SHA256 от сырых байт тела.
              Секрет: <code className="text-slate-300">TELEPHONY_WEBHOOK_SECRET</code>.
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">SMS</h2>
        <p className="text-sm text-slate-400 mb-4">
          Используется очередь (Celery). Настройки берутся из окружения API:
          <code className="text-slate-300"> SMS_API_KEY</code>, <code className="text-slate-300">SMS_SENDER</code>.
          Шаблоны можно создавать через API <code className="text-slate-300">/api/v1/notifications/templates</code>.
        </p>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Онлайн-оплата</h2>
        <p className="text-sm text-slate-400">
          Сейчас реализована заглушка инициализации платежа (создаётся pending-платёж).
          Для реальной интеграции задайте <code className="text-slate-300">YOOKASSA_SHOP_ID</code>,{" "}
          <code className="text-slate-300">YOOKASSA_SECRET_KEY</code>,{" "}
          <code className="text-slate-300">YOOKASSA_WEBHOOK_SECRET</code>.
        </p>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5">
        <h3 className="text-md font-semibold text-slate-100 mb-2">Пример JSON</h3>
        <p className="text-slate-400 text-sm mb-2">
          Поля: <code className="text-slate-300">first_name</code>, <code className="text-slate-300">phone</code>{" "}
          обязательны; <code className="text-slate-300">service_type</code> —{" "}
          <code className="text-slate-400">rafting</code>, <code className="text-slate-400">hostel</code>,{" "}
          <code className="text-slate-400">rent</code>, <code className="text-slate-400">combined</code> или не
          передавать.
        </p>
        <pre className="text-xs overflow-x-auto p-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-300">
          {EXAMPLE_JSON}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-5">
        <h3 className="text-md font-semibold text-slate-100 mb-2">Подпись (Python)</h3>
        <pre className="text-xs overflow-x-auto p-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 whitespace-pre-wrap">
          {PYTHON_SIGN_SNIPPET}
        </pre>
      </section>

      <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-200/90">
        <strong className="text-amber-100">Продакшен:</strong> без{" "}
        <code className="text-amber-100/80">SITE_WEBHOOK_SECRET</code> endpoint отключён. В разработке секрет
        можно не задавать — подпись не проверяется.
      </section>
    </div>
  );
}
