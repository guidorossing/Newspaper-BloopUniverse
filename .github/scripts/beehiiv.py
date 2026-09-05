#!/usr/bin/env python3
"""Talk to beehiiv from a GitHub Actions runner.

Claude sessions cannot reach api.beehiiv.com — the egress proxy blocks it —
so this runs on the runner instead, which has open internet. The API key is
a repository secret and never enters the repo or a conversation.

Two commands:

  probe      GET recent posts and print the field names beehiiv actually
             uses, so scheduling doesn't have to guess at audience/status.

  schedule   POST a new post with the edition's HTML as the body, set to
             publish at a given time, restricted to paid subscribers.

Both print the full response body on failure. beehiiv says what it rejected;
there is no reason to make you go and find out.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API_ROOT = "https://api.beehiiv.com/v2"


def call(method: str, path: str, token: str, payload: dict | None = None) -> dict:
    url = f"{API_ROOT}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/json")
    if data:
        request.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")
        print(f"\nbeehiiv returned {error.code} for {method} {path}", file=sys.stderr)
        print(body or "(empty response body)", file=sys.stderr)
        raise SystemExit(1)
    except urllib.error.URLError as error:
        print(f"\ncould not reach {url}: {error.reason}", file=sys.stderr)
        raise SystemExit(1)


def probe(args, token: str, publication: str) -> None:
    """Print the shape of an existing post so we can match it exactly."""
    result = call("GET", f"/publications/{publication}/posts?limit=3&expand[]=free_web_content", token)
    posts = result.get("data") or []
    if not posts:
        print("No posts found. Publish one by hand first, then probe again.")
        return

    print(f"Found {len(posts)} post(s). Fields beehiiv reports:\n")
    for post in posts:
        print(f"--- {post.get('title', '(untitled)')} ---")
        for key, value in sorted(post.items()):
            if key in ("content", "free_web_content", "premium_web_content"):
                value = f"<{len(str(value))} characters of HTML>"
            print(f"  {key}: {json.dumps(value)[:180]}")
        print()

    print("Look for the field that says who could read it (audience / "
          "content_tags / platform). That is what `schedule` must set.")


def schedule(args, token: str, publication: str) -> None:
    html = open(args.html, encoding="utf-8").read()
    if not html.strip():
        raise SystemExit(f"{args.html} is empty")

    remaining = html.count("[PLACEHOLDER")
    unfilled = sum(html.count(marker) for marker in ("[TITLE]", "[VOL]", "[NO]", "[OUTLET]"))
    if remaining or unfilled:
        print(f"WARNING: {args.html} still contains unfilled placeholders.", file=sys.stderr)
        if not args.allow_placeholders:
            raise SystemExit("Refusing to schedule an unfinished edition. "
                             "Pass --allow-placeholders only if you mean it.")

    payload = {
        "title": args.title,
        # beehiiv keeps these apart: `title` heads the web version,
        # `subject_line` is what lands in the inbox. Setting only the first
        # ships an edition with a blank subject.
        "subject_line": args.subject_line or args.title,
        "body_content": html,
        "status": args.status,
        "audience": args.audience,
    }
    if args.scheduled_at:
        payload["scheduled_at"] = args.scheduled_at
    if args.preview_text:
        payload["preview_text"] = args.preview_text
    if args.targets:
        reach = [{"action": "include", "receiver_type": "Publication", "tier": args.targets}]
        payload["send_targets"] = reach
        payload["web_targets"] = reach
    if args.extra:
        payload.update(json.loads(args.extra))

    printable = dict(payload)
    printable["body_content"] = f"<{len(html)} characters of HTML>"
    print("POST /publications/…/posts")
    print(json.dumps(printable, indent=2))

    if args.dry_run:
        print("\nDry run — nothing sent.")
        return

    result = call("POST", f"/publications/{publication}/posts", token, payload)
    post = result.get("data", result)
    print("\nCreated.")
    print(f"  id:           {post.get('id')}")
    print(f"  status:       {post.get('status')}")
    print(f"  scheduled_at: {post.get('scheduled_at')}")
    print(f"  url:          {post.get('web_url') or '(not published yet)'}")
    print("\nOpen it in beehiiv and read it once before it goes.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("probe", help="print the shape of existing posts")

    s = sub.add_parser("schedule", help="create a scheduled post")
    s.add_argument("--html", required=True, help="path to the edition's email HTML")
    s.add_argument("--title", required=True, help="headline on the web version")
    s.add_argument("--subject-line", default="", help="inbox subject; defaults to --title")
    s.add_argument("--preview-text", default="", help="inbox preview line")
    s.add_argument("--scheduled-at", default="", help="RFC3339, e.g. 2026-09-11T13:00:00Z")
    s.add_argument("--audience", default="premium", help="premium | free | both")
    s.add_argument("--targets", default="", help="tier name for send_targets/web_targets, "
                                                 "when audience alone isn't enough")
    s.add_argument("--status", default="confirmed", help="confirmed (will send) | draft")
    s.add_argument("--extra", default="", help="extra JSON merged into the payload")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--allow-placeholders", action="store_true")

    args = parser.parse_args()

    token = os.environ.get("BEEHIIV_API_KEY", "").strip()
    publication = os.environ.get("BEEHIIV_PUBLICATION_ID", "").strip()
    if not token or not publication:
        raise SystemExit("BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID must both be set "
                         "as repository secrets.")

    {"probe": probe, "schedule": schedule}[args.command](args, token, publication)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
