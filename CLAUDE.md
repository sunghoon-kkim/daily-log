
## Git Push Rule
- When performing `git push`, always print the completion timestamp using `echo "✅ 깃허브 업로드 완료: $(date '+%H:%M:%S')"` and report the completion time in the final response.

## 상시 적용 규칙
- UI 작업 시에는 항상 frontend-design을 사용한다.
- 수정 후에는 항상 playwright로 화면 정상 표시 여부를 확인한다.
- 코드 수정 시 과도한 변경을 지양하고 보안 취약점을 상시 방지한다.
- 기능 구현이나 코드 수정 요청 시 즉시 코드를 고치지 말고, 부작용 검토나 더 나은 대안이 있다면 먼저 질의/제안하여 사용자의 확인을 받은 뒤 진행한다.
- 작업 완료 후 문법 검사(node --check)와 playwright 검증이 모두 정상 통과하면, 사용자 확인 없이 자동으로 커밋 및 푸시(git commit & push)까지 완료한다.
  - 순서: 제안 → 사용자 승인 → 수정 → 검증 통과 → 자동 커밋·푸시 ("고칠지"는 묻고, "올릴지"는 묻지 않는다)
  - 검증이 실패하면 커밋하지 않고 실패 내용을 보고한다.
  - playwright로 확인할 수 없는 변경(Code.gs, sw.js, 실제 로그인이 필요한 화면 등)은 문법 검사만 통과하면 커밋·푸시하고, 화면 확인을 생략했다고 보고에 명시한다.
