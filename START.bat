@echo off
echo ============================================
echo      TruckRecruit CRM - Запуск системы
echo ============================================
echo.

:: Check if node_modules exist
if not exist "node_modules" (
  echo [1/3] Установка зависимостей корневого пакета...
  call npm install
)

if not exist "server\node_modules" (
  echo [2/3] Установка зависимостей сервера...
  cd server && call npm install && cd ..
)

if not exist "client\node_modules" (
  echo [3/3] Установка зависимостей клиента...
  cd client && call npm install && cd ..
)

echo.
echo Запуск CRM...
echo  - Backend:  http://localhost:3001
echo  - Frontend: http://localhost:5173
echo.
echo Нажмите Ctrl+C для остановки
echo.
call npm run dev
