from typing import List, Optional
from sqlmodel import SQLModel, Field, Column, JSON, create_engine, Session, select

class Question(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str
    answers: List[str] = Field(sa_column=Column(JSON))
    correct_index: int
    category: Optional[str] = None
    difficulty: Optional[str] = None

engine = create_engine("sqlite:///quiz.db", echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    return Session(engine)

def get_next_question(current_id: Optional[int] = None) -> Optional[Question]:
    with get_session() as s:
        if current_id is None:
            q = s.exec(select(Question).order_by(Question.id)).first()
        else:
            q = s.exec(
                select(Question).where(Question.id > current_id).order_by(Question.id)
            ).first()
        return q

class RoomState(SQLModel, table=True):
    conversation_id: str = Field(primary_key=True)
    current_question_id: Optional[int] = None

def get_room_state(conversation_id: str) -> RoomState:
    with get_session() as s:
        st = s.get(RoomState, conversation_id)
        if not st:
            st = RoomState(conversation_id=conversation_id, current_question_id=None)
            s.add(st); s.commit(); s.refresh(st)
        return st

def set_room_current_question(conversation_id: str, qid: Optional[int]) -> None:
    with get_session() as s:
        st = s.get(RoomState, conversation_id)
        if not st:
            st = RoomState(conversation_id=conversation_id, current_question_id=qid)
            s.add(st)
        else:
            st.current_question_id = qid
        s.commit()
