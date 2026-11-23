"use client";

import { useState, type FormEvent } from "react";
import { Globe2, Link2, LoaderCircle, Plus, X } from "lucide-react";
import { api, type Job } from "@/lib/api";

export function JobImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (job: Job) => void;
}) {
  const [tab, setTab] = useState<"url" | "manual">("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [modality, setModality] = useState<"not_specified" | "remote" | "hybrid" | "onsite">(
    "not_specified"
  );
  const [seniority, setSeniority] = useState("not_specified");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function importByUrl(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const job = await api<Job>("/jobs/import-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      onImported(job);
    } catch (err) {
      setError((err as Error).message);
      setTab("manual");
    } finally {
      setBusy(false);
    }
  }

  async function createManual(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const job = await api<Job>("/jobs/manual", {
        method: "POST",
        body: JSON.stringify({
          title,
          company,
          location: location || "Não informado",
          modality,
          seniority,
          url,
          description,
        }),
      });
      onImported(job);
    } catch (err) {
      setError((err as Error).message);
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
            <Globe2 size={15} /> ADICIONAR QUALQUER VAGA
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <h2>Importar vaga externa</h2>
        <p className="muted">
          Traga vagas do LinkedIn, Gupy, Workday, Catho ou sites próprios para calcular match,
          preparar respostas com IA e acompanhar todo o processo.
        </p>

        <div className="tab-bar">
          <button
            type="button"
            className={tab === "url" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("url")}
          >
            <Link2 size={15} /> Importar por URL
          </button>
          <button
            type="button"
            className={tab === "manual" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("manual")}
          >
            <Plus size={15} /> Cadastrar manualmente
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === "url" ? (
          <form className="profile-form" onSubmit={importByUrl}>
            <label>
              Link público da vaga
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://empresa.gupy.io/jobs/... ou https://boards.greenhouse.io/..."
              />
            </label>
            <p className="muted small-note">
              Lemos automaticamente metadados públicos (JSON-LD / OpenGraph). Se o portal exigir
              login ou bloquear leitura automática, você pode colar a descrição na aba manual.
            </p>
            <div className="modal-footer">
              <button className="btn primary" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}
                {busy ? "Importando..." : "Importar vaga"}
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <form className="profile-form" onSubmit={createManual}>
            <div className="form-grid">
              <label>
                Cargo / Título *
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Desenvolvedor(a) Python Sênior"
                />
              </label>
              <label>
                Empresa *
                <input
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nome da empresa"
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Localização
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Remoto - Brasil ou São Paulo, SP"
                />
              </label>
              <label>
                Modalidade
                <select
                  value={modality}
                  onChange={(e) =>
                    setModality(e.target.value as "not_specified" | "remote" | "hybrid" | "onsite")
                  }
                >
                  <option value="not_specified">Detectar automaticamente</option>
                  <option value="remote">Remoto</option>
                  <option value="hybrid">Híbrido</option>
                  <option value="onsite">Presencial</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Senioridade
                <select value={seniority} onChange={(e) => setSeniority(e.target.value)}>
                  <option value="not_specified">Detectar automaticamente</option>
                  <option value="intern">Estágio</option>
                  <option value="junior">Júnior</option>
                  <option value="pleno">Pleno</option>
                  <option value="senior">Sênior</option>
                  <option value="lead">Lead / Staff</option>
                </select>
              </label>
              <label>
                URL da vaga (opcional)
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
            <label>
              Descrição e requisitos da vaga
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cole aqui a descrição completa da vaga para melhorar o match score e as respostas geradas pela IA..."
              />
            </label>
            <div className="modal-footer">
              <button className="btn primary" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
                {busy ? "Salvando..." : "Salvar vaga"}
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
