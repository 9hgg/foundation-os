"""Unit tests for concrete LLM transport clients."""

import json
import ssl

from libs.ml.llm import EDFIAGLLMClient, LLMMessage


def test_edf_iag_client_uses_chat_completions_path(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def read(self):
            return json.dumps(
                {
                    "choices": [{"message": {"content": "hello from edf"}}],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7},
                }
            ).encode()

    class FakeHTTPSConnection:
        def __init__(self, host, port, timeout, context):
            captured["host"] = host
            captured["port"] = port
            captured["timeout"] = timeout
            captured["context"] = context

        def request(self, method, url, body, headers):
            captured["method"] = method
            captured["url"] = url
            captured["body"] = json.loads(body.decode())
            captured["headers"] = headers

        def getresponse(self):
            return FakeResponse()

        def close(self):
            captured["closed"] = True

    monkeypatch.setattr("libs.ml.llm.providers.http.client.HTTPSConnection", FakeHTTPSConnection)

    client = EDFIAGLLMClient(api_key="secret", verify_ssl=False)
    response = client.complete([LLMMessage(role="user", content="Ping")])

    assert response.text == "hello from edf"
    assert captured["host"] == "llm.iag.edf.fr"
    assert captured["port"] == 443
    assert captured["method"] == "POST"
    assert captured["url"] == "/v1/chat/completions"
    assert captured["body"] == {
        "model": "C2-Cloud-Gemini-2.5-Pro",
        "messages": [{"role": "user", "content": "Ping"}],
        "temperature": 0.0,
    }
    assert captured["headers"] == {
        "Authorization": "Bearer secret",
        "Content-Type": "application/json",
    }
    assert captured["context"].verify_mode == ssl.CERT_NONE
    assert captured["closed"] is True
