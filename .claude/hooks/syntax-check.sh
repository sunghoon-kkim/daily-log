#!/bin/bash
# PostToolUse 훅: js/*.js, Code.gs 수정 직후 문법 검사
# 빌드/린트 단계가 없어서 파일 하나의 문법 오류가 앱 전체를 멈추게 하므로, 수정 즉시 잡아냄
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input.file_path||"")}catch(e){}})')

case "$file" in
  *.js) target="$file" ;;
  *.gs)
    # node는 .gs 확장자를 모르므로 임시 .js로 복사해서 검사
    target="$(mktemp --suffix=.js)"
    cp "$file" "$target"
    trap 'rm -f "$target"' EXIT
    ;;
  *) exit 0 ;;
esac

[ -f "$target" ] || exit 0
if ! err=$(node --check "$target" 2>&1); then
  echo "문법 오류: $file" >&2
  echo "${err//$target/$file}" >&2
  exit 2
fi
exit 0
