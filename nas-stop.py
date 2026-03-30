#!/usr/bin/env python
"""NAS 서버 중지"""
import subprocess

NAS = "namu@192.168.0.177"
SSH = ["ssh", "-p", "3030", NAS]

def run():
    subprocess.run(SSH + ['pkill -f "node server/index.js" 2>/dev/null'], capture_output=True, timeout=10)
    r = subprocess.run(SSH + ['ps aux | grep "node server/index.js" | grep -v grep'], capture_output=True, text=True, timeout=10)
    if r.stdout.strip():
        print("서버가 아직 실행 중입니다")
    else:
        print("서버 중지 완료")

if __name__ == "__main__":
    run()
