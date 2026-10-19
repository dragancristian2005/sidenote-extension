#!/usr/bin/env python3
"""Generates icons/icon-{16,32,48,128}.png (no dependencies). Run from the repo root:
    python3 -I store/make_icons.py
The icon: a rounded blue tile with a white browser window whose right-hand side panel is highlighted."""
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
TOP, BOTTOM = (0x5B, 0x86, 0xFF), (0x2F, 0x5B, 0xE8)  # tile gradient, around the UI accent #3b6cf6
PANEL = (0x2A, 0x52, 0xD8)
PAGE_BAR = (0xC9, 0xD3, 0xEC)


def rrect(x0, y0, x1, y1, r):
    """Signed distance to a rounded rectangle (negative inside)."""
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    def sd(x, y):
        qx, qy = abs(x - cx) - (hx - r), abs(y - cy) - (hy - r)
        return (max(qx, 0) ** 2 + max(qy, 0) ** 2) ** 0.5 + min(max(qx, qy), 0) - r
    return sd


def bar(x, y, w, h=0.05):
    return rrect(x, y, x + w, y + h, h / 2)


def shapes(detail):
    s = [
        ("tile", rrect(0, 0, 1, 1, 0.22), None, 1.0),
        ("window", rrect(0.16, 0.22, 0.84, 0.78, 0.08), (255, 255, 255), 1.0),
        ("panel", rrect(0.56, 0.22, 0.84, 0.78, 0.08), PANEL, 1.0),
        ("panel-square", rrect(0.56, 0.22, 0.70, 0.78, 0.0), PANEL, 1.0),  # square off the panel's left corners
    ]
    if detail:
        s += [("pb1", bar(0.62, 0.33, 0.17), (255, 255, 255), 0.95), ("pb2", bar(0.62, 0.44, 0.12), (255, 255, 255), 0.95),
              ("pb3", bar(0.62, 0.55, 0.15), (255, 255, 255), 0.95)]
        s += [("mb1", bar(0.22, 0.33, 0.28), PAGE_BAR, 1.0), ("mb2", bar(0.22, 0.44, 0.22), PAGE_BAR, 1.0),
              ("mb3", bar(0.22, 0.55, 0.26), PAGE_BAR, 1.0), ("mb4", bar(0.22, 0.66, 0.15), PAGE_BAR, 1.0)]
    return s


def render(size):
    n = 4 if size >= 48 else 6  # n x n samples per pixel
    layers = shapes(detail=size >= 32)
    px = bytearray()
    for j in range(size):
        px.append(0)  # PNG filter: none
        for i in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]  # premultiplied rgb + alpha, averaged over samples
            for sj in range(n):
                for si in range(n):
                    x, y = (i + (si + 0.5) / n) / size, (j + (sj + 0.5) / n) / size
                    r = g = b = a = 0.0
                    for name, sd, col, alpha in layers:
                        if sd(x, y) > 0:
                            continue
                        if name == "tile":
                            t = y
                            col = tuple(TOP[k] + (BOTTOM[k] - TOP[k]) * t for k in range(3))
                        # source-over compositing of an opaque-ish layer
                        r, g, b, a = (col[0] * alpha + r * (1 - alpha), col[1] * alpha + g * (1 - alpha),
                                      col[2] * alpha + b * (1 - alpha), alpha + a * (1 - alpha))
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
            cnt = n * n
            a = acc[3] / cnt
            if a > 0:
                px += bytes([round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a * 255)])
            else:
                px += bytes(4)
    return bytes(px)


def png(size, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    for s in SIZES:
        with open(f"icons/icon-{s}.png", "wb") as f:
            f.write(png(s, render(s)))
        print("wrote", f"icons/icon-{s}.png")
