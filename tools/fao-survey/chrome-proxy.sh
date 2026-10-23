#!/bin/sh
# Chromium wrapper cho container cloud: REA lọc bỏ HTTPS_PROXY khỏi môi trường trình duyệt
# (allowedBrowserEnvironment trong rea/src/browser/PlaywrightScenarioBrowser.ts), nên truyền proxy qua tham số.
# Trên máy Windows của Thầy không cần file này — trỏ executable_path thẳng tới chrome.exe.
exec "${CHROME_BIN:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}" ${HTTPS_PROXY:+--proxy-server=$HTTPS_PROXY} "$@"
