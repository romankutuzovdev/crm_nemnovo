from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.deals.repository import DealRepository
from app.modules.leads.repository import LeadRepository
from app.modules.users.repository import UserRepository


async def pick_manager_by_load(session: AsyncSession) -> UUID | None:
    """
    Выбирает менеджера с минимальной текущей нагрузкой.
    Нагрузка = открытые лиды + активные сделки.
    """
    user_repo = UserRepository(session)
    lead_repo = LeadRepository(session)
    deal_repo = DealRepository(session)

    managers = await user_repo.list_active_by_role_name("manager")
    if not managers:
        return None

    scored: list[tuple[int, str, UUID]] = []
    for manager in managers:
        lead_count = await lead_repo.count_open_leads_for_manager(manager.id)
        deal_count = await deal_repo.count_open_deals_for_manager(manager.id)
        load = int(lead_count) + int(deal_count)
        scored.append((load, manager.full_name.lower(), manager.id))

    scored.sort(key=lambda row: (row[0], row[1]))
    return scored[0][2]
