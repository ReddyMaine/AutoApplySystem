"""Graph with durable checkpoints and human approval; side effects happen OUTSIDE this graph."""
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from app.services.matching import calculate_match


class ApplicationState(TypedDict, total=False):
    application_id: str
    user_id: str
    profile: dict
    job: dict
    questions: list[str]
    generate_cover_letter: bool
    match_score: float
    match_reasons: list[str]
    answers: list[dict]
    cover_letter: str
    approved: bool
    status: str


def node_match(state: ApplicationState) -> dict:
    score, reasons = calculate_match(state["profile"], state["job"])
    return {"match_score": score, "match_reasons": reasons, "status": "matched"}


def node_answers(state: ApplicationState) -> dict:
    # Imports here keep pure graph construction easily testable.
    from app.database import SessionLocal
    from app.services.rag import retrieve_evidence, answer_question, generate_cover_letter
    import uuid

    user_uuid = uuid.UUID(state["user_id"])
    with SessionLocal() as db:
        answers = [
            answer_question(q, state["job"], retrieve_evidence(db, user_uuid, q))
            for q in state.get("questions", [])
        ]
        cover_letter = ""
        if state.get("generate_cover_letter", True):
            query = f"{state['job'].get('title', '')} {state['job'].get('description', '')[:500]}"
            evidence = retrieve_evidence(db, user_uuid, query, limit=6)
            cover_letter = generate_cover_letter(state["profile"], state["job"], evidence)
    return {"answers": answers, "cover_letter": cover_letter, "status": "awaiting_approval"}


def node_approval(state: ApplicationState) -> dict:
    decision = interrupt(
        {
            "application_id": state["application_id"],
            "score": state["match_score"],
            "answers": state.get("answers", []),
            "cover_letter": state.get("cover_letter", ""),
            "action": "approve_or_reject",
        }
    )
    return {"approved": bool(decision), "status": "ready" if decision else "rejected"}


def build_graph(checkpointer):
    graph = StateGraph(ApplicationState)
    graph.add_node("match", node_match)
    graph.add_node("answers", node_answers)
    graph.add_node("approval", node_approval)
    graph.add_edge(START, "match")
    graph.add_edge("match", "answers")
    graph.add_edge("answers", "approval")
    graph.add_edge("approval", END)
    return graph.compile(checkpointer=checkpointer)
