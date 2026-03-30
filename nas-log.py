#!/usr/bin/env python
"""NAS 서버 로그 확인"""
import subprocess

NAS = "namu@192.168.0.177"
SSH = ["ssh", "-p", "3030", NAS]

def run():
    r = subprocess.run(SSH + ["tail -50 /tmp/battle-arena.log 2>/dev/null"], capture_output=True, text=True, timeout=10)
    print(r.stdout.strip() or "(로그 없음)")

if __name__ == "__main__":
    run()
