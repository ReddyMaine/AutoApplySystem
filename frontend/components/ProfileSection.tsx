"use client";

import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { emptyProfile, shorten, type Profile, type Resume } from "@/lib/api";

function ProfileForm({
  data,
  onSave,
  busy,
}: {
  data: Profile;
  onSave: (p: Profile) => void;
  busy: boolean;
}) {
  const [p, setP] = useState<Profile>({ ...emptyProfile, ...data });
  const [skills, setSkills] = useState((data.skills || []).join(", "));
  const [certs, setCerts] = useState((data.certifications || []).join(", "));
  const [expText, setExpText] = useState(
    (data.experiences || [])
      .map((e) => `${e.role || ""} | ${e.company || ""} | ${e.description || ""}`)
      .join("\n")
  );
  const [eduText, setEduText] = useState(
    (data.education || [])
      .map((e) => `${e.degree || ""} | ${e.institution || ""} | ${e.period || ""}`)
      .join("\n")
  );
  const [langText, setLangText] = useState(
    (data.languages || [])
      .map((l) => `${l.language || ""} | ${l.level || ""}`)
      .join("\n")
  );

  function field(key: keyof Profile, value: string | number | null) {
    setP((previous) => ({ ...previous, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      ...p,
      skills: skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      certifications: certs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      experiences: expText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [role, company, description] = line.split("|");
          return {
            role: role?.trim() || "",
            company: company?.trim() || "",
            description: description?.trim() || "",
          };
        }),
      education: eduText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [degree, institution, period] = line.split("|");
          return {
            degree: degree?.trim() || "",
            institution: institution?.trim() || "",
            period: period?.trim() || "",
          };
        }),
      languages: langText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [language, level] = line.split("|");
          return {
            language: language?.trim() || "",
            level: level?.trim() || "",
          };
        }),
    });
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Nome completo
          <input
            value={p.name}
            onChange={(e) => field("name", e.target.value)}
            placeholder="Seu nome"
          />
        </label>
        <label>
          Cargo desejado
          <input
            value={p.title}
            onChange={(e) => field("title", e.target.value)}
            placeholder="Python Backend Developer"
          />
        </label>
        <label>
          Localização
          <input
            value={p.location}
            onChange={(e) => field("location", e.target.value)}
            placeholder="São Paulo, SP"
          />
        </label>
        <label>
          Telefone
          <input
            value={p.phone}
            onChange={(e) => field("phone", e.target.value)}
            placeholder="+55 ..."
          />
        </label>
      </div>
      <label>
        Resumo profissional
        <textarea
          rows={4}
          value={p.summary}
          onChange={(e) => field("summary", e.target.value)}
          placeholder="Conte sua trajetória, objetivos e principais resultados..."
        />
      </label>
      <label>
        Habilidades (separadas por vírgula)
        <input
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          placeholder="Python, FastAPI, Docker, PostgreSQL"
        />
      </label>
      <label>
        Experiências (uma por linha: cargo | empresa | descrição)
        <textarea
          rows={4}
          value={expText}
          onChange={(e) => setExpText(e.target.value)}
          placeholder="Backend Developer | Empresa X | APIs Python e PostgreSQL"
        />
      </label>
      <div className="form-grid">
        <label>
          Formação acadêmica (uma por linha: curso | instituição | período)
          <textarea
            rows={3}
            value={eduText}
            onChange={(e) => setEduText(e.target.value)}
            placeholder="Ciência da Computação | USP | 2019-2023"
          />
        </label>
        <label>
          Idiomas (um por linha: idioma | nível)
          <textarea
            rows={3}
            value={langText}
            onChange={(e) => setLangText(e.target.value)}
            placeholder={"Português | Nativo\nInglês | Avançado"}
          />
        </label>
      </div>
      <label>
        Certificações (separadas por vírgula)
        <input
          value={certs}
          onChange={(e) => setCerts(e.target.value)}
          placeholder="AWS, PSM I"
        />
      </label>
      <div className="form-grid">
        <label>
          Modalidade
          <select value={p.modality} onChange={(e) => field("modality", e.target.value)}>
            <option value="any">Qualquer</option>
            <option value="remote">Remoto</option>
            <option value="hybrid">Híbrido</option>
            <option value="onsite">Presencial</option>
          </select>
        </label>
        <label>
          Senioridade
          <input
            value={p.seniority}
            onChange={(e) => field("seniority", e.target.value)}
            placeholder="Pleno"
          />
        </label>
        <label>
          Salário mínimo (R$)
          <input
            type="number"
            min="0"
            value={p.desired_salary_min ?? ""}
            onChange={(e) =>
              field("desired_salary_min", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
        <label>
          Salário máximo (R$)
          <input
            type="number"
            min="0"
            value={p.desired_salary_max ?? ""}
            onChange={(e) =>
              field("desired_salary_max", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          LinkedIn
          <input
            value={p.linkedin_url}
            onChange={(e) => field("linkedin_url", e.target.value)}
            placeholder="https://linkedin.com/in/..."
          />
        </label>
        <label>
          GitHub
          <input
            value={p.github_url}
            onChange={(e) => field("github_url", e.target.value)}
            placeholder="https://github.com/..."
          />
        </label>
      </div>
      <label>
        Portfólio
        <input
          value={p.portfolio_url}
          onChange={(e) => field("portfolio_url", e.target.value)}
          placeholder="https://..."
        />
      </label>
      <button className="btn primary" disabled={busy}>
        <Check size={17} /> {busy ? "Salvando..." : "Salvar perfil"}
      </button>
    </form>
  );
}

export function ProfileSection({
  profile,
  resumes,
  busy,
  onSaveProfile,
  onUploadResume,
  onConfirmResume,
  onDeleteResume,
  onExportAccount,
  onDeleteAccount,
}: {
  profile: Profile;
  resumes: Resume[];
  busy: string;
  onSaveProfile: (p: Profile) => void;
  onUploadResume: (file: File) => void;
  onConfirmResume: (id: string, overwrite: boolean) => void;
  onDeleteResume: (id: string) => void;
  onExportAccount: () => void;
  onDeleteAccount: () => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="profile-layout">
      <section className="panel profile-panel">
        <div className="panel-head">
          <div>
            <h2>Informações profissionais</h2>
            <p>Edite seus dados completos (usados no RAG, matching e Kit 1-Clique)</p>
          </div>
        </div>
        <ProfileForm
          key={profile.version || 1}
          data={profile}
          onSave={onSaveProfile}
          busy={busy === "profile"}
        />
      </section>

      <section className="panel upload-panel">
        <div className="panel-head">
          <div>
            <h2>Currículos</h2>
            <p>Extração de texto, prévia e gerenciamento</p>
          </div>
          <FileText size={21} />
        </div>

        <label className="upload-area">
          <UploadCloud size={32} />
          <strong>Selecionar currículo</strong>
          <span>PDF ou DOCX · até 8 MB</span>
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadResume(file);
              e.target.value = "";
            }}
          />
        </label>

        {resumes.map((r) => {
          const open = previewId === r.id;
          const extractedSkills = Array.isArray(r.extracted?.skills)
            ? (r.extracted.skills as string[])
            : [];
          return (
            <div className="resume-card" key={r.id}>
              <div className="resume-item">
                <FileText size={21} />
                <div>
                  <strong>{shorten(r.filename, 28)}</strong>
                  <span>
                    {r.status === "processed"
                      ? `Extraído (${String(r.extracted?.extraction_method || "ok")})`
                      : r.status === "failed"
                        ? "Falha: " + r.error
                        : r.status === "processing"
                          ? "Processando..."
                          : "Na fila"}
                  </span>
                </div>
                <div className="resume-actions">
                  {r.status === "processed" && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Pré-visualizar extração"
                      onClick={() => setPreviewId(open ? null : r.id)}
                    >
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title="Excluir currículo"
                    onClick={() => onDeleteResume(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {r.status === "processed" && open && (
                <div className="resume-preview">
                  {typeof r.extracted?.name === "string" && r.extracted.name && (
                    <p>
                      <b>Nome:</b> {r.extracted.name}
                    </p>
                  )}
                  {typeof r.extracted?.title === "string" && r.extracted.title && (
                    <p>
                      <b>Cargo:</b> {r.extracted.title}
                    </p>
                  )}
                  {extractedSkills.length > 0 && (
                    <p>
                      <b>Habilidades:</b> {extractedSkills.join(", ")}
                    </p>
                  )}
                  {typeof r.extracted?.summary === "string" && r.extracted.summary && (
                    <p>
                      <b>Resumo:</b> {shorten(r.extracted.summary, 220)}
                    </p>
                  )}
                </div>
              )}

              {r.status === "processed" && (
                <div className="resume-btn-row">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onConfirmResume(r.id, false)}
                  >
                    Preencher vazios
                  </button>
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={() => onConfirmResume(r.id, true)}
                  >
                    Substituir perfil
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="help-box">
          <ShieldCheck size={19} />
          <span>
            Revise a prévia da extração antes de incorporar. &quot;Preencher vazios&quot; preserva
            o que você já editou; &quot;Substituir perfil&quot; atualiza todos os campos extraídos.
          </span>
        </div>

        <div className="privacy-actions">
          <strong>Privacidade e dados</strong>
          <p>
            Exporte o registro dos seus dados ou exclua a conta. A exportação JSON não inclui os
            arquivos binários dos currículos.
          </p>
          <button type="button" className="btn secondary" onClick={onExportAccount}>
            Exportar dados
          </button>
          <button
            type="button"
            className="btn delete-btn"
            disabled={busy === "delete"}
            onClick={onDeleteAccount}
          >
            Excluir minha conta
          </button>
        </div>
      </section>
    </div>
  );
}
