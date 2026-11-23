"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  ExternalLink,
  FileText,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  api,
  copyText,
  eventLabels,
  stageNames,
  stageOrder,
  statusNames,
  type Application,
  type ApplicationEventItem,
  type Profile,
  type StageKey,
} from "@/lib/api";

type Tab = "review" | "kit" | "tracking";

function initialTab(status: string): Tab {
  if (status === "submitted" || status === "reported_submitted") return "tracking";
  if (status === "ready") return "kit";
  return "review";
}

export function ApplicationModal({
  item,
  profile,
  userEmail,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: Application;
  profile: Profile;
  userEmail: string;
  onClose: () => void;
  onUpdated: (message: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>(() => initialTab(item.status));
  const [answers, setAnswers] = useState(item.answers.map((a) => ({ ...a })));
  const [coverLetter, setCoverLetter] = useState(item.cover_letter || "");
  const [newQuestion, setNewQuestion] = useState("");
  const [manualReceipt, setManualReceipt] = useState(item.external_receipt || "");
  const [manualNotes, setManualNotes] = useState(item.notes || "");
  const [stage, setStage] = useState<StageKey>(item.stage || "none");
  const [receipt, setReceipt] = useState(item.external_receipt || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [followUp, setFollowUp] = useState(
    item.follow_up_at ? item.follow_up_at.slice(0, 10) : ""
  );
  const [events, setEvents] = useState<ApplicationEventItem[]>([]);
  const [copiedKey, setCopiedKey] = useState("");
  const [pending, setPending] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setAnswers(item.answers.map((a) => ({ ...a })));
    setCoverLetter(item.cover_letter || "");
    setStage(item.stage || "none");
    setReceipt(item.external_receipt || "");
    setManualReceipt(item.external_receipt || "");
    setNotes(item.notes || "");
    setManualNotes(item.notes || "");
    setFollowUp(item.follow_up_at ? item.follow_up_at.slice(0, 10) : "");
  }, [item]);

  const loadEvents = useCallback(async () => {
    try {
      const list = await api<ApplicationEventItem[]>(`/applications/${item.id}/events`);
      setEvents(list);
    } catch {
      /* ignore transient fetch failure */
    }
  }, [item.id]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, item.status, item.stage, item.updated_at]);

  async function doCopy(key: string, value: string) {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? "" : prev)), 1800);
    }
  }

  async function runAction(
    key: string,
    request: () => Promise<unknown>,
    successMsg: string,
    switchTab?: Tab
  ) {
    setPending(key);
    setLocalError("");
    try {
      await request();
      await onUpdated(successMsg);
      await loadEvents();
      if (switchTab) setTab(switchTab);
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setPending("");
    }
  }

  async function handleAddQuestion(e: FormEvent) {
    e.preventDefault();
    const q = newQuestion.trim();
    if (!q) return;
    await runAction(
      "add-q",
      () =>
        api(`/applications/${item.id}/questions`, {
          method: "POST",
          body: JSON.stringify({ question: q }),
        }),
      "Nova pergunta respondida com base no seu perfil."
    );
    setNewQuestion("");
  }

  async function handleDelete() {
    if (!window.confirm("Excluir esta candidatura e seu histórico?")) return;
    setPending("delete");
    setLocalError("");
    try {
      await api(`/applications/${item.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (err) {
      setLocalError((err as Error).message);
      setPending("");
    }
  }

  const kitFields = [
    { key: "name", label: "Nome completo", value: profile.name },
    { key: "email", label: "E-mail", value: userEmail },
    { key: "phone", label: "Telefone", value: profile.phone },
    { key: "location", label: "Localização", value: profile.location },
    { key: "linkedin", label: "LinkedIn", value: profile.linkedin_url },
    { key: "github", label: "GitHub", value: profile.github_url },
    { key: "portfolio", label: "Portfólio", value: profile.portfolio_url },
    { key: "summary", label: "Resumo profissional", value: profile.summary },
  ].filter((f) => f.value && f.value.trim());

  const canRetry = ["failed", "unknown", "rejected", "awaiting_approval"].includes(item.status);
  const canSubmit = ["ready", "unknown"].includes(item.status) && item.approved;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="eyebrow">
            <WandSparkles size={15} /> WORKFLOW LANGGRAPH + ACOMPANHAMENTO
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <h2>{item.job?.title || "Candidatura"}</h2>
        <p className="muted">
          {item.job?.company} · {item.job?.location}
        </p>

        <div className="modal-stats">
          <span className={`status ${item.status}`}>{statusNames[item.status] || item.status}</span>
          {item.stage && item.stage !== "none" && (
            <span className={`stage-badge stage-${item.stage}`}>
              {stageNames[item.stage] || item.stage}
            </span>
          )}
          <strong>Match: {item.score ?? "—"}%</strong>
          {item.external_receipt && <span className="receipt">Recibo: {item.external_receipt}</span>}
        </div>

        <div className="tab-bar">
          <button
            type="button"
            className={tab === "review" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("review")}
          >
            <FileText size={14} /> Revisão & IA
          </button>
          <button
            type="button"
            className={tab === "kit" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("kit")}
          >
            <ClipboardCopy size={14} /> Kit 1-Clique & Envio
          </button>
          <button
            type="button"
            className={tab === "tracking" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("tracking")}
          >
            <Clock size={14} /> Feedback & Pipeline ({events.length})
          </button>
        </div>

        {localError && <div className="error">{localError}</div>}
        {item.error && <div className="error">{item.error}</div>}

        {tab === "review" && (
          <div>
            {item.reasons?.length > 0 && (
              <div className="reason-box">
                <strong>Por que essa vaga?</strong>
                {item.reasons.map((r, i) => (
                  <p key={i}>
                    <CheckCircle2 size={15} />
                    {r}
                  </p>
                ))}
              </div>
            )}

            {item.status === "processing" ? (
              <div className="empty">
                <LoaderCircle className="spin" size={20} /> A IA está preparando suas respostas e
                carta de apresentação...
              </div>
            ) : (
              <>
                <h3>Respostas propostas ({answers.length})</h3>
                {answers.map((answer, index) => (
                  <div className="answer-edit" key={index}>
                    <div className="answer-head">
                      <strong>{answer.question}</strong>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => doCopy(`ans-${index}`, answer.answer)}
                      >
                        {copiedKey === `ans-${index}` ? (
                          <>
                            <Check size={13} /> Copiado
                          </>
                        ) : (
                          <>
                            <ClipboardCopy size={13} /> Copiar
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={answer.answer}
                      onChange={(e) =>
                        setAnswers((prev) =>
                          prev.map((a, i) => (i === index ? { ...a, answer: e.target.value } : a))
                        )
                      }
                      disabled={item.status !== "awaiting_approval"}
                    />
                    <small>
                      Baseado em {answer.evidence_ids?.length || 0} evidências do perfil.{" "}
                      {answer.warning || "Verifique os fatos antes de aprovar."}
                    </small>
                  </div>
                ))}

                <form className="add-question-box" onSubmit={handleAddQuestion}>
                  <label>
                    Encontrou outra pergunta no formulário da vaga? Gere resposta agora:
                  </label>
                  <div className="inline-add">
                    <input
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="Ex.: Conte um desafio técnico que você resolveu..."
                    />
                    <button
                      type="submit"
                      className="btn secondary sm"
                      disabled={pending === "add-q" || !newQuestion.trim()}
                    >
                      {pending === "add-q" ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                      Responder com IA
                    </button>
                  </div>
                </form>

                <div className="answer-edit">
                  <div className="answer-head">
                    <strong>Carta de Apresentação (Cover Letter)</strong>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => doCopy("cover", coverLetter)}
                    >
                      {copiedKey === "cover" ? (
                        <>
                          <Check size={13} /> Copiado
                        </>
                      ) : (
                        <>
                          <ClipboardCopy size={13} /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    disabled={item.status !== "awaiting_approval"}
                    placeholder="Carta de apresentação personalizada para esta vaga..."
                  />
                </div>
              </>
            )}

            <div className="modal-footer">
              {item.status === "awaiting_approval" && (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!!pending}
                    onClick={() =>
                      runAction(
                        "reject",
                        () =>
                          api(`/applications/${item.id}/approve`, {
                            method: "POST",
                            body: JSON.stringify({ approved: false }),
                          }),
                        "Candidatura descartada."
                      )
                    }
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!!pending}
                    onClick={() =>
                      runAction(
                        "approve",
                        () =>
                          api(`/applications/${item.id}/approve`, {
                            method: "POST",
                            body: JSON.stringify({
                              approved: true,
                              answers,
                              cover_letter: coverLetter,
                            }),
                          }),
                        "Respostas aprovadas! Use o Kit 1-Clique ou envie agora.",
                        "kit"
                      )
                    }
                  >
                    <Check size={17} /> Aprovar respostas
                  </button>
                </>
              )}
              {canRetry && (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!!pending}
                  onClick={() =>
                    runAction(
                      "retry",
                      () =>
                        api(`/applications/${item.id}/retry`, {
                          method: "POST",
                          body: JSON.stringify({ generate_cover_letter: true }),
                        }),
                      "Reprocessamento enviado para a fila."
                    )
                  }
                >
                  <RotateCcw size={15} /> Reprocessar com IA
                </button>
              )}
              <button
                type="button"
                className="btn delete-btn sm"
                disabled={!!pending}
                onClick={handleDelete}
              >
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        )}

        {tab === "kit" && (
          <div>
            <p className="muted small-note">
              Para plataformas externas (LinkedIn, Gupy, Workday, Greenhouse, etc.), abra o site
              oficial, faça login/cadastro se necessário e cole seus dados com 1 clique abaixo.
            </p>

            <div className="kit-grid">
              {kitFields.map((f) => (
                <div className="kit-card" key={f.key}>
                  <div className="kit-card-top">
                    <span>{f.label}</span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => doCopy(f.key, f.value)}
                    >
                      {copiedKey === f.key ? (
                        <>
                          <Check size={13} /> Copiado
                        </>
                      ) : (
                        <>
                          <ClipboardCopy size={13} /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                  <p>{f.value}</p>
                </div>
              ))}
            </div>

            {coverLetter && (
              <div className="kit-card full-card">
                <div className="kit-card-top">
                  <span>Carta de Apresentação</span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => doCopy("kit-cover", coverLetter)}
                  >
                    {copiedKey === "kit-cover" ? (
                      <>
                        <Check size={13} /> Copiado
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={13} /> Copiar carta
                      </>
                    )}
                  </button>
                </div>
                <p className="pre-wrap">{coverLetter}</p>
              </div>
            )}

            {answers.map((ans, idx) => (
              <div className="kit-card full-card" key={idx}>
                <div className="kit-card-top">
                  <span>{ans.question}</span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => doCopy(`kit-ans-${idx}`, ans.answer)}
                  >
                    {copiedKey === `kit-ans-${idx}` ? (
                      <>
                        <Check size={13} /> Copiado
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={13} /> Copiar resposta
                      </>
                    )}
                  </button>
                </div>
                <p className="pre-wrap">{ans.answer}</p>
              </div>
            ))}

            <div className="submit-panel">
              <h3>Finalizar envio</h3>
              {!item.approved ? (
                <p className="muted small-note">
                  Aprove suas respostas na aba &quot;Revisão &amp; IA&quot; antes de registrar ou
                  disparar o envio.
                </p>
              ) : item.job?.source === "sandbox" ? (
                <div className="modal-footer">
                  {canSubmit && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!!pending}
                      onClick={() =>
                        runAction(
                          "submit-sandbox",
                          () =>
                            api(`/applications/${item.id}/submit-sandbox`, { method: "POST" }),
                          "Envio automatizado enviado à fila Playwright. Aguarde o recibo e screenshot.",
                          "tracking"
                        )
                      }
                    >
                      <Play size={16} /> Enviar para ATS de teste (Playwright)
                    </button>
                  )}
                  {item.status === "submitting" && (
                    <span className="muted small-note">
                      <LoaderCircle className="spin" size={14} /> Playwright preenchendo e gerando
                      screenshot de comprovação...
                    </span>
                  )}
                  {item.status === "submitted" && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setTab("tracking")}
                    >
                      <Camera size={16} /> Ver recibo e screenshot de confirmação
                    </button>
                  )}
                </div>
              ) : (
                <div className="profile-form">
                  {item.job?.url && (
                    <div>
                      <a
                        className="btn secondary"
                        href={item.job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir site oficial da vaga <ExternalLink size={16} />
                      </a>
                    </div>
                  )}
                  {canSubmit && (
                    <>
                      <div className="form-grid">
                        <label>
                          Protocolo / Recibo do portal (opcional)
                          <input
                            value={manualReceipt}
                            onChange={(e) => setManualReceipt(e.target.value)}
                            placeholder="Ex.: GUPY-98412 ou Confirmação por e-mail"
                          />
                        </label>
                        <label>
                          Observação inicial (opcional)
                          <input
                            value={manualNotes}
                            onChange={(e) => setManualNotes(e.target.value)}
                            placeholder="Ex.: Criado cadastro na plataforma X"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!!pending}
                        onClick={() =>
                          runAction(
                            "mark-manual",
                            () =>
                              api(`/applications/${item.id}/mark-manual`, {
                                method: "POST",
                                body: JSON.stringify({
                                  receipt: manualReceipt || null,
                                  notes: manualNotes || null,
                                }),
                              }),
                            "Envio manual registrado com sucesso!",
                            "tracking"
                          )
                        }
                      >
                        <Check size={16} /> Confirmar que enviei a candidatura
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "tracking" && (
          <div>
            {item.has_proof && (
              <div className="proof-box">
                <div className="proof-head">
                  <strong>
                    <Camera size={15} /> Comprovante visual capturado (Playwright)
                  </strong>
                  <a
                    className="text-btn"
                    href={`/api/v1/applications/${item.id}/proof`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir imagem <ExternalLink size={14} />
                  </a>
                </div>
                <img
                  src={`/api/v1/applications/${item.id}/proof`}
                  alt="Screenshot de confirmação da candidatura"
                  className="proof-img"
                />
              </div>
            )}

            <h3>Pipeline pós-candidatura</h3>
            <p className="muted small-note">
              Atualize a etapa conforme receber retorno por e-mail ou portal da empresa.
            </p>
            <div className="stage-pills">
              {stageOrder.map((st) => (
                <button
                  type="button"
                  key={st}
                  className={stage === st ? `stage-pill active stage-${st}` : "stage-pill"}
                  onClick={() => setStage(st)}
                >
                  {stageNames[st]}
                </button>
              ))}
            </div>

            <div className="profile-form tracking-form">
              <div className="form-grid">
                <label>
                  Protocolo / Recibo / Link de confirmação
                  <input
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value)}
                    placeholder="Código de confirmação ou assunto do e-mail"
                  />
                </label>
                <label>
                  Data de follow-up (lembrete)
                  <input
                    type="date"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Anotações do processo seletivo
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contato do recrutador, feedback da entrevista, pretensão informada, próximos passos..."
                />
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={pending === "tracking"}
                onClick={() =>
                  runAction(
                    "tracking",
                    () =>
                      api(`/applications/${item.id}/tracking`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          stage,
                          external_receipt: receipt,
                          notes,
                          follow_up_at: followUp,
                        }),
                      }),
                    "Acompanhamento salvo na timeline."
                  )
                }
              >
                {pending === "tracking" ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                Salvar acompanhamento
              </button>
            </div>

            <h3>Timeline de auditoria</h3>
            {events.length === 0 ? (
              <div className="empty">Nenhum evento registrado ainda.</div>
            ) : (
              <div className="timeline">
                {events.map((ev, i) => (
                  <div className="timeline-item" key={i}>
                    <span className="timeline-dot" />
                    <div className="timeline-body">
                      <strong>{eventLabels[ev.event] || ev.event}</strong>
                      <small>{new Date(ev.at).toLocaleString("pt-BR")}</small>
                      {ev.details && Object.keys(ev.details).length > 0 && (
                        <code className="timeline-details">{JSON.stringify(ev.details)}</code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="modal-disclaimer">
          <ShieldCheck size={15} /> Automação direta restrita ao ATS sandbox; portais externos
          operam em modo Copiloto (1-clique) respeitando login, CAPTCHA e Termos de Uso.
        </p>
      </div>
    </div>
  );
}
