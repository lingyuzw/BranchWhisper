from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dialog.voice_pipeline import TtsPcmStream


def pcm_bytes(values: list[int]) -> bytes:
    return np.array(values, dtype="<i2").tobytes()


def pcm_values(data: bytes) -> list[int]:
    return np.frombuffer(data, dtype="<i2").astype(int).tolist()


class TtsPcmStreamTests(unittest.TestCase):
    def test_pcm_stream_aligns_odd_chunks_and_flushes_faded_tail(self) -> None:
        stream = TtsPcmStream(sample_rate=1000, fade_ms=2, volume=1.0)

        first = stream.process(pcm_bytes([1000, 2000])[:3])
        second = stream.process(pcm_bytes([1000, 2000])[3:] + pcm_bytes([3000, 4000]))
        tail = stream.finish()

        self.assertEqual([], pcm_values(first))
        self.assertEqual([1000, 2000], pcm_values(second))
        self.assertEqual([3000, 0], pcm_values(tail))

    def test_pcm_stream_applies_start_fade_when_first_chunk_has_enough_samples(self) -> None:
        stream = TtsPcmStream(sample_rate=1000, fade_ms=2, volume=1.0)

        output = stream.process(pcm_bytes([1000, 2000, 3000, 4000]))
        tail = stream.finish()

        self.assertEqual([0, 2000], pcm_values(output))
        self.assertEqual([3000, 0], pcm_values(tail))

    def test_pcm_stream_clips_volume_before_output(self) -> None:
        stream = TtsPcmStream(sample_rate=1000, fade_ms=0, volume=3.0)

        output = stream.process(pcm_bytes([30000, -30000]))

        self.assertEqual([32767, -32768], pcm_values(output))


if __name__ == "__main__":
    unittest.main()
