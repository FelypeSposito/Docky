; Docky's uninstaller hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).

; Before the files go: take Docky's hooks out of ~/.claude/settings.json, so Claude Code does not keep calling a
; server that no longer exists. Only on a real uninstall; an update keeps them.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-cleanup'
  ${EndIf}
!macroend
