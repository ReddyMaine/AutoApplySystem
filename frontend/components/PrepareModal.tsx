"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { type Job, type Resume } from "@/lib/api";

const DEFAULT_QUESTIONS = [
  "Por que deseja trabalhar conosco?",
  "Quais experiências são mais relevantes para esta vaga?",
];

export function PrepareModal({
  job,
  resumes,
  onClose,
  onSubmit,
}: {
  job: Job;
  resumes: Resume[];
  onClose: () => void;
  onSubmit: (payload: {
    job_id: string;
    questions: string[];
    resume_id: string | null;
    generate_cover_letter: boolean;
  }) => Promise<void>;
}) {
  const processedResumes = resumes.filter((r) => r.status === "processed");
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [newQuestion, setNewQuestion] = useState("");
  const [resumeId, setResumeId] = useState<string>(processedResumes[0]?.id || "");
  const [genCover, setGenCover] = useState(true);
  const [busy, setBusy] = useState(false);

  function addQuestion() {
    const q = newQuestion.trim();
    if (!q || questions.length >= 10) return;
    setQuestions([...questions, q]);
    setNewQuestion("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = questions.map((q) => q.trim()).filter(Boolean);
    if (!cleaned.length) return;
    setBusy(true);
    try {
      await onSubmit({
        job_id: job.id,
        questions: cleaned,
        resume_id: resumeId || null,
        generate_cover_letter: genCover,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="eyebrow">
            <Sparkles size={15} /> PREPARAR CANDIDATURA
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <h2>{job.title}</h2>
        <p className="muted">
          {job.company} · {job.location}
        </p>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div>
            <label>Perguntas do formulário da vaga (você pode editar ou adicionar mais depois)</label>
            <div className="question-list">
              {questions.map((q, i) => (
                <div className="question-row" key={i}>
                  <input
                    value={q}
                    onChange={(e) =>
                      setQuestions(questions.map((item, idx) => (idx === i ? e.target.value : item)))
                    }
                  />
                  {questions.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Remover pergunta"
                      onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="inline-add">
              <input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Ex.: Qual sua experiência com Python e bancos SQL?"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuestion();
                  }
                }}
              />
              <button type="button" className="btn secondary sm" onClick={addQuestion}>
                <Plus size={14} /> Adicionar
              </button>
            </div>
          </div>

          {processedResumes.length > 0 && (
            <label>
              Currículo vinculado
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                {processedResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.filename}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={genCover}
              onChange={(e) => setGenCover(e.target.checked)}
            />
            <span>Gerar Carta de Apresentação (Cover Letter) personalizada para esta vaga</span>
          </label>

          <div className="modal-footer">
            <button className="btn primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {busy ? "Iniciando IA..." : "Gerar respostas e carta"}
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
