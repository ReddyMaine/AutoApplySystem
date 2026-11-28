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

  function splitIdentifiers(text) {
    return String(text || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_./\\-]+/g, " ");
  }

  function normalize(text) {
    return splitIdentifiers(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9+#@\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return new Set(
      normalize(text)
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );
  }

  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    // Modern ATS forms (React Dropzone, AntD, Greenhouse, Lever, Gupy, Shopee)
    // almost always hide <input type="file"> with display:none or opacity:0.
    if (el.tagName === "INPUT" && (el.type || "").toLowerCase() === "file") {
      return !el.disabled;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectElements(root = document, out = []) {
    const nodes = root.querySelectorAll(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
    );
    nodes.forEach((el) => out.push(el));
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) collectElements(el.shadowRoot, out);
    });
    return out;
  }

  function countTextControls(container) {
    return container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select, [contenteditable="true"]'
    ).length;
  }

  function extractShortText(node) {
    if (!node) return "";
    const txt = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    return txt.length > 0 && txt.length <= 220 ? txt : "";
  }

  function getFieldLabel(el) {
    const parts = [];
    const push = (v) => {
      if (v && String(v).trim()) parts.push(String(v).trim());
    };

    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) push(extractShortText(lbl));
      } catch {
        /* ignore invalid selector */
      }
    }

    const parentLabel = el.closest("label");
    if (parentLabel) push(extractShortText(parentLabel));

    push(el.getAttribute("aria-label"));
    push(el.getAttribute("placeholder"));
    push(el.getAttribute("title"));
    push(el.getAttribute("name"));
    push(el.getAttribute("id"));
    push(el.getAttribute("autocomplete"));
    push(el.getAttribute("data-testid"));
    push(el.getAttribute("data-field"));
    push(el.getAttribute("data-qa"));
    push(el.getAttribute("data-automation-id"));

    for (const attr of ["aria-labelledby", "aria-describedby"]) {
      const refIds = el.getAttribute(attr);
      if (refIds) {
        refIds.split(/\s+/).forEach((id) => {
          const ref = document.getElementById(id);
          if (ref) push(extractShortText(ref));
        });
      }
    }

    // Walk up up to 4 ancestor containers (Ant Design, MUI, Chakra, Tailwind, Workday, Gupy, Ashby)
    // stopping once a container holds multiple input controls.
    let current = el.parentElement;
    for (let depth = 0; depth < 4 && current && current !== document.body; depth++) {
      if (current.tagName === "FORM") break;
      const controlCount = countTextControls(current);
      if (controlCount > 1 && !(el.tagName === "INPUT" && el.type === "file")) {
        // Still inspect an immediate preceding sibling heading/label if present
        const prev = current.previousElementSibling;
        if (prev && countTextControls(prev) === 0) {
          push(extractShortText(prev));
        }
        break;
      }

      const labelNodes = current.querySelectorAll(
        'label, legend, h3, h4, h5, [data-automation-id="formLabel"], .ant-form-item-label, .MuiFormLabel-root, [class*="label" i], [class*="Label"]'
      );
      labelNodes.forEach((node) => {
        if (node !== el && !node.contains(el)) {
          push(extractShortText(node));
        }
      });

      const prevSib = current.previousElementSibling;
      if (prevSib && countTextControls(prevSib) === 0) {
        push(extractShortText(prevSib));
      }

      if (parts.length >= 2 && labelNodes.length > 0) break;
      current = current.parentElement;
    }

    // Also check direct previous sibling of the element itself
    if (el.previousElementSibling && countTextControls(el.previousElementSibling) === 0) {
      push(extractShortText(el.previousElementSibling));
    }

    return normalize(parts.join(" "));
  }

  function setNativeValue(el, value) {
    try {
      el.focus();
    } catch {
      /* ignore focus error */
    }

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

    try {
      el.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })
      );
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    el.style.outline = "2px solid #0bb58b";
    el.style.outlineOffset = "1px";
    el.style.backgroundColor = "#f0fdf7";
  }

  function tryFillSelect(selectEl, label, profile, locParts) {
    const options = Array.from(selectEl.options || []).filter((o) => !o.disabled && o.value !== "");
    if (!options.length) return "";
    // Skip if user already picked a non-placeholder option
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    if (
      selectedOpt &&
      selectedOpt.value &&
      !/select|selecion|escolh|choose|--/.test(normalize(selectedOpt.textContent))
    ) {
      return "";
    }

    const pickOption = (candidates) => {
      const normCandidates = candidates.map((c) => normalize(c)).filter(Boolean);
      if (!normCandidates.length) return null;
      for (const c of normCandidates) {
        const exact = options.find(
          (o) => normalize(o.textContent) === c || normalize(o.value) === c
        );
        if (exact) return exact;
      }
      for (const c of normCandidates) {
        if (c.length < 3) continue;
        const partial = options.find(
          (o) => normalize(o.textContent).includes(c) || c.includes(normalize(o.textContent))
        );
        if (partial && normalize(partial.textContent).length >= 3) return partial;
      }
      return null;
    };

    let matched = null;
    let tag = "";

    if (/\b(country|pais)\b/.test(label)) {
      matched = pickOption([locParts.country, "Brazil", "Brasil", "BR"]);
      tag = "País";
    } else if (/\b(state|estado|uf|region|provincia)\b/.test(label)) {
      matched = pickOption([locParts.state]);
      tag = "Estado";
    } else if (/\b(city|cidade)\b/.test(label)) {
      matched = pickOption([locParts.city]);
      tag = "Cidade";
    } else if (/\b(modality|modalidade|work.?mode|remote|remoto|workplace)\b/.test(label)) {
      const map = {
        remote: ["remote", "remoto", "home office"],
        hybrid: ["hybrid", "hibrido"],
        onsite: ["onsite", "on site", "presencial"],
      };
      matched = pickOption(map[profile.modality] || []);
      tag = "Modalidade";
    } else if (/\b(seniority|senioridade|level|nivel|experience.?level)\b/.test(label)) {
      matched = pickOption([profile.seniority]);
      tag = "Senioridade";
    }

    if (!matched) return "";
    selectEl.value = matched.value;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    selectEl.dispatchEvent(new Event("blur", { bubbles: true }));
    selectEl.style.outline = "2px solid #0bb58b";
    selectEl.style.outlineOffset = "1px";
    return tag;
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

  function parseLocation(locationStr) {
    const raw = String(locationStr || "").trim();
    if (!raw) return { full: "", city: "", state: "", country: "" };
    const parts = raw
      .split(/[,/\-|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const city = parts[0] || raw;
    const state = parts.length >= 2 ? parts[1] : "";
    let country = parts.length >= 3 ? parts[2] : "";
    if (!country && /\b(sp|rj|mg|rs|pr|sc|ba|ce|pe|df|go|es|brasil|brazil)\b/i.test(raw)) {
      country = "Brasil";
    }
    return { full: raw, city, state, country };
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
    if (window !== window.top) return;
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
      maxWidth: "380px",
      lineHeight: "1.45",
    });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 6000);
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
    const locParts = parseLocation(profile.location);
    const latestExp = Array.isArray(profile.experiences) ? profile.experiences[0] || {} : {};
    const latestEdu = Array.isArray(profile.education) ? profile.education[0] || {} : {};
    const skillsCsv = Array.isArray(profile.skills) ? profile.skills.filter(Boolean).join(", ") : "";

    const elements = collectElements(document);
    const filledFields = [];
    const skippedLabels = [];
    let resumeAttached = false;
    let usedCover = false;

    for (const el of elements) {
      if (!isVisible(el)) continue;

      if (el.tagName === "INPUT" && (el.type || "").toLowerCase() === "file") {
        const lbl = getFieldLabel(el);
        const accept = (el.accept || "").toLowerCase();
        const looksLikeImageOnly = /^image\//.test(accept) && !/pdf|doc|msword|wordprocessing/.test(accept);
        const looksLikePhoto = /\b(photo|foto|avatar|picture|imagem|selfie)\b/.test(lbl);
        const looksLikeResume =
          !looksLikeImageOnly &&
          !looksLikePhoto &&
          (!lbl ||
            /curricul|resume|cv|anexo|document|file|upload|attach|arquivo|drag|drop|arraste/.test(lbl) ||
            /pdf|doc/.test(accept));
        if (looksLikeResume && resumeFile && !resumeAttached) {
          if (attachFileToInput(el, resumeFile)) {
            resumeAttached = true;
            filledFields.push("Currículo anexado");
          }
        }
        continue;
      }

      if (el.tagName === "SELECT") {
        const lbl = getFieldLabel(el);
        const selectTag = tryFillSelect(el, lbl, profile, locParts);
        if (selectTag) filledFields.push(selectTag);
        continue;
      }

      const isCE = el.isContentEditable && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA";
      const type = (el.type || "text").toLowerCase();
      if (
        !isCE &&
        ["hidden", "submit", "button", "checkbox", "radio", "password", "search", "date", "month"].includes(
          type
        )
      ) {
        continue;
      }

      // Skip already-filled fields so we don't overwrite manual user edits
      const currentValue = isCE ? el.textContent || "" : el.value || "";
      if (currentValue.trim().length > 0) continue;

      const label = getFieldLabel(el);
      let val = "";
      let fieldTag = "";

      if (el.tagName === "TEXTAREA" || isCE) {
        const matchedAnswer = matchAnswerForTextarea(label, answers);
        if (matchedAnswer) {
          val = matchedAnswer;
          fieldTag = "Resposta IA";
        } else if (/\b(skills|habilidades|competencias|technologies|stack)\b/.test(label) && skillsCsv) {
          val = skillsCsv;
          fieldTag = "Habilidades";
        } else if (
          /\b(carta|cover|motivac|why|por que|sobre voce|about you|about yourself|tell us|apresentac|resumo|summary|bio|mensagem|message|additional|comments|observac|notes|descricao)\b/.test(
            label
          )
        ) {
          val = coverLetter || profile.summary || answers[0]?.answer || "";
          fieldTag = "Carta / Resumo";
          usedCover = true;
        } else if (!usedCover && (coverLetter || answers[0]?.answer || profile.summary)) {
          val = coverLetter || answers[0]?.answer || profile.summary;
          fieldTag = "Texto complementar";
          usedCover = true;
        }
      } else {
        if (type === "email" || /\b(e mail|email|correio)\b/.test(label)) {
          val = email;
          fieldTag = "E-mail";
        } else if (
          type === "tel" ||
          /\b(phone|telefone|celular|whatsapp|mobile|fone|tel|contact number|numero de contato)\b/.test(label)
        ) {
          val = profile.phone || "";
          fieldTag = "Telefone";
        } else if (/linkedin/.test(label)) {
          val = profile.linkedin_url || "";
          fieldTag = "LinkedIn";
        } else if (/github|git hub/.test(label)) {
          val = profile.github_url || "";
          fieldTag = "GitHub";
        } else if (
          /\b(portfolio|portifolio|website|web site|site pessoal|personal url|personal site|blog|homepage)\b/.test(
            label
          )
        ) {
          val = profile.portfolio_url || profile.github_url || "";
          fieldTag = "Portfólio";
        } else if (/\b(first name|primeiro nome|given name|fname|forename|preferred name)\b/.test(label)) {
          val = firstName;
          fieldTag = "Primeiro nome";
        } else if (/\b(last name|sobrenome|family name|surname|lname)\b/.test(label)) {
          val = lastName;
          fieldTag = "Sobrenome";
        } else if (
          /\b(full name|nome completo|your name|seu nome|candidate name|applicant name|legal name|name|nome)\b/.test(
            label
          ) &&
          !/\b(company|empresa|employer|org|organization|user|username|login|school|university|faculdade|instituicao|degree|curso|referr|project|projeto|file|resume|curriculo|city|cidade|country|pais|state|estado)\b/.test(
            label
          )
        ) {
          val = fullName;
          fieldTag = "Nome";
        } else if (/\b(current company|empresa atual|company|empresa|employer|organizacao)\b/.test(label)) {
          val = latestExp.company || "";
          fieldTag = "Empresa atual";
        } else if (
          /\b(current title|job title|current role|current position|headline|cargo|role|posicao|position|funcao|profissao|titulo)\b/.test(
            label
          )
        ) {
          val = profile.title || latestExp.role || "";
          fieldTag = "Cargo";
        } else if (/\b(school|university|universidade|faculdade|instituicao|college)\b/.test(label)) {
          val = latestEdu.institution || "";
          fieldTag = "Instituição";
        } else if (/\b(degree|formacao|curso|major|graduacao|diploma)\b/.test(label)) {
          val = latestEdu.degree || "";
          fieldTag = "Formação";
        } else if (/\b(skills|habilidades|competencias|technologies|stack)\b/.test(label)) {
          val = skillsCsv;
          fieldTag = "Habilidades";
        } else if (/\b(country|pais)\b/.test(label)) {
          val = locParts.country || "";
          fieldTag = "País";
        } else if (/\b(state|estado|uf|province|region)\b/.test(label)) {
          val = locParts.state || "";
          fieldTag = "Estado";
        } else if (/\b(city|cidade)\b/.test(label)) {
          val = locParts.city || "";
          fieldTag = "Cidade";
        } else if (/\b(location|localizac|local|endereco|address|onde mora|residencia)\b/.test(label)) {
          val = locParts.full || "";
          fieldTag = "Localização";
        } else if (/\b(salary|salario|pretensao|remunerac|compensation|expected pay|pay expectation)\b/.test(label)) {
          val = salary ? String(salary) : "";
          fieldTag = "Pretensão salarial";
        } else if (type === "url" && !label) {
          val = profile.linkedin_url || profile.portfolio_url || profile.github_url || "";
          fieldTag = "Link profissional";
        }
      }

      if (val && String(val).trim()) {
        setNativeValue(el, String(val).trim());
        filledFields.push(fieldTag);
      } else if (label) {
        skippedLabels.push(label.slice(0, 48));
      }
    }

    return {
      filledCount: filledFields.length,
      filledFields: [...new Set(filledFields)],
      resumeAttached,
      skippedCount: skippedLabels.length,
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
      const hostParts = window.location.hostname
        .replace(/^www\./, "")
        .split(".")
        .filter((p) => !["careers", "jobs", "talent", "apply", "boards", "hire", "work", "recruiting"].includes(p.toLowerCase()));
      company =
        pick([
          ".job-details-jobs-unified-top-card__company-name",
          ".topcard__org-name-link",
          "[data-testid='company-name']",
          ".company-name",
        ]) ||
        document.querySelector('meta[property="og:site_name"]')?.content ||
        hostParts[0] ||
        "Empresa";
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
    const target = lastFocusedEditable || document.activeElement;
    if (
      target &&
      (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
    ) {
      setNativeValue(target, text);
      target.focus();
      showToast("Resposta inserida no campo selecionado.");
      return { inserted: true };
    }
    return { inserted: false };
  }

  window.__AUTOAPPLY_COPILOT_API__ = {
    extractJob: extractJobFromPage,
    fillForm,
    insertText: insertIntoFocused,
    showToast,
  };

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
