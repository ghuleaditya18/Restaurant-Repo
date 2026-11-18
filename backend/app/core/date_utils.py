from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def get_kolkata_now() -> datetime:
    """Return the current datetime in Asia/Kolkata timezone."""
    return datetime.now(KOLKATA_TZ)


def get_kolkata_today() -> date:
    """Return current calendar date in Asia/Kolkata timezone."""
    return get_kolkata_now().date()


def get_date_range(
    preset: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[datetime | None, datetime | None]:
    """
    Resolve a date preset or custom range into inclusive start and end datetimes
    in the Asia/Kolkata timezone.
    
    Presets:
      - today: start of today to end of today
      - yesterday: start of yesterday to end of yesterday
      - last_7_days: 6 days ago start through today end (7 full days)
      - this_month: 1st of current month through today end
      - all: (None, None) -> no date restriction
      - custom: start_date to end_date (inclusive)
    """
    if preset:
        preset = preset.strip().lower()

    today = get_kolkata_today()

    if preset == "all":
        return None, None

    if preset == "yesterday":
        target = today - timedelta(days=1)
        start = target
        end = target
    elif preset == "last_7_days":
        start = today - timedelta(days=6)
        end = today
    elif preset == "this_month":
        start = today.replace(day=1)
        end = today
    elif preset == "custom" or (start_date is not None or end_date is not None):
        start = start_date or today
        end = end_date or start_date or today
        if start > end:
            start, end = end, start
    elif preset == "today":
        start = today
        end = today
    else:
        # Default when neither preset nor dates are given
        return None, None

    start_dt = datetime.combine(start, time.min).replace(tzinfo=KOLKATA_TZ)
    end_dt = datetime.combine(end, time.max).replace(tzinfo=KOLKATA_TZ)

    return start_dt, end_dt
