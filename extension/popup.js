const $ = (id) => document.getElementById(id);

let state = {
  user: null,
  profile: null,
  resumes: [],
  applications: [],
  pageJob: null,
  linkedApp: null,
  tabId: null,
  lastAiAnswer: "",
};

function showAlert(msg, type = "success") {
  const el = $("alert");
  el.textContent = msg;
  el.className = `alert ${type}`;
}

function clearAlert() {
  $("alert").className = "alert hidden";
}

function bg(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp || !resp.ok) {
        reject(new Error(resp?.error || "Falha de comunicação com a API local"));
        return;
      }
      resolve(resp);
    });
  });
}

async function api(path, opts = {}) {
  const res = await bg({ type: "API_REQUEST", path, opts });
  return res.data;
}

async function ensureContentScript(tabId, allFrames = false) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    files: ["content.js"],
  });
}

async function runInFrames(tabId, action, payload = null, allFrames = true) {
  await ensureContentScript(tabId, allFrames);
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    func: (act, data) => {
      try {
        return window.__AUTOAPPLY_COPILOT_API__?.[act]?.(data) ?? null;
      } catch {
        return null;
      }
    },
    args: [action, payload],
  });
  return (results || []).map((r) => r.result).filter(Boolean);
}

async function sendToTab(tabId, message) {
  if (message.type === "EXTRACT_JOB") {
    const res = await runInFrames(tabId, "extractJob", null, false);
    return { ok: true, job: res[0] || null };
  }
  if (message.type === "FILL_FORM") {
    const frameResults = await runInFrames(tabId, "fillForm", message.payload || {}, true);
    const mergedFields = [];
    let filledCount = 0;
    let skippedCount = 0;
    let resumeAttached = false;
    for (const r of frameResults) {
      filledCount += r.filledCount || 0;
      skippedCount += r.skippedCount || 0;
      if (r.resumeAttached) resumeAttached = true;
      for (const f of r.filledFields || []) {
        if (!mergedFields.includes(f)) mergedFields.push(f);
      }
    }
    const toastMsg =
      filledCount > 0
        ? `AutoApply preencheu ${filledCount} campo(s): ${mergedFields.slice(0, 7).join(", ")}. Revise antes de enviar.`
        : "Nenhum campo vazio reconhecido nesta página. Role até o formulário ou use a cópia rápida.";
    await runInFrames(tabId, "showToast", toastMsg, false).catch(() => {});
    return { ok: true, result: { filledCount, filledFields: mergedFields, resumeAttached, skippedCount } };
  }
  if (message.type === "INSERT_TEXT") {
    const frameResults = await runInFrames(tabId, "insertText", message.text || "", true);
    const inserted = frameResults.some((r) => r.inserted);
    return { ok: true, result: { inserted } };
  }
  await ensureContentScript(tabId, false);
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Não foi possível acessar esta aba (páginas internas do Chrome não são suportadas)."));
        return;
      }
      resolve(resp);
    });
  });
}

function normalizeUrl(u) {
  try {
    const parsed = new URL(u);
    return (parsed.origin + parsed.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return (u || "").toLowerCase();
  }
}

function findLinkedApplication(pageJob, applications) {
  if (!pageJob || !applications?.length) return null;
  const current = normalizeUrl(pageJob.url);
  const byUrl = applications.find((a) => a.job?.url && normalizeUrl(a.job.url) === current);
  if (byUrl) return byUrl;
  const pTitle = (pageJob.title || "").toLowerCase();
  const pComp = (pageJob.company || "").toLowerCase();
  return (
    applications.find(
      (a) =>
        a.job?.title &&
        a.job?.company &&
        pTitle.includes(a.job.title.toLowerCase()) &&
        pComp.includes(a.job.company.toLowerCase())
    ) || null
  );
}

const statusLabels = {
  processing: "Preparando IA",
  awaiting_approval: "Aguardando revisão",
  ready: "Aprovada",
  rejected: "Descartada",
  submitted: "Enviada",
  reported_submitted: "Envio registrado",
  failed: "Falhou",
};

function renderCopyChips() {
  const container = $("copy-chips");
  container.innerHTML = "";
  const p = state.profile || {};
  const app = state.linkedApp;
  const items = [
    ["Nome", p.name],
    ["E-mail", state.user?.email],
    ["Telefone", p.phone],
    ["Local", p.location],
    ["LinkedIn", p.linkedin_url],
    ["GitHub", p.github_url],
    ["Portfólio", p.portfolio_url],
    ["Resumo", p.summary],
    ["Carta", app?.cover_letter],
    ...(app?.answers || []).map((a, i) => [`Resposta ${i + 1}`, a.answer]),
  ].filter(([, val]) => val && String(val).trim());

  if (!items.length) {
    container.innerHTML = '<span class="muted small">Complete seu perfil no painel para ativar a cópia rápida.</span>';
    return;
  }

  for (const [label, value] of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(String(value));
      btn.textContent = `✓ ${label}`;
      setTimeout(() => {
        btn.textContent = label;
      }, 1400);
    });
    container.appendChild(btn);
  }
}

function renderAppView() {
  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("logout-btn").classList.remove("hidden");

  const job = state.pageJob;
  $("page-title").textContent = job?.title || "Página atual";
  $("page-company").textContent = job ? `${job.company} · ${job.location}` : "";

  const latestResume = state.resumes.find((r) => r.status === "processed");
  $("resume-status").textContent = latestResume
    ? `📄 Currículo pronto para anexo: ${latestResume.filename}`
    : "⚠️ Nenhum currículo processado ainda (envie no painel).";

  const app = state.linkedApp;
  if (app) {
    $("linked-box").classList.remove("hidden");
    $("app-status-badge").textContent = statusLabels[app.status] || app.status;
    if (app.score != null) {
      $("match-badge").textContent = `Match ${Math.round(app.score)}%`;
      $("match-badge").classList.remove("hidden");
    } else {
      $("match-badge").classList.add("hidden");
    }
    if (app.status === "ready" || app.status === "unknown") {
      $("mark-sent-box").classList.remove("hidden");
    } else {
      $("mark-sent-box").classList.add("hidden");
    }
    $("import-btn").textContent = "↻ Atualizar dados do painel";
  } else {
    $("linked-box").classList.add("hidden");
    $("match-badge").classList.add("hidden");
    $("import-btn").textContent = "+ Importar esta vaga e preparar com IA";
  }

  renderCopyChips();
}

async function loadSessionAndData() {
  clearAlert();
  const stored = await chrome.storage.local.get(["apiBase", "token", "user"]);
  if (stored.apiBase) $("api-base").value = stored.apiBase;

  if (!stored.token) {
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
    $("logout-btn").classList.add("hidden");
    return;
  }

  try {
    const [me, profile, resumes, applications] = await Promise.all([
      api("/auth/me"),
      api("/profile"),
      api("/resumes"),
      api("/applications"),
    ]);
    state.user = me;
    state.profile = profile;
    state.resumes = resumes;
    state.applications = applications;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab?.id || null;
    if (state.tabId && tab?.url && /^https?:\/\//i.test(tab.url)) {
      try {
        const extracted = await sendToTab(state.tabId, { type: "EXTRACT_JOB" });
        state.pageJob = extracted?.job || null;
      } catch {
        state.pageJob = { title: tab.title || "Página atual", company: "", location: "", url: tab.url };
      }
    }
    state.linkedApp = findLinkedApplication(state.pageJob, state.applications);
    renderAppView();
  } catch (err) {
    if (String(err.message).includes("401") || String(err.message).includes("Sessão")) {
      await chrome.storage.local.remove(["token", "user"]);
      $("login-view").classList.remove("hidden");
      $("app-view").classList.add("hidden");
      $("logout-btn").classList.add("hidden");
      showAlert("Sessão expirada. Faça login novamente.", "error");
    } else {
      $("login-view").classList.remove("hidden");
      $("app-view").classList.add("hidden");
      showAlert(`Não conectou ao AutoApply local: ${err.message}`, "error");
    }
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert();
  const btn = $("login-submit");
  btn.disabled = true;
  btn.textContent = "Conectando...";
  try {
    const apiBase = $("api-base").value.trim().replace(/\/+$/, "");
    await chrome.storage.local.set({ apiBase });
    const data = await api("/auth/token", {
      method: "POST",
      body: JSON.stringify({
        email: $("email").value.trim(),
        password: $("password").value,
      }),
    });
    await chrome.storage.local.set({ token: data.access_token, user: data.user });
    await loadSessionAndData();
    showAlert("Conectado ao AutoApply local!");
  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Conectar";
  }
});

$("logout-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "user"]);
  state.user = null;
  await loadSessionAndData();
});

$("fill-btn").addEventListener("click", async () => {
  clearAlert();
  if (!state.tabId) {
    showAlert("Abra uma aba de vaga (http/https) para preencher.", "error");
    return;
  }
  const btn = $("fill-btn");
  btn.disabled = true;
  btn.textContent = "Preenchendo...";
  try {
    const app = state.linkedApp;
    const preferredResume =
      state.resumes.find((r) => r.id === app?.resume_id && r.status === "processed") ||
      state.resumes.find((r) => r.status === "processed");

    let resumeFile = null;
    if (preferredResume) {
      const dl = await bg({ type: "DOWNLOAD_RESUME", resumeId: preferredResume.id });
      if (dl.file) {
        resumeFile = { ...dl.file, filename: preferredResume.filename };
      }
    }

    const resp = await sendToTab(state.tabId, {
      type: "FILL_FORM",
      payload: {
        profile: state.profile,
        email: state.user?.email || "",
        answers: app?.answers || [],
        coverLetter: app?.cover_letter || "",
        resumeFile,
      },
    });
    const r = resp?.result || {};
    if (r.filledCount > 0) {
      showAlert(
        `Preenchido (${r.filledCount}): ${(r.filledFields || []).join(", ")}. Confira na página e clique em Enviar!`
      );
    } else {
      showAlert("Nenhum campo vazio encontrado nesta tela. Abra o formulário de candidatura e tente de novo.", "error");
    }
  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ Preencher formulário agora";
  }
});

$("import-btn").addEventListener("click", async () => {
  clearAlert();
  if (state.linkedApp) {
    await loadSessionAndData();
    showAlert("Dados sincronizados com o painel!");
    return;
  }
  if (!state.pageJob) {
    showAlert("Não foi possível ler os dados desta página.", "error");
    return;
  }
  const btn = $("import-btn");
  btn.disabled = true;
  btn.textContent = "Importando e iniciando IA...";
  try {
    const job = await api("/jobs/manual", {
      method: "POST",
      body: JSON.stringify({
        title: state.pageJob.title,
        company: state.pageJob.company,
        location: state.pageJob.location || "Não informado",
        modality: state.pageJob.modality || "not_specified",
        url: state.pageJob.url,
        description: state.pageJob.description || "",
      }),
    });
    const latestResume = state.resumes.find((r) => r.status === "processed");
    await api("/applications", {
      method: "POST",
      body: JSON.stringify({
        job_id: job.id,
        resume_id: latestResume?.id || null,
        generate_cover_letter: true,
      }),
    });
    await loadSessionAndData();
    showAlert("Vaga importada! A IA está gerando respostas e carta — revise no painel em instantes.");
  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

$("ask-ai-btn").addEventListener("click", async () => {
  clearAlert();
  const q = $("custom-question").value.trim();
  if (!q || !state.linkedApp) return;
  const btn = $("ask-ai-btn");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const updated = await api(`/applications/${state.linkedApp.id}/questions`, {
      method: "POST",
      body: JSON.stringify({ question: q }),
    });
    state.linkedApp = updated;
    const last = updated.answers?.[updated.answers.length - 1];
    state.lastAiAnswer = last?.answer || "";
    $("ai-answer-text").textContent = state.lastAiAnswer;
    $("ai-answer-preview").classList.remove("hidden");
    $("custom-question").value = "";
    renderCopyChips();
    showAlert("Resposta gerada com base no seu perfil!");
  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "IA";
  }
});

$("copy-ai-btn").addEventListener("click", async () => {
  if (!state.lastAiAnswer) return;
  await navigator.clipboard.writeText(state.lastAiAnswer);
  showAlert("Resposta copiada!");
});

$("insert-ai-btn").addEventListener("click", async () => {
  if (!state.lastAiAnswer || !state.tabId) return;
  try {
    const resp = await sendToTab(state.tabId, { type: "INSERT_TEXT", text: state.lastAiAnswer });
    if (resp?.result?.inserted) {
      showAlert("Resposta inserida no campo selecionado!");
    } else {
      showAlert("Clique em um campo de texto da página antes de inserir.", "error");
    }
  } catch (err) {
    showAlert(err.message, "error");
  }
});

$("mark-sent-btn").addEventListener("click", async () => {
  clearAlert();
  if (!state.linkedApp) return;
  const btn = $("mark-sent-btn");
  btn.disabled = true;
  try {
    await api(`/applications/${state.linkedApp.id}/mark-manual`, {
      method: "POST",
      body: JSON.stringify({
        receipt: $("receipt-input").value.trim() || null,
        notes: "Enviada com auxílio da extensão AutoApply Copiloto",
      }),
    });
    await loadSessionAndData();
    showAlert("Envio registrado no painel com sucesso!");
  } catch (err) {
    showAlert(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

loadSessionAndData();
