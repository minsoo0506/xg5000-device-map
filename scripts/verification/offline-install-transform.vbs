Option Explicit

If WScript.Arguments.Count <> 3 Then
    WScript.Echo "Usage: offline-install-transform.vbs original.msi working.msi offline.mst"
    WScript.Quit 2
End If

Const DriverAction = "_9C80134A_8C51_4D58_8690_ED1E0C1D717D"
Const ReadOnlyMode = 0
Const TransactionMode = 1

Dim installer, source, database, view, action, transform, driverFile
Set installer = CreateObject("WindowsInstaller.Installer")
Set source = installer.OpenDatabase(WScript.Arguments(0), ReadOnlyMode)
Set database = installer.OpenDatabase(WScript.Arguments(1), TransactionMode)

' The pinned package stalled in the optional MicroEdge x64 USB driver installer.
' Validate the action before excluding it from this offline project creation run.
Set view = database.OpenView("SELECT `Type`, `Source` FROM `CustomAction` WHERE `Action` = '" & DriverAction & "'")
view.Execute
Set action = view.Fetch
If action Is Nothing Then
    WScript.Echo "Expected MicroEdge driver action was not found."
    WScript.Quit 3
End If
If action.IntegerData(1) <> 3090 Then
    WScript.Echo "The expected MicroEdge driver action has changed."
    WScript.Quit 4
End If
driverFile = Replace(action.StringData(2), "'", "''")
view.Close

Set view = database.OpenView("SELECT `FileName` FROM `File` WHERE `File` = '" & driverFile & "'")
view.Execute
Set action = view.Fetch
If action Is Nothing Then
    WScript.Echo "The expected driver file was not found."
    WScript.Quit 4
End If
If InStr(1, action.StringData(1), "EtosUsbUmdf.exe", vbTextCompare) = 0 Then
    WScript.Echo "The custom action points to an unexpected executable."
    WScript.Quit 4
End If
view.Close

Set view = database.OpenView("UPDATE `InstallExecuteSequence` SET `Condition` = '1=0' WHERE `Action` = '" & DriverAction & "'")
view.Execute
view.Close
database.Commit

transform = WScript.Arguments(2)
If Not database.GenerateTransform(source, transform) Then
    WScript.Echo "No offline installation transform was generated."
    WScript.Quit 5
End If
database.CreateTransformSummaryInfo source, transform, 0, 0
