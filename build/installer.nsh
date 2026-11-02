!macro customUnInstall
  ${IfNot} ${isUpdated}
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TextHop"
    ${If} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'
    ${OrIf} $R0 == '$INSTDIR\${APP_EXECUTABLE_FILENAME} --autostart'
    ${OrIf} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--autostart"'
    ${OrIf} $R0 == '$INSTDIR\${APP_EXECUTABLE_FILENAME} "--autostart"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TextHop"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "TextHop"
    ${EndIf}
  ${EndIf}
!macroend
