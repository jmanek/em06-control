#!/usr/bin/env bash
set -euo pipefail

# Repeatable browser smoke check for layout regressions. The screenshot is still
# reviewed visually after this script passes; the script catches measurable issues.
command -v npx >/dev/null 2>&1 || { echo "npx is required for UI QA" >&2; exit 1; }
PWCLI="${PWCLI:-/Users/jessemanek/.codex/skills/playwright/scripts/playwright_cli.sh}"
SESSION="em06-ui-qa"
mkdir -p output/playwright

for marker in 'CAPTURE_IDLE_MS=5000' 'CAPTURE_MAX_MS=30000' 'Recording stopped before device operation'; do
  rg -q "$marker" web/app.js || { echo "UI QA failed: recording lifecycle marker missing: $marker" >&2; exit 1; }
done

python3 -m http.server 4173 --directory . > output/playwright/server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

bash "$PWCLI" --session "$SESSION" close >/dev/null 2>&1 || true
bash "$PWCLI" --session "$SESSION" open http://127.0.0.1:4173/web/
bash "$PWCLI" --session "$SESSION" resize 1440 1000

METRICS=$(bash "$PWCLI" --session "$SESSION" eval "JSON.stringify((()=>{const q=s=>document.querySelector(s);const r=e=>e?.getBoundingClientRect();const map=r(q('.mouse-map'));const image=r(q('.mouse-map img'));const sidebar=r(q('.sidebar'));const header=r(q('.side-head'));return {bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,sidebarOverflow:header?.scrollWidth>header?.clientWidth,profileHeader:q('.side-head>span')?.textContent.trim(),mouseMapHeight:Math.round(map?.height||0),mouseImageHeight:Math.round(image?.height||0),cycleHeading:q('.cycle-panel h2')?.textContent.trim(),cycleNoteVisible:!!q('.cycle-note')&&getComputedStyle(q('.cycle-note')).display!=='none',sidebarWidth:Math.round(sidebar?.width||0)}})())")
printf '%s\n' "$METRICS" | tee output/playwright/desktop-metrics.json

GEOMETRY=$(bash "$PWCLI" --session "$SESSION" eval "JSON.stringify((()=>{const map=document.querySelector('.mouse-map');const inspector=document.querySelector('.inspector');const before=map.getBoundingClientRect().height;const old=inspector.style.minHeight;inspector.style.minHeight='1200px';const after=map.getBoundingClientRect().height;inspector.style.minHeight=old;return {before,after,stable:before===after}})())")
printf '%s\n' "$GEOMETRY" | tee output/playwright/geometry-metrics.json
if printf '%s' "$GEOMETRY" | rg -q 'stable[^,]*false'; then
  echo "UI QA failed: mouse canvas changes height with a taller editor" >&2
  exit 1
fi

if printf '%s' "$METRICS" | rg -q 'bodyOverflow[^,]*true|sidebarOverflow[^,]*true|cycleNoteVisible[^,]*true'; then
  echo "UI QA failed: overflow or redundant cycle note detected" >&2
  exit 1
fi
if ! printf '%s' "$METRICS" | rg -q 'profileHeader.*Profiles'; then
  echo "UI QA failed: profile header is not compact" >&2
  exit 1
fi
if ! printf '%s' "$METRICS" | rg -q 'mouseImageHeight.*[5-9][0-9][0-9]'; then
  echo "UI QA failed: main mouse image is not large enough" >&2
  exit 1
fi

bash "$PWCLI" --session "$SESSION" screenshot > output/playwright/desktop-screenshot.txt
bash "$PWCLI" --session "$SESSION" mousewheel 0 700 >/dev/null
bash "$PWCLI" --session "$SESSION" screenshot > output/playwright/panels-screenshot.txt
bash "$PWCLI" --session "$SESSION" resize 700 900
MOBILE=$(bash "$PWCLI" --session "$SESSION" eval "JSON.stringify((()=>{const q=s=>document.querySelector(s);return {bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,sidebarOverflow:q('.side-head')?.scrollWidth>q('.side-head')?.clientWidth,cycleHeading:q('.cycle-panel h2')?.textContent.trim()}})())")
printf '%s\n' "$MOBILE" | tee output/playwright/mobile-metrics.json
if printf '%s' "$MOBILE" | rg -q 'bodyOverflow[^,]*true|sidebarOverflow[^,]*true'; then
  echo "UI QA failed: narrow layout overflow detected" >&2
  exit 1
fi
bash "$PWCLI" --session "$SESSION" close >/dev/null
echo "UI QA passed. Review the screenshot path reported in output/playwright/desktop-screenshot.txt."
