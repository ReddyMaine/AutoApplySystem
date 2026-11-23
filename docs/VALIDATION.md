# Validação e limites do pacote gerado

## Checks executados durante a geração

- Parsing `ast` e `compileall` em todos os módulos Python do backend.
- Parsing de TS/TSX pelo compilador TypeScript 5.8.3 instalado no ambiente de geração.
- Parsing YAML do `docker-compose.yml` e JSON de `package.json` / `tsconfig.json`.
- `pytest` em `backend/tests/test_matching.py`: 3 testes aprovados.
- Smoke test de matching: perfil Python mais aderente a vaga Python que a vaga de design.

## Checks que dependem do seu ambiente

O ambiente de geração não disponibilizava o executável Docker, nem acesso ao índice de dependências Python/NPM. Por isso **não foi possível executar `docker compose up`, instalar as bibliotecas faltantes, fazer o build Next.js nem rodar todos os testes de integração aqui**.

No seu computador, execute os passos do README e depois:

```bash
docker compose ps
docker compose logs --tail=100 api worker web
curl http://localhost:8000/health
```

Para verificar o frontend e os testes antes de desenvolver novas features:

```bash
cd frontend && npm install && npm run lint && npm run build
cd ../backend && pip install -r requirements-dev.txt && pytest -q
```

Para o fluxo Playwright, inicie o profile `browser` e execute a candidatura numa vaga fictícia. Nenhuma submissão a um ATS real foi testada ou implementada.
