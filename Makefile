.PHONY: all dev start build preview test test-cov lint lint-fix format ip-check provenance check presubmit clean

BIOME ?= $(shell command -v biome 2>/dev/null || echo /media/efaj/data/workspace/crenet/OrthoRig/node_modules/.bin/biome)

all: check

dev:
	npm run dev

start:
	npm start

build:
	npm run build

preview: build
	npm run preview

test:
	npm test

test-cov:
	mkdir -p coverage
	npm run test:coverage

lint:
	@if [ -x "$(BIOME)" ]; then "$(BIOME)" check .; else echo "Biome CLI not found; skipping Biome check (run CI or install @biomejs/biome)."; fi

lint-fix:
	@if [ -x "$(BIOME)" ]; then "$(BIOME)" check --write .; else echo "Biome CLI not found."; exit 1; fi

format:
	@if [ -x "$(BIOME)" ]; then "$(BIOME)" format --write .; else echo "Biome CLI not found."; exit 1; fi

ip-check:
	npm run ip:check

provenance:
	python3 governance/scripts/ledger.py verify

presubmit: ip-check lint test build

check: presubmit

clean:
	rm -rf dist coverage test-results
