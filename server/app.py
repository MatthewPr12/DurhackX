import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
print("APP_ID =", repr(os.getenv("TALKJS_APP_ID")))
print("SECRET startswith sk_test? =", os.getenv("TALKJS_SECRET","" ).startswith("sk_test_"))
print("API_ORIGIN =", repr(os.getenv("TALKJS_API_ORIGIN", "https://api.talkjs.com")))

from contextlib import asynccontextmanager
from models import (
    init_db, get_session, Question, get_next_question,
    get_room_state, set_room_current_question
)
from schema import QuestionOut, AnswerIn, AnswerOut
from talkjs_client import (
    ensure_bootstrap, ensure_user, ensure_conversation, post_text,
    make_user_token, verify_webhook_signature
)

TALKJS_APP_ID = os.getenv("TALKJS_APP_ID", "")
DEFAULT_CONVO = os.getenv("TALKJS_CONVERSATION_ID", "quiz_room_2")
print("CONVERSATION_ID =", DEFAULT_CONVO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Make sure the system-bot + main room exist at startup
    try:
        ensure_bootstrap(
            user_id="system-bot",
            user_profile={"name": "System Bot"},
            conversation_id=DEFAULT_CONVO,
            include_system_bot=True,  # create convo with bot in it
            system_bot_id="system-bot",
            subject="IQ Brick Arena",
        )
        # Post a startup notice into the same TalkJS conversation so we can
        # verify the server is alive and talking to TalkJS on boot.
        try:
            post_text(DEFAULT_CONVO, "🔔 Quiz server restarted", sender_id="system-bot")
        except Exception:
            pass

        # If there is no active question yet for this room, post the first one
        try:
            st = get_room_state(DEFAULT_CONVO)
            if st.current_question_id is None:
                q = get_next_question(None)
                if q:
                    set_room_current_question(DEFAULT_CONVO, q.id)
                    post_text(
                        DEFAULT_CONVO,
                        f"Q{q.id}: {q.text}\n" + "\n".join(f"{i}. {a}" for i, a in enumerate(q.answers)),
                        sender_id="system-bot",
                    )
                else:
                    post_text(DEFAULT_CONVO, "No questions available.", sender_id=None)
        except Exception:
            pass
    except Exception:
        pass
    yield

app = FastAPI(title="Quiz Game API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.get("/questions/next", response_model=QuestionOut)
def next_question(after_id: int | None = None):
    q = get_next_question(after_id)
    if not q:
        raise HTTPException(404, "No more questions")
    return QuestionOut(id=q.id, text=q.text, answers=q.answers)

@app.post("/answer", response_model=AnswerOut)
def answer(payload: AnswerIn):
    with get_session() as s:
        q = s.get(Question, payload.question_id)
        if not q:
            raise HTTPException(404, "Question not found")

        correct = (payload.choice_index == q.correct_index)
        convo_id = payload.talk_conversation_id or DEFAULT_CONVO

        post_text(convo_id, f"{'✅ Correct' if correct else '❌ Incorrect'} — Q{q.id}", sender_id="system-bot")

        # Next
        nxt = get_next_question(q.id)
        if nxt:
            set_room_current_question(convo_id, nxt.id)
            post_text(
                convo_id,
                f"Q{nxt.id}: {nxt.text}\n" + "\n".join(f"{i}. {a}" for i, a in enumerate(nxt.answers)),
                sender_id="system-bot",
            )
            next_out = {"id": nxt.id, "text": nxt.text, "answers": nxt.answers}
        else:
            set_room_current_question(convo_id, None)
            post_text(convo_id, "🎉 End of questions!", sender_id=None)
            next_out = None

        return {"correct": correct, "next_question": next_out}

# ---- TalkJS: token + bootstrap for the browser ----

@app.get("/talkjs/session-token")
def talkjs_session_token(user_id: str):
    # Mint a short-lived user token for the browser (Alice, Bob, etc.)
    ensure_user(user_id, {"name": user_id})
    token = make_user_token(user_id)
    return {"token": token, "appId": TALKJS_APP_ID, "conversationId": DEFAULT_CONVO}

@app.post("/talkjs/bootstrap")
def bootstrap_talkjs(user_id: str, name: str, photo_url: str | None = None):
    ensure_bootstrap(
        user_id=user_id,
        user_profile={"name": name, "photoUrl": photo_url},
        conversation_id=DEFAULT_CONVO,
        include_system_bot=True,
        system_bot_id="system-bot",
        subject="IQ Brick Arena",
    )

    # If no active question yet, post the first one
    st = get_room_state(DEFAULT_CONVO)
    if st.current_question_id is None:
        q = get_next_question(None)
        if q:
            set_room_current_question(DEFAULT_CONVO, q.id)
            post_text(
                DEFAULT_CONVO,
                f"Q{q.id}: {q.text}\n" + "\n".join(f"{i}. {a}" for i, a in enumerate(q.answers)),
                sender_id="system-bot",
            )
        else:
            post_text(DEFAULT_CONVO, "No questions available.", sender_id=None)
    return {"ok": True, "conversationId": DEFAULT_CONVO}

# ---- TalkJS webhook: grade chat answers like "A"/"1" ----

@app.post("/webhooks/talkjs")
async def talkjs_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("X-TalkJS-Signature", "")
    ts  = request.headers.get("X-TalkJS-Timestamp", "")
    if not verify_webhook_signature(raw, sig, ts):
        raise HTTPException(401, "Invalid webhook signature")

    event = await request.json()
    if event.get("event") == "message.sent":
        data = event.get("data", {})
        message = data.get("message", {}) or {}
        sender = (message.get("sender") or {}).get("id")
        convo_id = (data.get("conversation") or {}).get("id") or DEFAULT_CONVO
        text = (message.get("text") or "").strip()

        # Ignore bot/system messages
        if not sender or sender == "system-bot":
            return {"ok": True}

        # Interpret A/B/C/D or 0..3
        # mapping = {"A": 0, "B": 1, "C": 2, "D": 3}
        mapping = {"A":0, "B":1, "C":2, "D":3, "E":4, "F":5, "G":6, "H":7, "I":8, "J":9, "K":10, "L":11, "M":12, "N":13, "O":14, "P":15, "Q":16, "R":17, "S":18, "T":19, "U":20, "V":21, "W":22, "X":23, "Y":24, "Z":25}
        choice_idx = None
        if text.upper() in mapping:
            choice_idx = mapping[text.upper()]
        elif text.isdigit():
            choice_idx = int(text)

        # Grade against current question for this room
        if choice_idx is not None:
            st = get_room_state(convo_id)
            qid = st.current_question_id
            if not qid:
                post_text(convo_id, "No active question. Type /next", sender_id="system-bot")
                return {"ok": True}

            with get_session() as s:
                q = s.get(Question, qid)
                if not q:
                    post_text(convo_id, "Question not found. Type /next", sender_id="system-bot")
                    return {"ok": True}

                correct = (choice_idx == q.correct_index)
                post_text(convo_id, f"{'✅ Correct' if correct else '❌ Incorrect'} — Q{q.id}", sender_id="system-bot")

                nxt = get_next_question(q.id)
                if nxt:
                    set_room_current_question(convo_id, nxt.id)
                    post_text(
                        convo_id,
                        f"Q{nxt.id}: {nxt.text}\n" + "\n".join(f"{i}. {a}" for i, a in enumerate(nxt.answers)),
                        sender_id="system-bot",
                    )
                else:
                    set_room_current_question(convo_id, None)
                    post_text(convo_id, "🎉 End of questions!", sender_id=None)

        elif text == "/next":
            q = get_next_question(None)
            if q:
                set_room_current_question(convo_id, q.id)
                post_text(
                    convo_id,
                    f"Q{q.id}: {q.text}\n" + "\n".join(f"{i}. {a}" for i, a in enumerate(q.answers)),
                    sender_id="system-bot",
                )
            else:
                post_text(convo_id, "No questions available.", sender_id=None)

    return {"ok": True}
