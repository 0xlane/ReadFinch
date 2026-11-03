!macro customUnInstall
  ${IfNot} ${isUpdated}
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ReadFinch"
    ${If} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'
    ${OrIf} $R0 == '$INSTDIR\${APP_EXECUTABLE_FILENAME} --autostart'
    ${OrIf} $R0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--autostart"'
    ${OrIf} $R0 == '$INSTDIR\${APP_EXECUTABLE_FILENAME} "--autostart"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ReadFinch"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ReadFinch"
    ${EndIf}
  ${EndIf}
!macroend
