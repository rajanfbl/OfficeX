# OfficeX with ChatGPT, Gemini and Claude Code

This fork extends [patricknks/OfficeX](https://github.com/patricknks/OfficeX), preserving its office view, teams, projects, chats, saved memory, schedules and projector. Version: **0.5.1-beta.1**. Windows is the tested platform.

## Setup

1. Follow the Windows installation instructions in README.md. Install Node.js, Git for Windows and the official CLI for each provider you want to use. Claude is optional; it is not required to run Codex or Gemini agents.
2. Install [Codex](https://learn.chatgpt.com/docs/cli/authentication) for ChatGPT, [Antigravity CLI](https://antigravity.google/docs/getting-started?tab=cli) for Gemini, and/or [Claude Code](https://code.claude.com/docs/en/setup). Use official downloads. Their account access and subscription limits apply.
3. Gemini and Claude browser sign-in also need Python and `pywinpty` on Windows: `python -m pip install pywinpty`. Set `python` in server.json to that interpreter if needed.
4. Configure a company folder outside this checkout in server.json. Keep it private. Set `host` to `127.0.0.1` for laptop-only access. Optional `codexPath`, `geminiPath`, and `claudePath` point to the corresponding official executables; otherwise OfficeX looks for them on PATH.
5. Start the app. Use **Connect ChatGPT**, **Connect Gemini**, or **Connect Claude** in the top bar. Each opens the relevant connection panel. The Overview panel shows status and usage.

## Windows desktop window

The `desktop/` client opens the same OfficeX workspace in its own native window, without a browser tab. It starts the local engine if necessary and reuses the configured company folder. Sign-in links open in the system browser. Closing the desktop leaves the engine running so schedules and browser access continue; the native OfficeX menu also offers **Stop engine and quit**.

To package it locally, build the web interface, then run `scripts/package-desktop.ps1` with `-ElectronRuntime` pointing to an official extracted Electron runtime, `-NodeExe` pointing to a trusted Node.js executable, and `-Destination` pointing to a separate app installation folder. The script copies framework files only, verifies executable copies, and writes a private instance.json that points to the existing OfficeX checkout. Launch the resulting **OfficeX.exe**. Framework and instance files are not committed to this repository. No paid service is required for the desktop window.

## Subscription authorization

- **ChatGPT:** Codex's official app-server performs browser OAuth and owns the local callback, credential storage and token refresh. A device-code alternative is available when the account supports it. API-key accounts are rejected for worker launches. An existing ChatGPT OAuth login can be reused without signing out other Codex clients.
- **Gemini:** Antigravity's official interactive OAuth flow runs behind the connection panel. OfficeX shows its Google authorization URL and accepts the authorization code if supplied by Google. The official CLI owns OAuth state, PKCE, the exchange and its secure keyring. OfficeX verifies readiness using authenticated model-list metadata, without a model turn. Existing Google OAuth sessions are reused. Switching Google accounts remains an explicit action in Antigravity because it shares its local account with other Google agent surfaces.
- **Claude:** OfficeX retains its original Claude Code subscription OAuth flow. Either sign in through the panel or explicitly choose the computer's existing Claude Code login.

No shared provider passwords, copied OAuth client secrets, paid API fallback or automatic provider failover are configured. Google's additional AI-credit spending is disabled for OfficeX worker runs. Account access, vendor terms and normal plan limits still apply. A subscription does not guarantee access to every listed model.

Connection panels show the signed-in email and plan when Codex supplies them through `account/read`. Only whitelisted display fields are exposed; raw account responses and tokens are excluded. The current Antigravity connection check does not supply a Google email, so its panel labels that detail unavailable. **Check connection** refreshes account metadata without an AI turn.

Authorization URLs are checked against provider origins. Codes remain local and are not written into chat history. Cancel/expiration ends the login session; cancellation does not log out other applications. Complete sign-in yourself on the official page. Never paste passwords or authorization codes into AI chat.

## Agents and project mode

Each new agent has an **AI provider** selector and a **Model** selector. Managers, workers, secretaries and fresh read-only advisors can use different providers. Codex is the default. A read-only advisor importing an existing Claude transcript remains tied to Claude; create a fresh advisor for Codex or Gemini.

Codex models are discovered from the official app-server model catalog, including older regular models available to the connected account. Internal hidden models are excluded. Gemini models come from Antigravity's model list. **Refresh available models** updates these lists without a model turn; source access and plan limits still apply. Existing saved selections remain visible if a model disappears from the latest list.

Open a project and select **Use this project for team chats**. Its **Agent mode** toggle is initially off: the coordinator answers directly. Enable it to let the coordinator delegate through OfficeX tools to agents using their chosen providers. Each team has one active project at a time; finish queued work before switching it.

Provider conversations have separate IDs. OfficeX supplies shared room context and saved memory when a provider session begins, then reuses that provider's native conversation. It does not merge complete native histories or automatically import chats from another app. Start fresh conversation keeps the OfficeX chat and saved memory.

## Usage and permissions

The connection overview shows worker-reported token counts and, when available, Codex's reported plan windows and credit balance. Missing counts and unavailable quotas are unknown. Token counts are not an exact monetary bill. Gemini's remaining plan quota must be checked in Antigravity. The local usage log covers completed OfficeX turns, not every other app's usage.

Hourly turn limits, chain limits, pause controls and timeouts limit autonomous work. Native Codex subagents and hooks are disabled for these worker launches; OfficeX owns delegation. Worker launches do not use full-access/bypass flags. Cross-provider read/list tools enforce the selected company scope and exclude app account/config folders, including linked targets.

Provider-native tools use different permission systems; the agent's permission checkboxes are not a universal operating-system isolation boundary. Claude's signed-in Chrome integration remains Claude-only. Other apps' plugins, skills, Google services and browser sessions are not automatically inherited. Live Google Docs editing, Visio, Zoom and independent phone access require their own configured integrations.

## Imported chat library

The **Imported chats** button opens local copies of Codex and ChatGPT conversations, grouped by their source project. Library data stays in the company folder under `imports/codex-chatgpt-YYYY-MM-DD/`, outside the source repository. The latest dated snapshot is displayed. Opening a copy does not start a model turn. The library includes source titles, user/assistant messages and project grouping; export-service truncation is labelled. Attachments, provider sessions, account authorization, running schedules and project integrations are not transferred by a history import. Imported text is historical data, not a new task or instruction. These copies do not automatically sync with their source.

## Regular WhatsApp workspace

The **WhatsApp** panel provides a manual companion to [WhatsApp Web](https://web.whatsapp.com/). Sign in with WhatsApp's own QR flow in the system browser. OfficeX does not read or automate that browser session. Supported local tools include importing .txt chat exports (2 MB maximum), Android/iPhone transcript parsing, searching and viewing messages, project-scoped saved drafts, and preparing official [click-to-chat links](https://faq.whatsapp.com/5913398998672934). A link prefills the message; the owner reviews it and presses Send in WhatsApp.

AI summary, reply drafting, task extraction and translation use the selected project's existing OfficeX coordinator. Only the reviewed context box is sent, capped at 12,000 characters; imports initially populate it from the latest 50 messages. Saving, searching or opening WhatsApp does not invoke a model. AI actions consume the selected coordinator's plan allowance. Copies and drafts stay under the company folder's `imports/whatsapp/`, outside this repository. Live inbox sync, automatic replies, bulk sending, media import and voice transcription are not implemented. No unofficial WhatsApp client is installed.

## Development and checks

`npm ci`, `npm run build`, `npm test`. The lockfile pins dependencies. With pnpm, this checkout enables hoisting because upstream imports a transitive Three.js dependency directly.

Automated tests cover login transport, cancellation, expiration, approved URL origins, rejecting API-key accounts, separate provider launches, file scopes and timed-out workers. Local verification also covered all three connection panels, OAuth UI states, per-agent provider/model changes, project opt-in and a live Codex → Gemini → Codex handoff. Fresh browser authorization requires the user's consent; tests do not log into accounts on their behalf.

Never commit server.json, company data, login transcripts, `.venv`, executable downloads or personal launcher scripts. Company folders and native provider credentials stay outside the published source.
