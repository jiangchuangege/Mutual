#!/bin/bash
# 验证大体积上传：6MB base64 的 body 应该被服务器读完（回 401/400），而不是 Connection reset
set -euo pipefail
head -c 6000000 /dev/urandom | base64 -w0 > /tmp/big.txt
cat > /tmp/test_upload.py <<'PY'
import json, urllib.request
data = open("/tmp/big.txt").read()
body = json.dumps({"kind": "audio", "data": data, "ext": "mp3"}).encode()
req = urllib.request.Request("http://127.0.0.1:8787/api/upload", data=body,
                             headers={"content-type": "application/json"})
try:
    r = urllib.request.urlopen(req, timeout=90)
    print("status", r.status, r.read()[:150])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read()[:150])
except Exception as e:
    print("ERR", type(e).__name__, str(e)[:160])
print("body bytes:", len(body))
PY
python3 /tmp/test_upload.py
rm -f /tmp/big.txt /tmp/test_upload.py
