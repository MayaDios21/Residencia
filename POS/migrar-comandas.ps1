<#
    MIGRAR SUPABASE PARA LAS COMANDAS

    Aplica en Supabase las migraciones 0007 (rol mesero) y 0008 (tablas de
    comandas y número de mesas). Solo agregan cosas: el sistema publicado sigue
    funcionando igual antes y después de correrlo. El código de las comandas se
    sube a main cuando esto ya esté hecho.

    Pasos que hace, y se detiene si algo falla:
      1. Trae lo último de main.
      2. Corre las pruebas del backend en local (no tocan Supabase).
      3. Pide la cadena de conexión de Supabase (no se muestra ni se guarda),
         migra y muestra que quedaron 0007 y 0008.

    Cómo correrlo, desde la carpeta del repositorio (la que tiene POS y docs):
      powershell -ExecutionPolicy Bypass -File .\POS\migrar-comandas.ps1

    Para solo revisar, sin tocar Supabase:
      powershell -ExecutionPolicy Bypass -File .\POS\migrar-comandas.ps1 -SoloProbar
#>

param(
    # Corre los pasos 1 y 2 y se detiene antes de tocar Supabase.
    [switch]$SoloProbar
)

$ErrorActionPreference = 'Stop'
$Pos = $PSScriptRoot
$Repo = Split-Path -Parent $Pos
$Backend = Join-Path $Pos 'BakcEnd'
$Python = Join-Path $Pos '.venv\Scripts\python.exe'

<#
    .SYNOPSIS
    Muestra el título de un paso.
#>
function Write-Paso([string]$Texto) {
    Write-Host ''
    Write-Host "==> $Texto" -ForegroundColor Cyan
}

<#
    .SYNOPSIS
    Detiene el script con un mensaje claro si el último comando falló.
#>
function Confirm-Exito([string]$QueFallo) {
    if ($LASTEXITCODE -ne 0) {
        throw "$QueFallo. Supabase no se tocó; revisa el mensaje de arriba."
    }
}

try {
    Set-Location $Repo
    if (-not (Test-Path $Python)) {
        throw "No encontré el entorno virtual en $Python. Créalo como dice la sección 2 de POS\GUIA_PRUEBAS_LOCAL.txt."
    }

    Write-Paso '1/3  Traer lo último de main'
    if (git status --porcelain) {
        throw 'Tienes cambios sin guardar en esta carpeta. Guárdalos con commit o usa "git stash" antes de seguir.'
    }
    git switch main
    Confirm-Exito 'No se pudo cambiar a main'
    git pull --ff-only origin main
    Confirm-Exito 'No se pudo traer lo último de main'
    foreach ($Migracion in '0007_waiter_role.py', '0008_orders_and_tables.py') {
        if (-not (Test-Path (Join-Path $Backend "pos\migrations\$Migracion"))) {
            throw "No llegó la migración $Migracion. Revisa que el pull haya funcionado."
        }
    }

    Write-Paso '2/3  Pruebas del backend en local (no tocan Supabase)'
    Set-Location $Backend
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    $env:DJANGO_SECRET_KEY = 'local-development-key'
    $env:DJANGO_DEBUG = 'True'
    & $Python manage.py test pos
    Confirm-Exito 'Fallaron las pruebas'

    if ($SoloProbar) {
        Write-Host ''
        Write-Host 'Todo bien. Modo -SoloProbar: no se tocó Supabase.' -ForegroundColor Green
        return
    }

    Write-Paso '3/3  Migrar Supabase'
    Write-Host 'Pega la cadena DATABASE_URL de Supabase (parte A de docs\Entrega-comandas.md).'
    Write-Host 'No se ve al pegarla y no se guarda en ningún archivo.'
    $Segura = Read-Host 'DATABASE_URL' -AsSecureString
    $Puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segura)
    try {
        $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto($Puntero)
        if (-not $env:DATABASE_URL.StartsWith('postgresql://')) {
            throw 'La cadena debe empezar con postgresql://'
        }
        & $Python manage.py migrate
        Confirm-Exito 'Falló la migración en Supabase'
        & $Python manage.py showmigrations pos
        Confirm-Exito 'No se pudieron revisar las migraciones'
    }
    finally {
        # Que ningún comando posterior trabaje contra la base real por error.
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Puntero)
    }

    Write-Host ''
    Write-Host 'Listo: Supabase migrado. Arriba deben verse [X] 0007_waiter_role y [X] 0008_orders_and_tables.' -ForegroundColor Green
    Write-Host 'Avísale a csvela para que suba el código de las comandas.' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
