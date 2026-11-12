@echo off
rem mail - email-skill unified CLI. Works from any directory.
rem   mail send --to someone@example.com --subject "hi" --body "text"
rem   mail send --to someone@example.com --subject "hi" --body "text" --attach report.pdf
rem   mail read --folder "sent" --limit 10
rem   mail check
rem NOTE: keep this file ASCII-only. cmd.exe parses .cmd with the OEM code page (936 here).
setlocal
set PYTHONIOENCODING=utf-8
python "%~dp0mail.py" %*
