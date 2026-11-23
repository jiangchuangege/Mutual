#!/bin/bash
cd ~/backup || exit 1
OLD=twospace-20261108-161223.tgz
NEW=twospace-20261108-234312.tgz
for f in "$OLD" "$NEW"; do
  echo "=== $f ==="
  tar tzvf "$f" | sort -k3 -n -r | head -10 | while read -r perms owner size rest; do
    printf "%8d KB  %s\n" $((size / 1024)) "$rest"
  done
  echo
done
echo "=== 删除的文件确认（旧包有、新包没有）==="
tar tzf "$OLD" | sort > /tmp/a.txt
tar tzf "$NEW" | sort > /tmp/b.txt
comm -23 /tmp/a.txt /tmp/b.txt
