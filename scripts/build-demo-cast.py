#!/usr/bin/env python3
"""Build a synthetic asciicast v2 file from real harvest output, then convert to GIF."""

import json
import subprocess
import time
import os
import sys

CAST = "/tmp/harvest-demo.cast"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GIF = os.path.join(SCRIPT_DIR, "..", "docs", "demo.gif")
os.makedirs(os.path.dirname(GIF), exist_ok=True)

COLS = 96
ROWS = 30

# ── Capture real outputs ──────────────────────────────────

# Clean up previous run
subprocess.run(["rm", "-rf", "/tmp/harvest-demo-articles"], check=False)

download_result = subprocess.run(
    ["node", "--import", "tsx", "packages/cli/src/index.ts",
     "download", "https://lexpresso.io/blog/",
     "--limit", "5", "--delay", "300",
     "-o", "/tmp/harvest-demo-articles",
     "--no-llm", "--render=never", "--refresh-adapter"],
    capture_output=True, text=True
)
download_out = download_result.stdout + download_result.stderr

# Find the first .md file for the cat demo
articles_dir = "/tmp/harvest-demo-articles"
md_files = sorted(f for f in os.listdir(articles_dir) if f.endswith(".md")) if os.path.isdir(articles_dir) else []
if md_files:
    with open(os.path.join(articles_dir, md_files[0])) as f:
        cat_lines = f.readlines()[:16]
    cat_out = "".join(cat_lines)
    cat_filename = md_files[0]
else:
    cat_out = "(no file)\n"
    cat_filename = "article.md"


# ── Build .cast ───────────────────────────────────────────

class CastWriter:
    def __init__(self, path: str, cols: int, rows: int):
        self.path = path
        self.t = 0.0
        self.f = open(path, "w")
        header = {"version": 2, "width": cols, "height": rows,
                  "timestamp": int(time.time()),
                  "env": {"SHELL": "/bin/zsh", "TERM": "xterm-256color"}}
        self.f.write(json.dumps(header) + "\n")

    def emit(self, delay: float, text: str):
        self.t = round(self.t + delay, 3)
        self.f.write(json.dumps([self.t, "o", text]) + "\n")

    def type_cmd(self, cmd: str, char_delay: float = 0.04):
        for ch in cmd:
            self.emit(char_delay, ch)
        self.emit(0.3, "")

    def newline(self):
        self.emit(0.0, "\r\n")

    def print_line(self, line: str, delay: float = 0.05):
        self.emit(delay, line + "\r\n")

    def close(self):
        self.f.close()


w = CastWriter(CAST, COLS, ROWS)

# Scene 1: harvest download
w.emit(0.5, "$ ")
w.type_cmd("harvest download https://lexpresso.io/blog/ --limit 5 -o ./articles")
w.newline()

for line in download_out.splitlines():
    if "\u2705" in line:  # ✅
        w.print_line(line, delay=0.8)
    elif line.strip() == "":
        w.print_line("", delay=0.1)
    else:
        w.print_line(line, delay=0.2)

w.emit(1.5, "")

# Scene 2: cat article
w.emit(0.3, "$ ")
w.type_cmd(f"cat articles/{cat_filename} | head -16")
w.newline()

for line in cat_out.splitlines():
    w.print_line(line, delay=0.05)

w.emit(3.0, "")
w.close()

# ── Convert to GIF ───────────────────────────────────────

subprocess.run([
    "agg", CAST, GIF,
    "--font-size", "14",
    "--speed", "1",
    "--idle-time-limit", "2",
    "--last-frame-duration", "4",
], check=True)

os.remove(CAST)
subprocess.run(["rm", "-rf", "/tmp/harvest-demo-articles"], check=False)

size = os.path.getsize(GIF)
print(f"Demo GIF: {GIF} ({size // 1024}K)")
