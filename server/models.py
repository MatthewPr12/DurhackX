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
            q = s.exec(select(Question).where(Question.id > current_id).order_by(Question.id)).first()
        return q
