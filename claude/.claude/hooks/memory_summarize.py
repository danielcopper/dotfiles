#!/usr/bin/env python3
"""
Memory Summarize Hook (Stop + PreCompact)

Auto-summarizes a Claude Code session into today's daily file by invoking
`claude -p` headlessly with the session transcript.

Triggered by:
  - Stop event       → invoked with --event=stop
  - PreCompact event → invoked with --event=precompact

Idempotency:
  - First successful run for a session sets `/tmp/claude-summary-done-<session-id>`.
  - Subsequent runs for the same session (whether Stop or PreCompact) skip.
  - The prompt to `claude -p` includes existing daily content and instructs the
    summarizer to skip topics already represented, so duplicates are also
    avoided at the content level.

Failure mode: catch all errors, log, exit 0. Never block.
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

MAX_TRANSCRIPT_CHARS = 50_000
CLAUDE_TIMEOUT_SECONDS = 180


def log_event(event_type, details):
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "memory_summarize.jsonl"
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            "details": details,
        }
        with open(log_file, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def claim_session(session_id):
    """Atomic claim: True if we got it, False if another run already did/is doing.
    Uses O_EXCL on the done-marker as a combined lock + done flag.
    """
    marker = f"/tmp/claude-summary-done-{session_id}"
    try:
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False


def extract_transcript_text(transcript_path, max_chars=MAX_TRANSCRIPT_CHARS):
    """Pull readable text from JSONL transcript. Returns str or None."""
    p = Path(transcript_path)
    if not p.is_file():
        return None
    parts = []
    try:
        with open(p) as f:
            for line in f:
                try:
                    msg = json.loads(line)
                except Exception:
                    continue
                msg_type = msg.get("type", "")
                if msg_type not in ("user", "assistant"):
                    continue
                role = "USER" if msg_type == "user" else "ASSISTANT"
                content = msg.get("message", {}).get("content", [])
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    text_parts = []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "text":
                            text_parts.append(c.get("text", ""))
                    text = "\n".join(text_parts)
                else:
                    continue
                if not text.strip():
                    continue
                parts.append(f"[{role}] {text}")
    except Exception:
        return None
    full = "\n\n".join(parts)
    if len(full) > max_chars:
        full = "... (earlier content truncated) ...\n\n" + full[-max_chars:]
    return full


def build_prompt(transcript_text, existing_daily, today_date, fallback_time):
    return f"""You are summarizing a Claude Code session into the user's daily log file.

EXISTING DAILY FILE (~/.claude/memory/daily/{today_date}.md):
```
{existing_daily or "(empty)"}
```

THIS SESSION'S TRANSCRIPT (most recent at the bottom):
```
{transcript_text}
```

Extract 1-3 topics from THIS SESSION worth recording, formatted EXACTLY as:

## HH:MM — short-topic-slug
- Concrete decision, fact, or insight
- ...

Rules:
- Output ONLY the new markdown entries to APPEND. No preamble. No commentary. No code fences around your answer. No "here is the summary" intro.
- Skip topics already represented in the existing daily content above.
- HH:MM should be approximately when in the session that topic started; if uncertain, use {fallback_time}.
- 2-5 bullets per topic, terse, durable signal only.
- Focus on: decisions made, facts learned, things tried (worked or didn't), gotchas discovered, tool quirks.
- Skip: filler, restating user prompts, generic responses, meta-discussion.
- If nothing in this session is worth recording, output ONLY the literal single word: NOTHING

Append-ready markdown only:"""


def call_claude(prompt, timeout=CLAUDE_TIMEOUT_SECONDS):
    """Invoke `claude -p`. Returns stdout (stripped) or None on failure.

    Sets MEMORY_SUMMARIZE_NO_RECURSE=1 in the subprocess env so the inner
    `claude -p` session's Stop hook (which is this same script) detects the
    env var and exits early instead of recursing.
    """
    env = os.environ.copy()
    env["MEMORY_SUMMARIZE_NO_RECURSE"] = "1"
    try:
        result = subprocess.run(
            ["claude", "-p", "--model", "sonnet", prompt],
            capture_output=True, text=True, timeout=timeout, env=env,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        log_event("claude_call_failed", {"error": type(e).__name__, "msg": str(e)[:200]})
        return None
    if result.returncode != 0:
        log_event("claude_call_returncode", {"rc": result.returncode, "stderr": result.stderr[:300]})
        return None
    return result.stdout.strip()


def append_to_daily(daily_file, content, today_date):
    """Append content to daily file. Adds header if file is new."""
    daily_file.parent.mkdir(parents=True, exist_ok=True)
    if daily_file.exists():
        existing = daily_file.read_text()
        if not existing.endswith("\n\n"):
            existing = existing.rstrip("\n") + "\n\n"
        new_content = existing + content + "\n"
    else:
        new_content = f"# Daily — {today_date}\n\n" + content + "\n"
    with open(daily_file, "w") as f:
        f.write(new_content)


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    try:
        if "--event=stop" in sys.argv:
            event = "stop"
        elif "--event=precompact" in sys.argv:
            event = "precompact"
        else:
            event = "unknown"

        # Recursion guard: a `claude -p` we spawn is itself a Claude Code session
        # that fires Stop on exit. We set MEMORY_SUMMARIZE_NO_RECURSE=1 in that
        # subprocess's env so this hook bails out cleanly and we don't cascade.
        if os.environ.get("MEMORY_SUMMARIZE_NO_RECURSE") == "1":
            log_event("skip_recursion_guard", {"event": event})
            sys.exit(0)

        session_id = data.get("session_id", "")
        transcript_path = data.get("transcript_path", "")

        if not session_id:
            log_event("no_session_id", {"event": event})
            sys.exit(0)

        if not transcript_path or not Path(transcript_path).is_file():
            log_event("no_transcript", {"event": event, "session_id": session_id, "transcript_path": transcript_path})
            sys.exit(0)

        if not claim_session(session_id):
            log_event("skip_already_claimed", {"event": event, "session_id": session_id})
            sys.exit(0)

        transcript_text = extract_transcript_text(transcript_path)
        if not transcript_text:
            log_event("empty_transcript", {"event": event, "session_id": session_id})
            sys.exit(0)

        today = datetime.now().strftime("%Y-%m-%d")
        fallback_time = datetime.now().strftime("%H:%M")
        daily_file = Path.home() / ".claude" / "memory" / "daily" / f"{today}.md"
        existing_daily = daily_file.read_text() if daily_file.exists() else ""

        prompt = build_prompt(transcript_text, existing_daily, today, fallback_time)

        log_event("calling_claude", {
            "event": event,
            "session_id": session_id,
            "transcript_chars": len(transcript_text),
            "existing_daily_chars": len(existing_daily),
        })

        summary = call_claude(prompt)

        if summary is None:
            log_event("claude_returned_none", {"event": event, "session_id": session_id})
            sys.exit(0)

        if summary == "NOTHING" or not summary:
            log_event("nothing_to_summarize", {"event": event, "session_id": session_id})
            sys.exit(0)

        append_to_daily(daily_file, summary, today)
        log_event("appended", {
            "event": event,
            "session_id": session_id,
            "chars": len(summary),
            "daily_path": str(daily_file),
        })
        sys.exit(0)

    except Exception as e:
        log_event("error", {"error": str(e)})
        sys.exit(0)


if __name__ == "__main__":
    main()
