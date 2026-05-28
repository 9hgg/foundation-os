"""Demo for EDFIAGLLMClient with a fake nuclear plant conversation.

Run from the backend folder with:
    uv run python libs/ml/demos/demo_edf_iag_llm_client.py

Dry-run without calling the API:
    uv run python libs/ml/demos/demo_edf_iag_llm_client.py --dry-run

Environment variables:
    EDF_IAG_API_KEY
    EDF_IAG_MODEL
    EDF_IAG_BASE_URL
    EDF_IAG_CA_BUNDLE_PATH
    EDF_IAG_VERIFY_SSL
"""

from __future__ import annotations

import argparse
import json
import os

from libs.ml.llm import EDFIAGLLMClient, LLMMessage


def build_conversation() -> list[LLMMessage]:
    return [
        LLMMessage(
            role="system",
            content=(
                "You are a cheerful control-room simulator for a fictional nuclear plant. "
                "Answer as a plant operator speaking to a visitor. "
                "Keep it calm, short, and obviously fictional."
            ),
        ),
        LLMMessage(role="user", content="Good morning. Are things stable on site?"),
        LLMMessage(
            role="assistant",
            content=(
                "Good morning. In this fictional scenario everything is stable: cooling is nominal, "
                "the turbines are humming, and the coffee machine is the real bottleneck."
            ),
        ),
        LLMMessage(role="user", content="How is your nuclear plant today?"),
    ]


def build_client() -> EDFIAGLLMClient:
    verify_ssl = os.getenv("EDF_IAG_VERIFY_SSL", "true").strip().lower() not in {"0", "false", "no"}
    ca_bundle_path = os.getenv("EDF_IAG_CA_BUNDLE_PATH", "").strip() or None
    return EDFIAGLLMClient(
        model=os.getenv("EDF_IAG_MODEL", "C2-Cloud-Gemini-2.5-Pro").strip() or "C2-Cloud-Gemini-2.5-Pro",
        base_url=os.getenv("EDF_IAG_BASE_URL", "https://llm.iag.edf.fr/v1/").strip() or "https://llm.iag.edf.fr/v1/",
        api_key=os.getenv("EDF_IAG_API_KEY", "").strip() or None,
        verify_ssl=verify_ssl,
        ca_bundle_path=ca_bundle_path,
    )


def run_demo(*, dry_run: bool = False) -> dict[str, object]:
    messages = build_conversation()
    client = build_client()
    payload = {
        "client": {
            "model": client.model,
            "base_url": client.base_url,
            "api_key_env": client.api_key_env,
            "verify_ssl": client.verify_ssl,
            "ca_bundle_path": client.ca_bundle_path,
        },
        "messages": [{"role": message.role, "content": message.content} for message in messages],
    }

    if dry_run:
        payload["dry_run"] = True
        return payload

    response = client.complete(messages)
    payload["response"] = {
        "text": response.text,
        "model": response.model,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        },
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the EDF IAG LLM demo conversation.")
    parser.add_argument("--dry-run", action="store_true", help="Print the prepared conversation without calling the API.")
    args = parser.parse_args()

    if not args.dry_run and not os.getenv("EDF_IAG_API_KEY", "").strip():
        print("── EDF IAG ── SKIPPED (set EDF_IAG_API_KEY to enable, or use --dry-run)")
        return

    print(json.dumps(run_demo(dry_run=args.dry_run), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
