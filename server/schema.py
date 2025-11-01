from pydantic import BaseModel
from typing import List, Optional

class QuestionOut(BaseModel):
    id: int
    text: str
    answers: List[str]

class AnswerIn(BaseModel):
    question_id: int
    choice_index: int
    talk_conversation_id: Optional[str] = None

class AnswerOut(BaseModel):
    correct: bool
    next_question: Optional[QuestionOut] = None
