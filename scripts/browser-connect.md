# Browser research — dedicated Chrome profile

Default free research mode for Community Edition.

## Why a dedicated profile
Hermes can see cookies and tabs on the connected browser. Do **not** attach your everyday profile without explicit consent.

## Windows (PowerShell)

```powershell
$profileDir = "$env:LOCALAPPDATA\kami-chrome-debug"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
Start-Process chrome -ArgumentList "--remote-debugging-port=9222","--user-data-dir=$profileDir"
```

Then in Hermes: `/browser connect` (or set `browser.cdp_url: http://127.0.0.1:9222` and `HERMES_BROWSER_CDP_URL=http://127.0.0.1:9222` in `web/.env.local`).

## macOS

```bash
mkdir -p "$HOME/Library/Application Support/kami-chrome-debug"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/kami-chrome-debug"
```

## Linux

```bash
mkdir -p "$HOME/.config/kami-chrome-debug"
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/kami-chrome-debug"
# Chromium: chromium --remote-debugging-port=9222 --user-data-dir="$HOME/.config/kami-chrome-debug"
```

## Consent
Kami readiness and UI must show browser connected only after you opt in. Never auto-attach.
