import datetime

import babel.dates

# For Python 3.9+, use zoneinfo
try:
    from zoneinfo import ZoneInfo
except ImportError:
    # For Python <3.9, use pytz
    import pytz


def convert_period_to_wrapping_months(
    start_datetime: datetime.datetime, end_datetime: datetime.datetime
) -> list[tuple[datetime.datetime, datetime.datetime]]:
    """Take a period (t0,t1) and return a list of months containing this period, [(m0,m1),(m1,m2),...(mn-1,mn)])"""
    periods = []
    current_datetime = start_datetime
    while current_datetime <= end_datetime:
        month_start = current_datetime.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month = (month_start + datetime.timedelta(days=32)).replace(day=1)

        periods.append((month_start, next_month))
        # Move to the next month
        current_datetime = next_month
    return periods


def convert_month_to_str(month_start: datetime.datetime) -> str:
    return f"{month_start.strftime('%Y-%m')}"


# Custom filter function
def format_datetime(value: datetime.datetime, desired_format="medium"):
    # Convert the datetime to Paris timezone
    try:
        paris_tz = ZoneInfo("Europe/Paris")
        value = value.astimezone(paris_tz)
    except NameError:
        # If zoneinfo is not available, use pytz
        paris_tz = pytz.timezone("Europe/Paris")
        value = value.astimezone(paris_tz)

    # Format the datetime using Babel with French locale
    return babel.dates.format_datetime(value, format=desired_format, locale="fr_FR")
