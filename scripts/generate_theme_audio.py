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
        elif instrument == "felt_pluck":
            env = math.exp(-2.35 * t / max(duration, 0.01)) * envelope(t, duration, 0.018, duration * 0.82, 0.7)
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.58
                + triangle((freq * 0.995 * t) % 1.0) * 0.22
                + math.sin(2 * math.pi * freq * 1.997 * t) * 0.14
                + math.sin(2 * math.pi * freq * 3.01 * t) * 0.06
            )
        elif instrument == "future_pulse":
            env = envelope(t, duration, 0.006, duration * 0.74, 0.45) * math.exp(-5.2 * t / max(duration, 0.01))
            sample = (
                math.sin(2 * math.pi * freq * t) * 0.7
                + math.sin(2 * math.pi * freq * 0.5 * t) * 0.2
                + triangle((freq * 0.25 * t) % 1.0) * 0.1
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


def add_motif(
    buf: list[float],
    start: float,
    notes: list[float],
    rhythm: list[float],
    volume: float,
    instrument: str,
    octave: int = 0,
    detune: float = 0.0,
) -> None:
    t = start
    for index, note in enumerate(notes):
        step = rhythm[index % len(rhythm)]
        add_tone(buf, note + octave * 12, t, step * 1.55, volume * (0.92 if index % 3 == 2 else 1.0), instrument, detune)
        t += step


def add_future_pulse(buf: list[float], start: float, end: float, note: float, every: float, volume: float) -> None:
    t = start
    while t < end:
        add_tone(buf, note, t, 0.72, volume, "future_pulse")
        add_tone(buf, note + 12, t + every * 0.48, 0.46, volume * 0.34, "future_pulse")
        t += every


def render_peach() -> list[float]:
    duration = 56.0
    buf = make_buffer(duration)
    chords = [
        (0, [41, 48, 52, 57, 64]),
        (7, [45, 52, 57, 60, 64]),
        (14, [46, 53, 57, 62, 65]),
        (21, [43, 50, 55, 59, 62]),
        (28, [41, 48, 53, 57, 64]),
        (35, [38, 45, 53, 57, 62]),
        (42, [46, 53, 58, 62, 65]),
        (49, [43, 50, 55, 59, 64]),
    ]
    for start, notes in chords:
        for offset, note in enumerate(notes):
            add_tone(buf, note, start, 9.4, 0.024 + offset * 0.0016, "peach_pad", detune=-4 + offset * 2)
        for offset, note in enumerate(notes[1:]):
            add_tone(buf, note + 12, start + 0.46 + offset * 0.52, 2.2, 0.013, "music_box")

    hook = [65, 69, 72, 76, 74, 72, 69, 65]
    hook_rhythm = [0.62, 0.62, 0.86, 1.36, 0.76, 0.86, 1.2, 1.7]
    for start, volume in [(0.22, 0.032), (28.4, 0.026)]:
        add_motif(buf, start, hook, hook_rhythm, volume, "felt_pluck")
        add_motif(buf, start + 0.09, hook, hook_rhythm, volume * 0.38, "music_box", octave=1)

    answer = [
        (7.8, 72, 2.8), (11.4, 69, 2.6), (15.2, 67, 3.4), (20.0, 64, 3.2),
        (36.8, 76, 2.9), (40.4, 74, 2.4), (44.2, 72, 3.6), (50.2, 69, 4.1),
    ]
    for start, note, dur in answer:
        add_tone(buf, note, start, dur, 0.026, "peach_pad")
        add_tone(buf, note + 12, start + 0.14, dur * 0.42, 0.010, "music_box")

    add_future_pulse(buf, 3.2, duration - 1.0, 41, 7.0, 0.006)

    add_delay(buf, 0.46, 0.24, 0.42)
    one_pole_lowpass(buf, 3200)
    crossfade_loop(buf)
    normalize(buf, 0.72)
    return buf


def render_mint() -> list[float]:
    duration = 50.0
    buf = make_buffer(duration)
    pads = [
        (0, [50, 57, 62, 66, 69]),
        (12.5, [47, 54, 59, 62, 66]),
        (25, [45, 52, 57, 62, 64]),
        (37.5, [43, 50, 57, 62, 66]),
    ]
    for start, notes in pads:
        for offset, note in enumerate(notes):
            add_tone(buf, note + 12, start, 13.0, 0.009 + offset * 0.0008, "mint_air", detune=-7 + offset * 4)

    hook = [86, 90, 93, 98, 95, 90, 86, 81]
    hook_rhythm = [0.34, 0.34, 0.46, 0.7, 0.46, 0.52, 0.86, 1.2]
    for base, volume in [(0.06, 0.027), (16.4, 0.020), (32.5, 0.022)]:
        add_motif(buf, base, hook, hook_rhythm, volume, "wind_bell", detune=8)
        add_motif(buf, base + 0.18, [note - 12 for note in hook], hook_rhythm, volume * 0.28, "mint_air", detune=-5)

    wind = [(5.5, 74), (10.5, 78), (15.4, 81), (22.5, 83), (28.5, 86), (36.8, 83), (44.0, 78)]
    for start, note in wind:
        add_tone(buf, note, start, 4.8, 0.014, "mint_air", detune=4)

    add_future_pulse(buf, 4.0, duration - 1.0, 50, 6.25, 0.0048)

    add_delay(buf, 0.24, 0.36, 0.55)
    one_pole_lowpass(buf, 7200)
    crossfade_loop(buf)
    normalize(buf, 0.66)
    return buf


def render_night() -> list[float]:
    duration = 58.0
    buf = make_buffer(duration)
    drones = [
        (0, [33, 40, 45, 52]),
        (19, [31, 38, 43, 50]),
        (38, [29, 36, 41, 48]),
    ]
    for start, notes in drones:
        for offset, note in enumerate(notes):
            add_tone(buf, note, start, 23.0, 0.040 if offset == 0 else 0.016, "night_drone", detune=-9 + offset * 5)

    beacons = [(5.8, 64, 7.6), (18.2, 68, 6.2), (30.6, 71, 7.8), (45.0, 60, 6.8)]
    for start, note, dur in beacons:
        add_tone(buf, note, start, dur, 0.021, "night_beacon", detune=-2)

    stars = [(11.5, 76), (25.0, 80), (39.5, 72), (52.5, 83)]
    for start, note in stars:
        add_tone(buf, note, start, 4.4, 0.007, "wind_bell", detune=4)

    hook = [64, 68, 71, 76, 74, 71, 68, 64]
    hook_rhythm = [1.0, 0.82, 1.15, 2.2, 0.9, 1.1, 1.4, 2.6]
    add_motif(buf, 1.2, hook, hook_rhythm, 0.021, "night_beacon")
    add_motif(buf, 29.0, hook, hook_rhythm, 0.017, "night_beacon")

    add_future_pulse(buf, 2.5, duration - 2.0, 33, 9.5, 0.007)

    add_delay(buf, 0.72, 0.18, 0.28)
    one_pole_lowpass(buf, 1800)
    crossfade_loop(buf, 1.2)
    normalize(buf, 0.76)
    return buf


def render_peach_stinger() -> list[float]:
    buf = make_buffer(3.6)
    add_motif(buf, 0.02, [65, 69, 72, 76, 74, 72], [0.28, 0.28, 0.38, 0.64, 0.38, 0.7], 0.058, "felt_pluck")
    add_motif(buf, 0.08, [77, 81, 84], [0.42, 0.5, 0.95], 0.020, "music_box")
    add_tone(buf, 53, 0.0, 3.4, 0.026, "peach_pad")
    add_tone(buf, 41, 0.0, 2.7, 0.014, "future_pulse")
    add_delay(buf, 0.32, 0.24, 0.38)
    one_pole_lowpass(buf, 3600)
    normalize(buf, 0.66)
    return buf


def render_mint_stinger() -> list[float]:
    buf = make_buffer(3.6)
    add_motif(buf, 0.02, [86, 90, 93, 98, 95, 90, 86], [0.16, 0.16, 0.22, 0.36, 0.24, 0.34, 0.82], 0.050, "wind_bell", detune=10)
    add_motif(buf, 0.24, [74, 78, 81], [0.46, 0.58, 1.1], 0.018, "mint_air")
    add_tone(buf, 50, 0.0, 2.8, 0.012, "future_pulse")
    add_delay(buf, 0.2, 0.34, 0.58)
    one_pole_lowpass(buf, 7600)
    normalize(buf, 0.62)
    return buf


def render_night_stinger() -> list[float]:
    buf = make_buffer(4.2)
    add_tone(buf, 28, 0.0, 4.1, 0.066, "night_drone", detune=-8)
    add_tone(buf, 40, 0.16, 3.8, 0.030, "night_drone", detune=6)
    add_motif(buf, 0.7, [64, 68, 71, 76, 74], [0.52, 0.48, 0.72, 1.05, 0.95], 0.025, "night_beacon")
    add_tone(buf, 83, 2.85, 1.25, 0.007, "wind_bell", detune=5)
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
