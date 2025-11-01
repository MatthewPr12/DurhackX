from __future__ import annotations
import os, time, hmac, hashlib
from typing import Any, Dict, Iterable, List, Optional
import jwt, requests

TALKJS_APP_ID = os.getenv("TALKJS_APP_ID", "")
TALKJS_SECRET = os.getenv("TALKJS_SECRET", "")
TALKJS_BASE = "https://api-durhack.talkjs.com"
_DEFAULT_TIMEOUT = 8

def _make_app_token(expires_in_seconds: int = 900) -> str:
    if not TALKJS_APP_ID or not TALKJS_SECRET:
        raise RuntimeError("TALKJS_APP_ID/TALKJS_SECRET not set")
    now = int(time.time())
    payload = {"tokenType": "app", "iss": TALKJS_APP_ID, "exp": now + int(expires_in_seconds)}
    return jwt.encode(payload, TALKJS_SECRET, algorithm="HS256")

def make_user_token(user_id: str, expires_in_seconds: int = 3600) -> str:
    if not user_id:
        raise ValueError("user_id is required")
    if not TALKJS_APP_ID or not TALKJS_SECRET:
        raise RuntimeError("TALKJS_APP_ID/TALKJS_SECRET not set")
    now = int(time.time())
    payload = {"tokenType": "user", "iss": TALKJS_APP_ID, "sub": user_id, "exp": now + int(expires_in_seconds)}
    return jwt.encode(payload, TALKJS_SECRET, algorithm="HS256")

def _auth_headers() -> Dict[str, str]:
    api_version = os.getenv("TALKJS_API_VERSION", "2024-01-01")
    return {
        "Authorization": f"Bearer {_make_app_token()}",
        "Content-Type": "application/json",
        "X-TalkJS-Version": api_version,
    }

def ensure_user(user_id: str, profile: Dict[str, Any]) -> None:
    url = f"{TALKJS_BASE}/v1/{TALKJS_APP_ID}/users/{user_id}"
    r = requests.put(url, json=profile, headers=_auth_headers(), timeout=_DEFAULT_TIMEOUT)
    r.raise_for_status()

def ensure_conversation(conversation_id: str, participants: Iterable[str], subject: Optional[str] = None,
                        welcome_message: Optional[str] = None, custom: Optional[Dict[str, Any]] = None) -> None:
    payload: Dict[str, Any] = {"participants": list(participants)}
    if subject is not None: payload["subject"] = subject
    if welcome_message is not None: payload["welcomeMessages"] = [welcome_message]
    if custom is not None: payload["custom"] = custom
    url = f"{TALKJS_BASE}/{TALKJS_APP_ID}/conversations/{conversation_id}"
    r = requests.put(url, json=payload, headers=_auth_headers(), timeout=_DEFAULT_TIMEOUT)
    r.raise_for_status()

def add_participants(conversation_id: str, participants: Iterable[str]) -> None:
    url = f"{TALKJS_BASE}/{TALKJS_APP_ID}/conversations/{conversation_id}"
    payload = {"participants": {"add": list(participants)}}
    r = requests.patch(url, json=payload, headers=_auth_headers(), timeout=_DEFAULT_TIMEOUT)
    r.raise_for_status()

def post_messages(conversation_id: str, messages: List[Dict[str, Any]]) -> None:
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages must be a non-empty list")
    url = f"{TALKJS_BASE}/{TALKJS_APP_ID}/conversations/{conversation_id}/messages"
    r = requests.post(url, json=messages, headers=_auth_headers(), timeout=_DEFAULT_TIMEOUT)
    r.raise_for_status()

def post_text(conversation_id: str, text: str, *, sender_id: Optional[str] = None) -> None:
    msg = {"type": "UserMessage", "sender": sender_id, "text": text} if sender_id else {"type": "SystemMessage", "text": text}
    post_messages(conversation_id, [msg])

def verify_webhook_signature(raw_body: bytes, signature: str, timestamp: str) -> bool:
    if not (signature and timestamp) or not TALKJS_SECRET:
        return False
    mac = hmac.new(TALKJS_SECRET.encode("utf-8"), msg=timestamp.encode("utf-8") + b"." + raw_body, digestmod=hashlib.sha256)
    expected_hex = mac.hexdigest()
    return hmac.compare_digest(expected_hex, signature)

def ensure_bootstrap(user_id: str, user_profile: Dict[str, Any], conversation_id: str,
                     include_system_bot: bool = True, system_bot_id: str = "system-bot",
                     system_bot_profile: Optional[Dict[str, Any]] = None, subject: str = "IQ Brick Arena",
                     welcome_message: Optional[str] = None) -> None:
    if include_system_bot:
        ensure_user(system_bot_id, system_bot_profile or {"name": "System Bot"})
        ensure_conversation(conversation_id, [system_bot_id], subject, welcome_message)
    ensure_user(user_id, user_profile)
    add_participants(conversation_id, [user_id])
