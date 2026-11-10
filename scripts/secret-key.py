"""Print a KNOWRA_SECRET_KEY for .env or deployment configuration.

Usage: python scripts/secret-key.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.secrets import generate_key

print(generate_key())
