#!/usr/bin/env bash
# Build the PC version (Windows .exe + Linux + macOS) with Neutralinojs.
# Requires: node, npm i -g @neutralinojs/neu, network access to GitHub releases for the first run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-/tmp/slime-pc-build}"
VER=5.4.0
rm -rf "$WORK" && mkdir -p "$WORK/bin" "$WORK/resources"
cp "$ROOT/pc/neutralino.config.json" "$WORK/"
cp -r "$ROOT/web/"* "$WORK/resources/"
touch "$WORK/resources/js/neutralino.js"
if [ ! -f "$WORK/../neutralinojs-v$VER.zip" ]; then
  curl -sSL -o "$WORK/../neutralinojs-v$VER.zip" "https://github.com/neutralinojs/neutralinojs/releases/download/v$VER/neutralinojs-v$VER.zip"
fi
unzip -qo "$WORK/../neutralinojs-v$VER.zip" -d "$WORK/bin"
(cd "$WORK" && neu build --release >/dev/null)
OUT="$ROOT/dist"; mkdir -p "$OUT"
PKG="$WORK/pkg/SlimeReborn"; rm -rf "$WORK/pkg"; mkdir -p "$PKG"
cp "$WORK/dist/SlimeReborn/SlimeReborn-win_x64.exe" "$PKG/SlimeReborn.exe"
cp "$WORK/dist/SlimeReborn/resources.neu" "$PKG/"
cp "$WORK/dist/SlimeReborn/SlimeReborn-linux_x64" "$PKG/SlimeReborn-linux"
cp "$WORK/dist/SlimeReborn/SlimeReborn-mac_universal" "$PKG/SlimeReborn-mac"
cat > "$PKG/LEGGIMI.txt" <<'TXT'
SLIME REBORN — Terre Spezzate (versione PC)

Windows 10/11: fai doppio click su SlimeReborn.exe (serve Microsoft Edge WebView2, già presente su Windows 10/11 aggiornati).
Linux: chmod +x SlimeReborn-linux && ./SlimeReborn-linux (serve libwebkit2gtk).
macOS: chmod +x SlimeReborn-mac && ./SlimeReborn-mac
Tieni sempre resources.neu nella stessa cartella dell'eseguibile.
Se Windows SmartScreen avvisa: "Ulteriori informazioni" → "Esegui comunque" (l'app non è firmata).
TXT
(cd "$WORK/pkg" && rm -f "$OUT/SlimeReborn-PC.zip" && zip -qr "$OUT/SlimeReborn-PC.zip" SlimeReborn)
echo "PC build: $OUT/SlimeReborn-PC.zip"
