import csv
from io import StringIO

from app.modules.reports.schemas import ReportSummaryResponse

_METHOD_RU = {
    "cash": "Наличные",
    "card": "Карта",
    "transfer": "Перевод",
    "online": "Онлайн",
}

_SERVICE_RU = {
    "rafting": "Сплав",
    "hostel": "Хостел",
    "rent": "Аренда",
    "combined": "Комбо",
}


def render_report_summary_csv(data: ReportSummaryResponse) -> str:
    """CSV с разделителем `;` и UTF-8 BOM для Excel."""
    buf = StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    w.writerow(["Показатель", "Значение"])
    w.writerow(["Период с", data.period_start.isoformat()])
    w.writerow(["Период по", data.period_end.isoformat()])
    w.writerow(["Выручка за период", f"{data.revenue_in_period:.2f}"])
    w.writerow(["Задолженность (снимок)", f"{data.outstanding_debt:.2f}"])
    w.writerow([])
    w.writerow(["По способу оплаты", "Сумма"])
    for row in data.by_method:
        label = _METHOD_RU.get(row.method, row.method)
        w.writerow([label, f"{row.amount:.2f}"])
    w.writerow([])
    w.writerow(["По типу услуги", "Сумма"])
    for row in data.by_service:
        label = _SERVICE_RU.get(row.service_type, row.service_type)
        w.writerow([label, f"{row.amount:.2f}"])
    return "\ufeff" + buf.getvalue()
