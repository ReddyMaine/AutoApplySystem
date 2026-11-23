.PHONY: up demo logs down test
up:
	docker compose up --build -d

demo:
	docker compose --profile browser up --build -d

logs:
	docker compose logs -f api worker web

down:
	docker compose --profile browser down

test:
	cd backend && python -m pytest -q
