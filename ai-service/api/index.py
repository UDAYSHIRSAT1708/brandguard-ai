import sys
from pathlib import Path

# Ensure ai-service root directory is in sys.path for absolute imports
_current_dir = Path(__file__).resolve().parent
_root_dir = _current_dir.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from app.main import app as _app

class VercelPathFixMiddleware:
    """
    ASGI middleware that restores the client's original requested path
    from Vercel's rewrite headers (x-matched-path, x-forwarded-uri) when
    requests are rewritten to serverless entrypoints (/api/index).
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            headers = dict(scope.get("headers", []))
            matched_path = headers.get(b"x-matched-path")
            if matched_path:
                clean_path = matched_path.decode("latin1").split("?")[0]
                scope["path"] = clean_path
                scope["raw_path"] = clean_path.encode("latin1")
            elif scope.get("path") in ("/api/index", "/api/index.py", "/api"):
                forwarded_uri = headers.get(b"x-forwarded-uri") or headers.get(b"x-now-route-matches")
                if forwarded_uri:
                    clean_path = forwarded_uri.decode("latin1").split("?")[0]
                    scope["path"] = clean_path
                    scope["raw_path"] = clean_path.encode("latin1")
        await self.app(scope, receive, send)

app = VercelPathFixMiddleware(_app)
