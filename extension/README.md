# Extensão Chrome — AutoApply AI Copiloto

Extensão Manifest V3 que conecta o seu navegador (Chrome, Edge ou Brave) ao seu **AutoApply AI local** (`http://localhost:8000`).

## O que ela faz
- **Preenchimento inteligente (1 clique):** preenche nome, e-mail, telefone, localização, LinkedIn, GitHub, portfólio, pretensão salarial, carta de apresentação, respostas da IA e **anexa automaticamente seu currículo PDF/DOCX** em formulários de vagas (Greenhouse, Lever, Ashby, Workday, Gupy, LinkedIn etc.).
- **Importação direta da aba aberta:** importa vagas mesmo de portais que exigem login (lendo a página que você já abriu) e já dispara a preparação com IA no painel.
- **Perguntas extras na hora:** encontrou uma pergunta nova no formulário? Digite na extensão, gere a resposta fundamentada no seu perfil (RAG) e clique em **Inserir no campo**.
- **Registro imediato de envio:** após conferir, resolver eventuais CAPTCHAs e clicar em **Enviar** no portal oficial, clique em **✓ Enviei** na extensão para atualizar seu painel e timeline.

> **Segurança:** a extensão nunca clica em "Enviar" sozinha e não tenta burlar CAPTCHAs — você mantém 100% do controle.

## Como instalar no Chrome / Edge / Brave

1. Certifique-se de que o AutoApply está rodando (`docker compose --profile browser up -d`).
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta `extension` dentro deste projeto (`c:\Users\Junior\Documents\GitHub\AutoApplySystem\extension`).
6. Fixe o ícone **AutoApply AI Copiloto** na barra do navegador, clique nele e faça login com o e-mail e senha da sua conta local.
