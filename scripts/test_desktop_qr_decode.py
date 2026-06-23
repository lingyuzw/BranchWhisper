from __future__ import annotations

import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
STUDIO_HTML = ROOT / "apps" / "desktop" / "src" / "studio.html"
QR_GENERATOR = ROOT / "apps" / "desktop" / "src" / "qrcode-generator.js"


def _desktop_qr_source() -> str:
    html = STUDIO_HTML.read_text(encoding="utf-8")
    start = html.index("      const QRCode =")
    end = html.index("      function renderLocalQrSvgDataUrl(text)", start)
    return QR_GENERATOR.read_text(encoding="utf-8") + "\n" + html[start:end]


def _create_qr_modules(payload: str) -> dict:
    script = f"""
{_desktop_qr_source()}
const qr = QRCode.create({json.dumps(payload)});
console.log(JSON.stringify(qr.modules));
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def _render_modules(modules: dict) -> np.ndarray:
    size = int(modules["size"])
    data = np.array(modules["data"], dtype=np.bool_).reshape((size, size))
    quiet_zone = 4
    module_pixels = 12
    canvas = np.full((size + quiet_zone * 2, size + quiet_zone * 2), 255, dtype=np.uint8)
    qr_area = canvas[quiet_zone : quiet_zone + size, quiet_zone : quiet_zone + size]
    qr_area[data] = 0
    return np.repeat(np.repeat(canvas, module_pixels, axis=0), module_pixels, axis=1)


def test_desktop_local_qr_fallback_is_decodable_by_standard_scanner() -> None:
    payload = "https://branchwhisper.local/weixin/login?session=scan-test-001"
    image = _render_modules(_create_qr_modules(payload))

    decoded, _points, _straight = cv2.QRCodeDetector().detectAndDecode(image)

    assert decoded == payload
