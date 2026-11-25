import json
from pathlib import Path


_BRANDING_PATH = Path(__file__).resolve().parents[3] / "shared" / "app_branding.json"
with _BRANDING_PATH.open(encoding="utf-8") as _branding_file:
    BRANDING = json.load(_branding_file)

APP_NAME = BRANDING["product_name"]
MODULE_NAMES = BRANDING["modules"]
