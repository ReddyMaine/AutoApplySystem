export type Session = { id: string; email: string };

export type Profile = {
  version?: number;
  name: string;
  title: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experiences: Record<string, string>[];
  education: Record<string, string>[];
  certifications: string[];
  languages: Record<string, string>[];
  desired_salary_min: number | null;
  desired_salary_max: number | null;
  modality: "remote" | "hybrid" | "onsite" | "any";
  seniority: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  modality: string;
  seniority: string;
  source: string;
  description: string;
  url: string;
  score?: number;
  salary_min?: number | null;
  salary_max?: number | null;
  created_at?: string | null;
};

export type Answer = {
  question: string;
  answer: string;
  evidence_ids: string[];
  warning?: string;
  requires_review?: boolean;
};

export type StageKey =
  | "none"
  | "confirmed"
  | "screening"
  | "interview"
  | "technical_test"
  | "offer"
  | "rejected_company"
  | "withdrawn";

export type Application = {
  id: string;
  job_id: string;
  resume_id?: string | null;
  status: string;
  stage: StageKey;
  score: number | null;
  reasons: string[];
  answers: Answer[];
  questions: string[];
  cover_letter?: string | null;
  notes?: string | null;
  approved: boolean;
  error?: string | null;
  external_receipt?: string | null;
  has_proof: boolean;
  follow_up_at?: string | null;
  job: Job | null;
  created_at: string;
  updated_at?: string | null;
};

export type ApplicationEventItem = {
  event: string;
  details: Record<string, unknown>;
  at: string;
};

export type Resume = {
  id: string;
  filename: string;
  status: string;
  extracted: Record<string, unknown>;
  error?: string | null;
  created_at?: string | null;
};

export type Metrics = {
  by_status: Record<string, number>;
  by_stage: Record<string, number>;
  total: number;
};

export type DiscoveryStatus = {
  task_id: string;
  state: string;
  processed?: number;
  errors?: string[];
  error?: string;
};

export const emptyProfile: Profile = {
  name: "",
  title: "",
  phone: "",
  location: "",
  summary: "",
  skills: [],
  experiences: [],
  education: [],
  certifications: [],
  languages: [],
  desired_salary_min: null,
  desired_salary_max: null,
  modality: "any",
  seniority: "any",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
};

export const statusNames: Record<string, string> = {
  processing: "Preparando",
  awaiting_approval: "Aguardando revisão",
  ready: "Aprovada",
  rejected: "Descartada",
  submitting: "Enviando teste",
  submitted: "Enviada (sandbox)",
  reported_submitted: "Envio registrado",
  unknown: "Verificar envio",
  failed: "Falhou",
};

export const stageNames: Record<StageKey, string> = {
  none: "Sem retorno ainda",
  confirmed: "Confirmada",
  screening: "Triagem / RH",
  interview: "Entrevista",
  technical_test: "Teste técnico",
  offer: "Proposta recebida",
  rejected_company: "Recusada pela empresa",
  withdrawn: "Desisti da vaga",
};

export const stageOrder: StageKey[] = [
  "none",
  "confirmed",
  "screening",
  "interview",
  "technical_test",
  "offer",
  "rejected_company",
  "withdrawn",
];

export const sourceNames: Record<string, string> = {
  sandbox: "Demonstração",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  url_import: "Importada (URL)",
  manual: "Manual",
};

export const modeNames: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
  any: "Qualquer",
  not_specified: "Não informado",
};

export const eventLabels: Record<string, string> = {
  created: "Candidatura criada",
  prepared: "Respostas e carta preparadas pela IA",
  preparation_failed: "Falha na preparação pela IA",
  approved: "Respostas aprovadas por você",
  rejected: "Candidatura descartada",
  retried: "Reprocessamento solicitado",
  question_added: "Nova pergunta da vaga respondida",
  sandbox_submit_requested: "Envio automatizado (sandbox) iniciado",
  sandbox_submitted: "Enviada no sandbox com recibo e screenshot",
  sandbox_failed: "Falha no envio sandbox",
  submission_uncertain: "Status de envio incerto — verificar recibo",
  user_reported_submission: "Envio manual registrado",
  tracking_updated: "Acompanhamento atualizado",
};

export function shorten(s: string, length = 130): string {
  return s?.length > length ? s.slice(0, length) + "…" : s || "";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((x) => x.startsWith("csrf_token="))
      ?.split("=")
      .slice(1)
      .join("=") || ""
  );
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(opts.headers || {});
  if (mutating && !path.startsWith("/auth/login") && !path.startsWith("/auth/register")) {
    headers.set("x-csrf-token", csrfToken());
  }
  if (opts.body && typeof opts.body === "string") {
    headers.set("content-type", "application/json");
  }
  const response = await fetch("/api/v1" + path, {
    ...opts,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "Erro " + response.status;
    try {
      const data = await response.json();
      message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* no body */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
