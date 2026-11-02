"""Bridge the official Antigravity interactive OAuth flow; never export its tokens.

Only a validated authorization URL and completion/error events reach OfficeX.
The official CLI owns its OAuth client, state, PKCE exchange and secure keyring.
No prompt is submitted and no model inference is used for login.
"""
import json
import os
import queue
import re
import sys
import threading
import time
from urllib.parse import urlparse
from claude_login import Term, ANSI

URL = re.compile(r'https://accounts\.google\.com/o/oauth2/(?:v2/)?auth\?[^\s\x07\x1b"<>]+')

def extract_url(raw):
    text = ANSI.sub('', raw)
    hits = URL.findall(text)
    return hits[-1] if hits else None

def say(event, **fields):
    print(json.dumps(dict(event=event, **fields)), flush=True)

def main():
    agy = sys.argv[1]
    settings = {"useG1Credits": False, "modelProvider": "", "allowNonWorkspaceAccess": False, "colorScheme": "terminal"}
    commands = queue.Queue()
    def read_input():
        try:
            for line in sys.stdin:
                try: commands.put(json.loads(line))
                except (ValueError, TypeError): pass
        finally: commands.put({"action": "cancel"})
    threading.Thread(target=read_input, daemon=True).start()
    term = None
    try:
        term = Term([agy, '--mode', 'plan', '--settings', json.dumps(settings)])
        deadline = time.monotonic() + 600
        previous_url = None
        chose_theme = False
        while time.monotonic() < deadline:
            raw = term.text()[-200000:]
            text = ANSI.sub('', raw)
            if not chose_theme and 'Choose your color scheme' in text:
                term.write('\r'); chose_theme = True
            url = extract_url(raw)
            if url and url != previous_url:
                u = urlparse(url)
                if u.hostname == 'accounts.google.com':
                    say('url', url=url); previous_url = url
            # Only explicit official authentication completion is accepted; the server verifies the account again.
            if re.search(r'authentication successful|successfully authenticated|successfully signed in|logged in as|signed in as|welcome back', text, re.I):
                say('connected'); return 0
            if re.search(r'authentication timed out|authentication failed|invalid authorization code|oauth error', text, re.I):
                say('error'); return 1
            try:
                cmd = commands.get_nowait()
                if cmd.get('action') == 'cancel': return 0
                code = cmd.get('code', '')
                if cmd.get('action') == 'code' and previous_url and re.fullmatch(r'4/[A-Za-z0-9_-]{10,1500}', code):
                    term.write(code); time.sleep(0.3); term.write('\r')
            except queue.Empty: pass
            if not term.alive: say('error'); return 1
            time.sleep(0.15)
        say('error'); return 1
    except Exception:
        say('error'); return 1
    finally:
        if term: term.kill()

if __name__ == '__main__':
    sys.exit(main())
