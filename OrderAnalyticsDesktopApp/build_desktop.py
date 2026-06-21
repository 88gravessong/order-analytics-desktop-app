#!/usr/bin/env python3

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
ENTRYPOINT = ROOT / "app" / "scripts" / "run_service.py"
WEB_ASSETS = ROOT / "app" / "assets" / "web-template"
DATA_SEPARATOR = ";" if os.name == "nt" else ":"


def main() -> None:
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name",
        "OrderAnalytics",
        "--add-data",
        f"{WEB_ASSETS}{DATA_SEPARATOR}app/assets/web-template",
        str(ENTRYPOINT),
    ]
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
