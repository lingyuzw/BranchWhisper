from __future__ import annotations

import numpy as np


class TtsPcmStream:
    def __init__(self, *, sample_rate: int, fade_ms: int, volume: float) -> None:
        self.sample_rate = sample_rate
        self.fade_ms = fade_ms
        self.volume = volume
        self.pending = b""
        self.tail = np.array([], dtype=np.int16)
        self.started = False

    def fade_samples(self) -> int:
        fade_ms = max(0, int(self.fade_ms))
        return int(self.sample_rate * fade_ms / 1000)

    def process(self, chunk: bytes) -> bytes:
        data = self.pending + chunk
        if len(data) < 2:
            self.pending = data
            return b""

        if len(data) % 2:
            self.pending = data[-1:]
            data = data[:-1]
        else:
            self.pending = b""

        samples = np.frombuffer(data, dtype="<i2").astype(np.float32)
        if samples.size == 0:
            return b""

        volume = float(np.clip(self.volume, 0.05, 1.5))
        samples *= volume

        fade_samples = self.fade_samples()
        if not self.started:
            fade_len = min(fade_samples, samples.size)
            if fade_len > 1:
                samples[:fade_len] *= np.linspace(0.0, 1.0, fade_len, dtype=np.float32)
            self.started = True

        samples = np.clip(samples, -32768, 32767).astype(np.int16)

        if fade_samples <= 0:
            return samples.astype("<i2", copy=False).tobytes()

        if self.tail.size:
            samples = np.concatenate([self.tail, samples])

        if samples.size <= fade_samples:
            self.tail = samples
            return b""

        send_samples = samples[:-fade_samples]
        self.tail = samples[-fade_samples:]
        return send_samples.astype("<i2", copy=False).tobytes()

    def finish(self) -> bytes:
        if self.pending:
            self.pending = b""

        tail = self.tail.astype(np.float32)
        self.tail = np.array([], dtype=np.int16)
        if tail.size == 0:
            return b""

        fade_len = min(self.fade_samples(), tail.size)
        if fade_len > 1:
            tail[-fade_len:] *= np.linspace(1.0, 0.0, fade_len, dtype=np.float32)

        tail = np.clip(tail, -32768, 32767).astype(np.int16)
        return tail.astype("<i2", copy=False).tobytes()
