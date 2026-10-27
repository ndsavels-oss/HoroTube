#!/usr/bin/env bash
# Сборка HoroTube: build/*.js|css + base/HoroTube.v4.html -> ../index.html
set -e
cd "$(dirname "$0")"
python3 assemble4.py >/dev/null
python3 assemble5.py
python3 - <<'P'
import re
s=open('out.html',encoding='utf8').read()
open('chk.js','w',encoding='utf8').write('\n;\n'.join(re.findall(r'<script>(.*?)</script>',s,re.S)))
P
node --check chk.js && rm chk.js && echo SYNTAX-OK
mv out.html ../index.html
echo "index.html: $(cat VERSION)"
