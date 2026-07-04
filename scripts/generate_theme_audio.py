from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 22_050
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "audio"


def midi_to_freq(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def triangle(phase: float) -> float:
    return 2.0 * abs(2.0 * (phase - math.floor(phase + 0.5))) - 1.0


def envelope(t: float, duration: float, attack: float, release: float, curve: float = 1.0) -> float:
    if t < 0.0 or t > duration:
        return 0.0
    if attack > 0 and t < attack:
        return (t / attack) ** curve
    if release > 0 and t > duration - release:
        return max(0.0, ((duration - t) / release) ** curve)
    return 1.0


def add_tone(
    buf: list[float],
    note: float,
    start: float,
    duration: float,
    volume: float,
    instrument: str,
    detune: float = 0.0,
) -> None:
    start_i = max(0, int(start * SAMPLE_RATE))
    end_i = min(len(buf), int((start + duration) * SAMPLE_RATE))
    if end_i <= start_i:
        return

    freq = midi_to_freq(note + detune / 100.0)
    for i in range(start_i, end_i):
        t = i / SAMPLE_RATE - start
        if instrument == "peach_pad":
            env = envelope(t, duration, 1.4, 2.3, 1.4)
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.55
                + math.sin(2 * math.pi * freq * 1.005 * t) * 0.35
                + triangle((freq * 0.5 * t) % 1.0) * 0.1
            )
        elif instrument == "music_box":
            env = math.exp(-3.4 * t / max(duration, 0.01)) * envelope(t, duration, 0.012, duration * 0.86, 0.55)
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.72
                + math.sin(2 * math.pi * freq * 2.01 * t) * 0.2
                + math.sin(2 * math.pi * freq * 3.02 * t) * 0.08
            )
        elif instrument == "wind_bell":
            env = math.exp(-2.2 * t / max(duration, 0.01)) * envelope(t, duration, 0.008, duration * 0.92, 0.45)
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.55
                + math.sin(2 * math.pi * freq * 2.68 * t) * 0.25
                + math.sin(2 * math.pi * freq * 4.12 * t) * 0.14
                + math.sin(2 * math.pi * freq * 5.4 * t) * 0.06
            )
        elif instrument == "mint_air":
            env = envelope(t, duration, 1.0, 1.8, 1.2)
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.46
                + math.sin(2 * math.pi * freq * 1.5 * t) * 0.12
                + math.sin(2 * math.pi * freq * 2.0 * t) * 0.08
            )
        elif instrument == "night_drone":
            env = envelope(t, duration, 3.0, 4.2, 1.7)
            lfo = 1.0 + math.sin(2 * math.pi * 0.035 * t) * 0.018
            sample = (
                math.sin(2 * math.pi * freq * lfo * t) * 0.75
                + math.sin(2 * math.pi * freq * 2.0 * t) * 0.18
                + math.sin(2 * math.pi * freq * 0.5 * t) * 0.07
            )
        elif instrument == "night_beacon":
            env = envelope(t, duration, 1.2, 2.4, 1.2)
            vibrato = math.sin(2 * math.pi * 0.08 * t) * 0.004
            sample = math.sin(2 * math.pi * freq * (1.0 + vibrato) * t)
        else:
            env = envelope(t, duration, 0.02, 0.2)
            sample = math.sin(2 * math.pi * freq * t)

        buf[i] += sample * env * volume


def add_delay(buf: list[float], delay_seconds: float, feedback: float, mix: float) -> None:
    delay = int(delay_seconds * SAMPLE_RATE)
    if delay <= 0:
        return
    for i in range(delay, len(buf)):
        echoed = buf[i - delay] * feedback
        buf[i] += echoed * mix


def one_pole_lowpass(buf: list[float], cutoff: float) -> None:
    alpha = 1.0 - math.exp(-2.0 * math.pi * cutoff / SAMPLE_RATE)
    y = 0.0
    for i, sample in enumerate(buf):
        y += alpha * (sample - y)
        buf[i] = y


def crossfade_loop(buf: list[float], seconds: float = 0.75) -> None:
    n = min(len(buf) // 4, int(seconds * SAMPLE_RATE))
    if n <= 0:
        return
    tail = buf[-n:].copy()
    for i in range(n):
        a = i / n
        buf[i] = buf[i] * a + tail[i] * (1.0 - a)
        buf[-n + i] *= 1.0 - a


def normalize(buf: list[float], peak: float = 0.78) -> None:
    current = max(abs(v) for v in buf) or 1.0
    gain = peak / current
    for i, value in enumerate(buf):
        softened = math.tanh(value * gain * 1.15) / math.tanh(1.15)
        buf[i] = clamp(softened * peak, -0.98, 0.98)


def write_wav(path: Path, buf: list[float]) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for sample in buf:
            frames.extend(struct.pack("<h", int(clamp(sample, -1.0, 1.0) * 32767)))
        wav.writeframes(frames)


def make_buffer(duration: float) -> list[float]:
    return [0.0 for _ in range(int(duration * SAMPLE_RATE))]


def render_peach() -> list[float]:
    duration = 52.0
    buf = make_buffer(duration)
    chords = [
        (0, [41, 48, 53, 57]),
        (6.5, [45, 52, 57, 60]),
        (13, [46, 53, 58, 62]),
        (19.5, [43, 50, 55, 58]),
        (26, [41, 48, 53, 60]),
        (32.5, [48, 55, 60, 64]),
        (39, [46, 53, 57, 62]),
        (45.5, [43, 50, 55, 62]),
    ]
    for start, notes in chords:
        for offset, note in enumerate(notes):
            add_tone(buf, note, start, 8.2, 0.030 + offset * 0.002, "peach_pad", detune=-3 + offset * 2)
        for offset, note in enumerate(notes[1:]):
            add_tone(buf, note + 12, start + 0.55 + offset * 0.55, 2.4, 0.019, "music_box")

    melody = [
        (2.8, 65, 3.5), (8.5, 64, 3.2), (14.6, 60, 4.2), (21.8, 58, 3.2),
        (27.4, 60, 3.8), (33.8, 65, 4.2), (40.2, 67, 3.7), (46.4, 64, 4.8),
    ]
    for start, note, dur in melody:
        add_tone(buf, note, start, dur, 0.032, "peach_pad")
        add_tone(buf, note + 12, start + 0.16, dur * 0.48, 0.014, "music_box")

    signature = [(0.18, 65), (0.74, 69), (1.28, 72), (2.05, 77)]
    for start, note in signature:
        add_tone(buf, note, start, 2.4, 0.034, "music_box")
    add_tone(buf, 53, 0.0, 6.2, 0.022, "peach_pad")

    add_delay(buf, 0.46, 0.24, 0.42)
    one_pole_lowpass(buf, 3200)
    crossfade_loop(buf)
    normalize(buf, 0.72)
    return buf


def render_mint() -> list[float]:
    duration = 48.0
    buf = make_buffer(duration)
    pads = [
        (0, [50, 57, 62, 66]),
        (12, [45, 52, 57, 62]),
        (24, [47, 54, 59, 66]),
        (36, [42, 50, 57, 62]),
    ]
    for start, notes in pads:
        for offset, note in enumerate(notes):
            add_tone(buf, note + 12, start, 12.5, 0.012 + offset * 0.001, "mint_air", detune=-6 + offset * 4)

    chimes = [74, 78, 81, 86, 83, 81, 78, 76, 74, 76, 78, 83, 86, 88, 86, 83]
    for cycle in range(2):
        base = cycle * 22.5
        for i, note in enumerate(chimes):
            start = base + i * 1.25 + (0.16 if i % 4 == 2 else 0)
            add_tone(buf, note, start, 2.1, 0.020 if i % 5 == 0 else 0.014, "wind_bell", detune=7 if i % 2 else -8)

    wind = [(5.5, 69), (11.0, 74), (17.5, 78), (25.0, 81), (32.5, 83), (39.0, 78), (44.0, 74)]
    for start, note in wind:
        add_tone(buf, note, start, 4.4, 0.018, "mint_air", detune=4)

    opening_cascade = [86, 90, 93, 98, 95, 90, 86]
    for i, note in enumerate(opening_cascade):
        add_tone(buf, note, 0.08 + i * 0.28, 2.2, 0.021, "wind_bell", detune=(-10 if i % 2 else 12))

    add_delay(buf, 0.24, 0.36, 0.55)
    one_pole_lowpass(buf, 7200)
    crossfade_loop(buf)
    normalize(buf, 0.66)
    return buf


def render_night() -> list[float]:
    duration = 56.0
    buf = make_buffer(duration)
    drones = [
        (0, [33, 40, 45, 48]),
        (18, [31, 38, 43, 47]),
        (36, [29, 36, 41, 45]),
    ]
    for start, notes in drones:
        for offset, note in enumerate(notes):
            add_tone(buf, note, start, 22.0, 0.042 if offset == 0 else 0.018, "night_drone", detune=-8 + offset * 5)

    beacons = [(6, 64, 7.5), (19, 67, 6.5), (32, 69, 8), (46, 60, 6.5)]
    for start, note, dur in beacons:
        add_tone(buf, note, start, dur, 0.024, "night_beacon", detune=-2)

    stars = [(12, 76), (26, 79), (40, 72), (51, 81)]
    for start, note in stars:
        add_tone(buf, note, start, 4.0, 0.008, "wind_bell", detune=4)

    add_tone(buf, 28, 0.0, 10.0, 0.055, "night_drone", detune=-8)
    add_tone(buf, 52, 1.6, 7.0, 0.020, "night_beacon", detune=-4)
    add_tone(buf, 76, 4.8, 4.4, 0.008, "wind_bell", detune=5)

    add_delay(buf, 0.72, 0.18, 0.28)
    one_pole_lowpass(buf, 1800)
    crossfade_loop(buf, 1.2)
    normalize(buf, 0.76)
    return buf


def render_peach_stinger() -> list[float]:
    buf = make_buffer(3.2)
    for start, note in [(0.02, 65), (0.36, 69), (0.72, 72), (1.18, 77)]:
        add_tone(buf, note, start, 2.0, 0.060, "music_box")
    add_tone(buf, 53, 0.0, 3.0, 0.026, "peach_pad")
    add_delay(buf, 0.32, 0.24, 0.38)
    one_pole_lowpass(buf, 3600)
    normalize(buf, 0.66)
    return buf


def render_mint_stinger() -> list[float]:
    buf = make_buffer(3.2)
    for i, note in enumerate([86, 90, 93, 98, 95, 90]):
        add_tone(buf, note, 0.03 + i * 0.18, 2.1, 0.046, "wind_bell", detune=12 if i % 2 else -10)
    add_tone(buf, 74, 0.2, 2.5, 0.020, "mint_air")
    add_delay(buf, 0.2, 0.34, 0.58)
    one_pole_lowpass(buf, 7600)
    normalize(buf, 0.62)
    return buf


def render_night_stinger() -> list[float]:
    buf = make_buffer(3.8)
    add_tone(buf, 28, 0.0, 3.7, 0.070, "night_drone", detune=-8)
    add_tone(buf, 40, 0.15, 3.4, 0.032, "night_drone", detune=6)
    add_tone(buf, 64, 0.82, 2.6, 0.026, "night_beacon", detune=-3)
    add_tone(buf, 76, 2.2, 1.4, 0.010, "wind_bell", detune=5)
    add_delay(buf, 0.62, 0.16, 0.3)
    one_pole_lowpass(buf, 2100)
    normalize(buf, 0.70)
    return buf


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tracks = {
        "theme-peach.wav": render_peach(),
        "theme-mint.wav": render_mint(),
        "theme-night.wav": render_night(),
        "theme-peach-stinger.wav": render_peach_stinger(),
        "theme-mint-stinger.wav": render_mint_stinger(),
        "theme-night-stinger.wav": render_night_stinger(),
    }
    for name, buf in tracks.items():
        path = OUT_DIR / name
        write_wav(path, buf)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
