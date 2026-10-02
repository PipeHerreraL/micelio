# Clave de firma de la app de Android (ARCHITECTURE.md §4.31). Se ejecuta UNA vez, a mano:
#
#   powershell -ExecutionPolicy Bypass -File scripts\android-keystore.ps1
#
# 1. Crea el almacén de claves (micelio-release.p12) con una contraseña al azar, en una carpeta
#    fuera del repositorio (por defecto, Documentos\Micelio-firma-android).
# 2. Guarda la contraseña en esa carpeta.
# 3. Sube los dos secretos que usa .github/workflows/android.yml (con gh, ya autenticado).
#
# Guarda una copia de esa carpeta fuera de este PC: sin la clave no se pueden publicar
# actualizaciones de la app (Android solo instala encima una versión firmada con la misma clave).
# Nunca la subas al repositorio.

param(
  [string]$Folder = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Micelio-firma-android'),
  [string]$Repo = 'PipeHerreraL/micelio'
)

$ErrorActionPreference = 'Stop'
$keystore = Join-Path $Folder 'micelio-release.p12'
$passwordFile = Join-Path $Folder 'contrasena.txt'

if (Test-Path $keystore) {
  Write-Host "Ya existe $keystore. No se crea otra clave: la app debe firmarse siempre con la misma." -ForegroundColor Yellow
  Write-Host 'Si solo faltan los secretos en GitHub, súbelos con:'
  Write-Host "  gh secret set ANDROID_KEYSTORE_BASE64 --repo $Repo --body (base64 de $keystore)"
  Write-Host "  Get-Content $passwordFile | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $Repo"
  exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Falta 'gh' (el GitHub CLI) en el PATH."
}

# keytool viene con cualquier Java (también un JRE 8): primero el del PATH, luego JAVA_HOME y las
# carpetas de instalación habituales.
$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool) {
  $roots = @($env:JAVA_HOME, "$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium",
    "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Android\Android Studio\jbr") | Where-Object { $_ -and (Test-Path $_) }
  $keytool = $roots | ForEach-Object { Get-ChildItem $_ -Recurse -Depth 3 -Filter keytool.exe -ErrorAction SilentlyContinue } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $keytool) {
  throw "No se encontró keytool: instala Java (por ejemplo, winget install EclipseAdoptium.Temurin.21.JDK)."
}

New-Item -ItemType Directory -Force -Path $Folder | Out-Null

# Contraseña al azar de 32 caracteres (letras y cifras), sin pasar nunca por la pantalla.
$alphabet = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })

$env:MICELIO_KEYSTORE_PASSWORD = $password
try {
  # PKCS12 con la misma contraseña para el almacén y la clave (lo que espera android/app/build.gradle).
  # 10 000 días: Android pide que la clave dure más de 25 años.
  & $keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias micelio `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -dname 'CN=Micelio, O=PipeHerreraL, C=CO' `
    -storepass:env MICELIO_KEYSTORE_PASSWORD -keypass:env MICELIO_KEYSTORE_PASSWORD
  if ($LASTEXITCODE -ne 0) { throw 'keytool no pudo crear la clave.' }

  Set-Content -Path $passwordFile -Value $password -NoNewline -Encoding ascii

  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
  $base64 | gh secret set ANDROID_KEYSTORE_BASE64 --repo $Repo
  if ($LASTEXITCODE -ne 0) { throw 'gh no pudo guardar ANDROID_KEYSTORE_BASE64.' }
  $password | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $Repo
  if ($LASTEXITCODE -ne 0) { throw 'gh no pudo guardar ANDROID_KEYSTORE_PASSWORD.' }
}
finally {
  Remove-Item Env:MICELIO_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Clave creada y secretos subidos a GitHub.' -ForegroundColor Green
Write-Host "Carpeta: $Folder"
Write-Host 'IMPORTANTE: copia esa carpeta a un lugar seguro fuera de este PC (USB, tu nube personal).'
Write-Host 'Sin ella no se podrán publicar actualizaciones de la app de Android.'
