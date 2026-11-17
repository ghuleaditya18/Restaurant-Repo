from decimal import Decimal
from pydantic import BaseModel, ConfigDict

from app.models.entities import OrderStatus, TableStatus


class DashboardStatistics(BaseModel):
    total_orders: int
    total_customers: int
    total_staff: int
    total_menu_items: int
    pending_orders: int
    preparing_orders: int
    completed_orders: int
    total_tables: int
    available_tables: int
    occupied_tables: int
    today_orders: int = 0
    active_orders: int = 0
    pending_payments: int = 0


class RecentOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    table_number: str
    items_count: int
    subtotal: Decimal
    status: OrderStatus


class TableStatusSummary(BaseModel):
    id: int
    number: str
    status: TableStatus
    orders: int


class DashboardSummaryResponse(BaseModel):
    statistics: DashboardStatistics
    recent_orders: list[RecentOrderResponse]
    tables: list[TableStatusSummary] = []
