.PHONY: scaffold install clean

scaffold:
	@bash scaffold.sh

install:
	@echo "→ Installing dependencies..."
	pnpm install
	@echo "✓ Done. Run: pnpm dev"

clean:
	@echo "→ Removing scaffold..."
	rm -rf src static dist examples docs
	rm -f package.json tsconfig.json .env.example .gitignore
	@echo "✓ Cleaned"