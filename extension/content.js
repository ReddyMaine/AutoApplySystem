(() => {
  if (window.__AUTOAPPLY_COPILOT_LOADED__) return;
  window.__AUTOAPPLY_COPILOT_LOADED__ = true;

  let lastFocusedEditable = null;
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (
        el &&
        (el.tagName === "TEXTAREA" ||
          (el.tagName === "INPUT" &&
            !["hidden", "submit", "button", "checkbox", "radio", "file"].includes(
              (el.type || "").toLowerCase()
            )) ||
          el.isContentEditable)
      ) {
        lastFocusedEditable = el;
      }
    },
    true
  );

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return new Set(
      normalize(text)
        .split(/[^a-z0-9+#]+/)
        .filter((w) => w.length >= 3)
    );
  }

  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    if (el.type === "file") return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectElements(root = document, out = []) {
    const nodes = root.querySelectorAll("input, textarea, select");
    nodes.forEach((el) => out.push(el));
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) collectElements(el.shadowRoot, out);
    });
    return out;
  }

  function getFieldLabel(el) {
    const parts = [];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const parentLabel = el.closest("label");
    if (parentLabel) parts.push(parentLabel.textContent);
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const ref = document.getElementById(id);
        if (ref) parts.push(ref.textContent);
      });
    }
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);
    if (el.autocomplete) parts.push(el.autocomplete);

    // Inspect closest container heading / label sibling (common in Workday, Gupy, Ashby, Lever)
    const wrapper = el.closest("div, fieldset, li, section, p");
    if (wrapper) {
      const siblingLabel = wrapper.querySelector("label, legend, h3, h4, [data-automation-id='formLabel']");
      if (siblingLabel && siblingLabel !== el) {
        parts.push(siblingLabel.textContent);
      }
    }
    return normalize(parts.join(" "));
  }

  function setNativeValue(el, value) {
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
    } else if (el.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
    } else if (el.isContentEditable) {
      el.textContent = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    el.style.outline = "2px solid #0bb58b";
    el.style.outlineOffset = "1px";
    el.style.backgroundColor = "#f0fdf7";
  }

  function attachFileToInput(input, fileInfo) {
    if (!fileInfo || !fileInfo.base64) return false;
    try {
      const raw = atob(fileInfo.base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const file = new File([bytes], fileInfo.filename || "curriculo.pdf", {
        type: fileInfo.contentType || "application/pdf",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function matchAnswerForTextarea(label, answers) {
    if (!answers || !answers.length) return "";
    const labelTokens = tokenize(label);
    let best = "";
    let bestScore = 0;
    for (const ans of answers) {
      if (!ans || !ans.answer) continue;
      const qTokens = tokenize(ans.question || "");
      let overlap = 0;
      qTokens.forEach((t) => {
        if (labelTokens.has(t)) overlap += 1;
      });
      if (overlap > bestScore) {
        bestScore = overlap;
        best = ans.answer;
      }
    }
    return bestScore >= 2 ? best : "";
  }

  function showToast(text, isError = false) {
    const existing = document.getElementById("autoapply-copilot-toast");
    if (existing) existing.remove();
    const div = document.createElement("div");
    div.id = "autoapply-copilot-toast";
    div.textContent = text;
    Object.assign(div.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      background: isError ? "#991b1b" : "#101b2c",
      color: "#ffffff",
      border: isError ? "1px solid #f87171" : "1px solid #0bb58b",
      borderRadius: "12px",
      padding: "12px 16px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
      maxWidth: "360px",
      lineHeight: "1.45",
    });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5500);
  }

  function fillForm(payload) {
    const profile = payload.profile || {};
    const email = payload.email || "";
    const answers = payload.answers || [];
    const coverLetter = payload.coverLetter || "";
    const resumeFile = payload.resumeFile || null;

    const fullName = (profile.name || "").trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    const salary = profile.desired_salary_min || profile.desired_salary_max || "";

    const elements = collectElements(document);
    const filledFields = [];
    let resumeAttached = false;
    let usedCover = false;

    for (const el of elements) {
      if (!isVisible(el)) continue;

      if (el.tagName === "INPUT" && (el.type || "").toLowerCase() === "file") {
        const lbl = getFieldLabel(el);
        const accept = (el.accept || "").toLowerCase();
        const looksLikeResume =
          !lbl ||
          /curricul|resume|cv|anexo|document|file|upload/.test(lbl) ||
          /pdf|doc/.test(accept);
        if (looksLikeResume && resumeFile && !resumeAttached) {
          if (attachFileToInput(el, resumeFile)) {
            resumeAttached = true;
            filledFields.push("Currículo anexado");
          }
        }
        continue;
      }

      if (el.tagName === "SELECT") continue;
      const type = (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "checkbox", "radio", "password", "search", "date"].includes(type)) {
        continue;
      }

      // Skip already-filled fields so we don't overwrite manual user edits
      if ((el.value || "").trim().length > 0) continue;

      const label = getFieldLabel(el);
      let val = "";
      let fieldTag = "";

      if (el.tagName === "TEXTAREA") {
        const matchedAnswer = matchAnswerForTextarea(label, answers);
        if (matchedAnswer) {
          val = matchedAnswer;
          fieldTag = "Resposta IA";
        } else if (
          /carta|cover|motivac|why|por que|sobre voce|about you|apresentac|resumo|summary|mensagem|message|additional/.test(
            label
          )
        ) {
          val = coverLetter || answers[0]?.answer || profile.summary || "";
          fieldTag = "Carta / Motivação";
          usedCover = true;
        } else if (!usedCover && (coverLetter || answers[0]?.answer)) {
          val = coverLetter || answers[0]?.answer;
          fieldTag = "Texto complementar";
          usedCover = true;
        }
      } else {
        if (type === "email" || /\b(e-?mail|correio)\b/.test(label)) {
          val = email;
          fieldTag = "E-mail";
        } else if (type === "tel" || /\b(phone|telefone|celular|whatsapp|mobile|fone)\b/.test(label)) {
          val = profile.phone || "";
          fieldTag = "Telefone";
        } else if (/linkedin/.test(label)) {
          val = profile.linkedin_url || "";
          fieldTag = "LinkedIn";
        } else if (/github/.test(label)) {
          val = profile.github_url || "";
          fieldTag = "GitHub";
        } else if (/portfolio|portifolio|website|site pessoal|personal url|blog/.test(label)) {
          val = profile.portfolio_url || profile.github_url || "";
          fieldTag = "Portfólio";
        } else if (/\b(first.?name|primeiro.?nome|given.?name)\b/.test(label)) {
          val = firstName;
          fieldTag = "Primeiro nome";
        } else if (/\b(last.?name|sobrenome|family.?name|surname)\b/.test(label)) {
          val = lastName;
          fieldTag = "Sobrenome";
        } else if (/\b(full.?name|nome.?completo|your.?name|seu.?nome|name|nome)\b/.test(label) && !/company|empresa|user/.test(label)) {
          val = fullName;
          fieldTag = "Nome";
        } else if (/\b(city|cidade|location|localizac|endereco|address|onde mora)\b/.test(label)) {
          val = profile.location || "";
          fieldTag = "Localização";
        } else if (/\b(current.?title|headline|cargo|role|posicao|titulo)\b/.test(label)) {
          val = profile.title || "";
          fieldTag = "Cargo";
        } else if (/\b(salary|salario|pretensao|remunerac|compensation)\b/.test(label)) {
          val = salary ? String(salary) : "";
          fieldTag = "Pretensão salarial";
        }
      }

      if (val && String(val).trim()) {
        setNativeValue(el, String(val).trim());
        filledFields.push(fieldTag);
      }
    }

    if (filledFields.length > 0) {
      showToast(
        `AutoApply preencheu ${filledFields.length} campo(s): ${[...new Set(filledFields)].slice(0, 6).join(", ")}. Revise antes de enviar.`
      );
    } else {
      showToast(
        "Nenhum campo vazio reconhecido nesta página. Role até o formulário ou use a aba de cópia rápida.",
        true
      );
    }

    return {
      filledCount: filledFields.length,
      filledFields: [...new Set(filledFields)],
      resumeAttached,
    };
  }

  function extractJobFromPage() {
    let title = "";
    let company = "";
    let location = "";
    let description = "";
    let modality = "not_specified";

    // 1. Try JSON-LD JobPosting
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || "");
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.["@graph"])
            ? parsed["@graph"]
            : [parsed];
        const jp = list.find((n) => {
          const t = n?.["@type"];
          return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
        });
        if (jp) {
          title = jp.title || title;
          company =
            (typeof jp.hiringOrganization === "object"
              ? jp.hiringOrganization?.name
              : jp.hiringOrganization) || company;
          const loc = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
          const addr = loc?.address;
          if (addr && typeof addr === "object") {
            location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
              .filter(Boolean)
              .join(", ");
          }
          if (String(jp.jobLocationType || "").toUpperCase() === "TELECOMMUTE") {
            modality = "remote";
          }
          if (jp.description) {
            const tmp = document.createElement("div");
            tmp.innerHTML = jp.description;
            description = (tmp.textContent || "").replace(/\s+/g, " ").trim();
          }
          break;
        }
      } catch {
        /* ignore invalid JSON-LD */
      }
    }

    // 2. Fallback to portal-specific / generic DOM selectors
    const pick = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const txt = el?.textContent?.replace(/\s+/g, " ").trim();
        if (txt) return txt;
      }
      return "";
    };

    if (!title) {
      title =
        pick([
          ".job-details-jobs-unified-top-card__job-title h1",
          ".top-card-layout__title",
          "[data-testid='job-title']",
          "h1",
        ]) ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.title;
    }

    if (!company) {
      company =
        pick([
          ".job-details-jobs-unified-top-card__company-name",
          ".topcard__org-name-link",
          "[data-testid='company-name']",
          ".company-name",
        ]) ||
        document.querySelector('meta[property="og:site_name"]')?.content ||
        window.location.hostname.replace(/^www\./, "").split(".")[0];
    }

    if (!location) {
      location =
        pick([
          ".job-details-jobs-unified-top-card__bullet",
          ".topcard__flavor--bullet",
          "[data-testid='job-location']",
          ".location",
        ]) || (modality === "remote" ? "Remoto" : "Não informado");
    }

    if (!description) {
      const container =
        document.querySelector(".jobs-description__content") ||
        document.querySelector(".description__text") ||
        document.querySelector("[data-testid='job-description']") ||
        document.querySelector("main") ||
        document.querySelector("article") ||
        document.body;
      description = (container?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 12000);
    }

    return {
      title: String(title || "Vaga sem título").slice(0, 280),
      company: String(company || "Empresa").slice(0, 180),
      location: String(location || "Não informado").slice(0, 180),
      modality,
      url: window.location.href,
      description: String(description || "").slice(0, 12000),
    };
  }

  function insertIntoFocused(text) {
    const target =
      lastFocusedEditable ||
      document.activeElement;
    if (
      target &&
      (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
    ) {
      setNativeValue(target, text);
      target.focus();
      showToast("Resposta inserida no campo selecionado.");
      return { inserted: true };
    }
    showToast("Clique primeiro em um campo de texto da página para inserir.", true);
    return { inserted: false };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXTRACT_JOB") {
      sendResponse({ ok: true, job: extractJobFromPage() });
      return;
    }
    if (message.type === "FILL_FORM") {
      const result = fillForm(message.payload || {});
      sendResponse({ ok: true, result });
      return;
    }
    if (message.type === "INSERT_TEXT") {
      const result = insertIntoFocused(message.text || "");
      sendResponse({ ok: true, result });
      return;
    }
  });
})();
