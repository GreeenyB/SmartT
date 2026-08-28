from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from urllib.request import Request, urlopen

import server.app as app


def main() -> None:
    old_data, old_db = app.DATA_DIR, app.DB_PATH
    old_flag = os.environ.get("SMARTT_ENABLE_ML")
    try:
        with tempfile.TemporaryDirectory() as directory:
            app.DATA_DIR = Path(directory)
            app.DB_PATH = app.DATA_DIR / "smartt.db"
            os.environ["SMARTT_ENABLE_ML"] = "0"
            app._ml_shadow = None
            app.init_db()
            httpd = app.ThreadingHTTPServer(("127.0.0.1", 0), app.SmartTHandler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{httpd.server_port}"
            body = json.dumps({
                "vehicle_id": "HTTP-SMOKE", "fuel_percent": 72.0,
                "ignition": False, "current_event": "NORMAL",
            }).encode()
            request = Request(base + "/api/ingest", data=body,
                              headers={"Content-Type": "application/json"}, method="POST")
            assert json.load(urlopen(request))["ok"]
            assert json.load(urlopen(base + "/api/health"))["ok"]
            assert json.load(urlopen(base + "/api/latest"))["vehicle_id"] == "HTTP-SMOKE"
            assert len(json.load(urlopen(base + "/api/history?limit=5"))) == 1
            assert json.load(urlopen(base + "/api/events?limit=5")) == []
            httpd.shutdown()
            thread.join()
            httpd.server_close()
            print("HTTP API smoke passed: health latest history events ingest")
    finally:
        app.DATA_DIR, app.DB_PATH = old_data, old_db
        if old_flag is None:
            os.environ.pop("SMARTT_ENABLE_ML", None)
        else:
            os.environ["SMARTT_ENABLE_ML"] = old_flag


if __name__ == "__main__":
    main()
