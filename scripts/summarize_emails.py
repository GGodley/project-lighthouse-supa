import os
import time
from typing import Optional

import requests

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def require_env(var_name: str) -> str:
    val = os.getenv(var_name)
    if not val:
        raise RuntimeError(f"Missing required environment variable: {var_name}")
    return val


def get_openai_client() -> OpenAI:
    if OpenAI is None:
        raise RuntimeError("openai python package not installed. pip install openai>=1.0.0")
    require_env("OPENAI_API_KEY")
    return OpenAI(api_key=OPENAI_API_KEY)


def supabase_headers() -> dict:
    url = require_env("SUPABASE_URL") if SUPABASE_URL is None else SUPABASE_URL
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def fetch_emails_without_summary(limit: int = 20) -> list:
    """Fetch a batch of emails where summary is NULL, newest first."""
    url = require_env("SUPABASE_URL") if SUPABASE_URL is None else SUPABASE_URL
    endpoint = f"{url}/rest/v1/emails"
    # summary=is.null & order=received_at.desc & limit
    params = {
        "select": "id, subject, sender, snippet, body_text, body_html",
        "summary": "is.null",
        "order": "received_at.desc",
        "limit": str(limit),
    }
    resp = requests.get(endpoint, headers=supabase_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def update_email_summary(email_id: int, summary: str) -> None:
    url = require_env("SUPABASE_URL") if SUPABASE_URL is None else SUPABASE_URL
    endpoint = f"{url}/rest/v1/emails?id=eq.{email_id}"
    payload = {"summary": summary}
    resp = requests.patch(endpoint, headers=supabase_headers(), json=payload, timeout=30)
    resp.raise_for_status()


def build_prompt(subject: Optional[str], sender: Optional[str], snippet: Optional[str], body_text: Optional[str], body_html: Optional[str]) -> str:
    content_sources = []
    if subject:
        content_sources.append(f"Subject: {subject}")
    if sender:
        content_sources.append(f"From: {sender}")
    if snippet:
        content_sources.append(f"Snippet: {snippet}")
    # prefer plain text; fallback to html
    text = body_text or body_html or ""
    if text:
        content_sources.append(f"Body:\n{text[:8000]}")  # cap to reasonable length
    joined = "\n\n".join(content_sources)
    return (
        "Summarize the following email in at most 2 concise lines. "
        "Focus on the key intent and next steps if any.\n\n" + joined
    )


def generate_summary(client: OpenAI, prompt: str) -> str:
    # Use a small, cost-effective model; change if needed
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that writes very concise summaries."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=150,
    )
    return (resp.choices[0].message.content or "").strip()


def main() -> None:
    # Validate required envs early
    require_env("OPENAI_API_KEY")
    require_env("SUPABASE_SERVICE_ROLE_KEY")
    require_env("SUPABASE_URL") if SUPABASE_URL is None else SUPABASE_URL

    client = get_openai_client()

    total_updated = 0
    while True:
        emails = fetch_emails_without_summary(limit=20)
        if not emails:
            print("No more emails without summary. Done.")
            break

        for e in emails:
            email_id = e.get("id")
            subject = e.get("subject")
            sender = e.get("sender")
            snippet = e.get("snippet")
            body_text = e.get("body_text")
            body_html = e.get("body_html")

            prompt = build_prompt(subject, sender, snippet, body_text, body_html)
            try:
                summary = generate_summary(client, prompt)
                # Enforce 2 lines max
                summary_lines = [line.strip() for line in summary.splitlines() if line.strip()]
                summary = "\n".join(summary_lines[:2])
                update_email_summary(email_id, summary)
                total_updated += 1
                print(f"Updated email {email_id} summary.")
            except Exception as err:  # pragma: no cover
                print(f"Failed to summarize email {email_id}: {err}")
                # Best effort: continue with next email
                continue

        # Small pause to be nice to rate limits / DB
        time.sleep(0.5)

    print(f"Completed. Summaries updated for {total_updated} emails.")


if __name__ == "__main__":
    main()


