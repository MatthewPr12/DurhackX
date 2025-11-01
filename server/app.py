import os, requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from models import init_db, get_session, Question, get_next_question
from schema import QuestionOut, AnswerIn, AnswerOut

load_dotenv()
TALKJS_APP_ID = os.getenv("TALKJS_APP_ID", "")
TALKJS_SECRET = os.getenv("TALKJS_SECRET", "")
DEFAULT_CONVO = os.getenv("TALKJS_CONVERSATION_ID", "quiz_room_1")
TALKJS_BASE = "https://api.talkjs.com/v1"

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    # (optional cleanup here)
app = FastAPI(title="Quiz Game API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def talkjs_post_message(conversation_id: str, body_text: str, sender_id: str = "system-bot"):
    """Send a message into TalkJS so players see results in chat."""
    if not (TALKJS_APP_ID and TALKJS_SECRET):
        return
    url = f"{TALKJS_BASE}/{TALKJS_APP_ID}/conversations/{conversation_id}/messages"
    headers = {"Authorization": f"Bearer {TALKJS_SECRET}", "Content-Type": "application/json"}
    payload = [{"text": body_text, "sender": sender_id, "type": "UserMessage"}]
    try:
        requests.post(url, json=payload, headers=headers, timeout=5)
    except requests.RequestException:
        pass
# Docs for messages endpoint. :contentReference[oaicite:4]{index=4}

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

        # Prepare next question
        nxt = get_next_question(q.id)
        next_out = None
        if nxt:
            next_out = {"id": nxt.id, "text": nxt.text, "answers": nxt.answers}

        # Announce result in TalkJS conversation
        convo_id = payload.talk_conversation_id or DEFAULT_CONVO
        talkjs_post_message(convo_id, f"{'✅ Correct' if correct else '❌ Incorrect'} — Q{q.id}")

        return {"correct": correct, "next_question": next_out}
