"""The repository parity gate is part of the unit suite as well as make verify."""

import subprocess
import sys
from pathlib import Path


def test_i18n_parity_script_passes():
    script = Path(__file__).resolve().parents[3] / "scripts" / "check_i18n_parity.py"
    completed = subprocess.run(
        [sys.executable, str(script)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
