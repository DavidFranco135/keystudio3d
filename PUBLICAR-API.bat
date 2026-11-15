@echo off
setlocal
cd /d "%~dp0"
title KeyStudio3D - publicar API no Firebase
echo ============================================================
echo  KeyStudio3D - publicar a API no Firebase
echo ============================================================
echo.

rem Sempre usa a versao mais recente do codigo.zip desta pasta.
if exist codigo.zip (
  echo Atualizando o codigo do projeto...
  tar -xf codigo.zip
)
if not exist apps\api\main.py (
  echo [ERRO] Nao encontrei a pasta apps\api ao lado deste arquivo.
  goto :fim
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado. Instale em https://nodejs.org e rode este arquivo de novo.
  goto :fim
)

py -3.12 --version >nul 2>&1
if errorlevel 1 (
  echo [1/6] Instalando o Python 3.12...
  winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  echo.
  echo Python instalado. FECHE esta janela e abra este arquivo de novo para continuar.
  goto :fim
)
echo [1/6] Python 3.12 OK

where firebase >nul 2>&1
if errorlevel 1 (
  echo [2/6] Instalando a ferramenta do Firebase...
  call npm install -g firebase-tools
  if errorlevel 1 goto :erro
)
echo [2/6] Ferramenta do Firebase OK

echo [3/6] Preparando o ambiente da API (pode demorar alguns minutos na primeira vez)...
cd apps\api
if not exist venv\Scripts\python.exe (
  py -3.12 -m venv venv
  if errorlevel 1 goto :erro
)
call venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if errorlevel 1 goto :erro
cd ..\..

echo [4/6] Login no Firebase (abre o navegador; entre com a conta dona do projeto niklaus3d)...
call firebase login
if errorlevel 1 goto :erro

echo [5/6] Segredos da API...
call firebase functions:secrets:get JWT_SECRET --project niklaus3d >nul 2>&1
if errorlevel 1 (
  echo   Criando o JWT_SECRET automaticamente...
  python -c "import secrets,sys; sys.stdout.write(secrets.token_urlsafe(48))" > "%TEMP%\ks_jwt.txt"
  call firebase functions:secrets:set JWT_SECRET --project niklaus3d --data-file "%TEMP%\ks_jwt.txt"
  del "%TEMP%\ks_jwt.txt" >nul 2>&1
) else (
  echo   JWT_SECRET ja existe - mantido.
)
call firebase functions:secrets:get IMGBB_API_KEY --project niklaus3d >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Cole a chave da API do ImgBB e aperte Enter ^(o texto nao aparece na tela^):
  call firebase functions:secrets:set IMGBB_API_KEY --project niklaus3d
) else (
  echo   IMGBB_API_KEY ja existe - mantida.
)

echo [6/6] Publicando a API e as regras do banco...
call firebase deploy --only functions,firestore --project niklaus3d
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo  PRONTO. A API da KeyStudio3D foi atualizada.
echo ============================================================
goto :fim

:erro
echo.
echo [ERRO] Algo falhou no passo acima. Copie o texto desta janela e mande para o Claude.

:fim
echo.
pause
