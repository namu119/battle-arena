#!/usr/bin/env python
"""NAS 서버 시작: git pull + node server 실행"""
import subprocess, time

NAS = "namu@192.168.0.177"
SSH = ["ssh", "-p", "3030", NAS]

def ssh(cmd):
    r = subprocess.run(SSH + [cmd], capture_output=True, text=True, timeout=15)
    return r.stdout.strip(), r.stderr.strip()

def run():
    print("[1/3] 기존 서버 중지...")
    ssh('pkill -f "node server/index.js" 2>/dev/null; exit 0')
    time.sleep(1)

    print("[2/3] git pull...")
    out, err = ssh("cd ~/battle-arena && git pull 2>&1")
    print(out or err)

    print("[3/3] 서버 시작...")
    # Popen으로 SSH 세션을 non-blocking 실행
    proc = subprocess.Popen(
        SSH + ["cd ~/battle-arena && nohup node server/index.js > /tmp/battle-arena.log 2>&1 & disown; sleep 1; echo STARTED"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    try:
        out, _ = proc.communicate(timeout=10)
        print(out.strip())
    except subprocess.TimeoutExpired:
        proc.kill()

    time.sleep(1)
    out, _ = ssh('ps aux | grep "node server/index.js" | grep -v grep')
    if out:
        print(f"\n서버 실행 중: http://192.168.0.177:3456")
    else:
        print("\n서버 시작 실패! 로그:")
        out, _ = ssh("tail -20 /tmp/battle-arena.log")
        print(out)

if __name__ == "__main__":
    run()
