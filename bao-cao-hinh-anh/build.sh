#!/bin/sh
# Bien dich cac bieu do hoat dong .tex -> .pdf + .png (300 dpi). Chay trong container sn-texlive.
set -e
for f in ${1:-hd-*.tex}; do
  n=${f%.tex}
  lualatex -interaction=nonstopmode -halt-on-error "$f" >/dev/null || { grep -A3 "^!" "$n.log"; exit 1; }
  gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -sOutputFile="$n.png" "$n.pdf"
  rm -f "$n.log" "$n.aux"
  echo "ok $n"
done
