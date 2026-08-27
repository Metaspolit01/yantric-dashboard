"""
Yantric Knowledge Search Client (RAG retrieval)

The retrieval half of Yantric RAG on the voice-agent side. During a
conversation the agent's `search_knowledge` tool calls this client, which
hits the dashboard's internal search endpoint:

    agent tool call
        → POST {YANTRIC_API_BASE_URL}/api/agents/{agent_id}/knowledge/search
        → pgvector similarity search
        → top-k knowledge chunk texts

All AI/database access stays server-side; the worker only ever holds the
shared YANTRIC_AGENT_API_SECRET it already needs.
"""

from __future__ import annotations

import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

log = logging.getLogger(__name__)


def search_agent_knowledge(
    agent_id: str,
    query: str,
    top_k: int = 4,
    timeout: int = 10,
) -> list[str]:
    """
    Fetch the most relevant knowledge-base chunks for a query.

    Returns a list of chunk texts (possibly empty when nothing matched).
    Raises RuntimeError on configuration or network failures so callers can
    degrade gracefully instead of silently guessing answers.
    """
    # Short-circuit on empty queries before requiring any configuration.
    clean_query = " ".join((query or "").split())[:512]
    if not clean_query:
        return []

    api_base = os.getenv("YANTRIC_API_BASE_URL", "http://localhost:3001").rstrip("/")
    api_secret = os.getenv("YANTRIC_AGENT_API_SECRET", "")

    if not api_secret:
        raise RuntimeError(
            "Missing YANTRIC_AGENT_API_SECRET environment variable. "
            "Set this in the agent .env to match the dashboard .env.local"
        )

    url = f"{api_base}/api/agents/{agent_id}/knowledge/search"
    request = Request(
        url,
        data=json.dumps({"query": clean_query, "top_k": top_k}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    log.info(f"[Yantric] Knowledge search for agent_id={agent_id}: '{clean_query}'")

    try:
        with urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Knowledge search failed ({e.code}): {body}") from e
    except URLError as e:
        raise RuntimeError(f"Cannot reach dashboard at {url}: {e.reason}") from e

    results = data.get("results") or []
    chunks = [str(r.get("content") or "").strip() for r in results]
    chunks = [c for c in chunks if c]

    log.info(f"[Yantric] Knowledge search returned {len(chunks)} chunk(s).")
    return chunks
