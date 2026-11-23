import pytest


def test_human_approval_interrupt(monkeypatch):
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.types import Command
    import app.agents.graph as agent

    monkeypatch.setattr(agent, "node_answers", lambda state: {"answers": [], "status": "awaiting_approval"})
    graph = agent.build_graph(InMemorySaver())
    state = {"application_id": "test-thread", "user_id": "test-user",
             "profile": {"skills": ["Python"]},
             "job": {"title": "Python Engineer", "description": "Python", "modality": "remote"},
             "questions": ["Por que esta vaga?"]}
    config = {"configurable": {"thread_id": "test-thread"}}
    first = graph.invoke(state, config=config)
    assert "__interrupt__" in first
    assert graph.get_state(config).values["status"] == "awaiting_approval"
    resumed = graph.invoke(Command(resume=True), config=config)
    assert resumed["status"] == "ready"
    assert resumed["approved"] is True
