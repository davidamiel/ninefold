#!/bin/bash
set -euo pipefail
kit_dir="$(dirname "$0")/Ninefold-Audio"
mkdir -p "$kit_dir"
cd "$kit_dir"
if ! command -v brew >/dev/null; then
  echo "Install Homebrew from https://brew.sh, then run this script again."; exit 1
fi
for file in narrate.py requirements.txt example.narration.json README.md; do
  curl -fL "https://raw.githubusercontent.com/davidamiel/ninefold/main/tools/mac-audio/$file" -o "$file"
done
brew install python@3.12 espeak-ng
"$(brew --prefix python@3.12)/bin/python3.12" -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python narrate.py example.narration.json --output "sample-$(date +%Y%m%d-%H%M%S)"
echo "Ready. Open $kit_dir and listen to the sample's document.wav."
