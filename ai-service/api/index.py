import sys
from pathlib import Path

# Ensure ai-service root directory is in sys.path for absolute imports
_current_dir = Path(__file__).resolve().parent
_root_dir = _current_dir.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from app.main import app
