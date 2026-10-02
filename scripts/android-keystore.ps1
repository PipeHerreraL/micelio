# Clave de firma de la app de Android (ARCHITECTURE.md §4.31). Se ejecuta a mano, desde la raíz
# del repositorio:
#
#   powershell -ExecutionPolicy Bypass -File scripts\android-keystore.ps1
#
# 1. Crea el almacén de claves (micelio-release.p12) con una contraseña al azar, en una carpeta
#    fuera del repositorio (por defecto, Documentos\Micelio-firma-android), y guarda ahí la
#    contraseña.
# 2. Sube los dos secretos que usa .github/workflows/android.yml (con gh, ya autenticado).
# 3. Escribe la huella del certificado en android/signing-cert.sha256: hay que subirla al
#    repositorio. El workflow no publica un .apk firmado con otra clave.
#
# Nunca crea una segunda clave: si GitHub ya tiene una, se detiene. Si la carpeta ya existe pero
# faltan los secretos (por ejemplo, gh no estaba autenticado), solo los sube.
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
$certFile = Join-Path $Folder 'micelio-cert.der'
$fingerprintFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'android\signing-cert.sha256'

# Windows PowerShell 5.1 convierte en error lo que un programa escribe en stderr, y keytool y gh
# escriben ahí sus avisos: se comprueba el código de salida.
function Invoke-Native([string]$What, [scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command
  }
  finally {
    $ErrorActionPreference = $previous
  }
  if ($LASTEXITCODE -ne 0) { throw "$What falló (código $LASTEXITCODE)." }
  return $output
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

# Antes de crear nada: gh tiene que poder leer los secretos del repositorio.
$secrets = @(Invoke-Native 'gh secret list (¿falta gh auth login?)' { gh secret list --repo $Repo --json name --jq '.[].name' })
$hasSecret = $secrets -contains 'ANDROID_KEYSTORE_BASE64'
$hasKeystore = Test-Path $keystore

if ($hasSecret -and -not $hasKeystore) {
  throw "GitHub ya tiene una clave de firma y $Folder no. No se crea otra: la app debe firmarse siempre con la misma. Restaura esa carpeta desde tu copia."
}

if (-not $hasKeystore) {
  New-Item -ItemType Directory -Force -Path $Folder | Out-Null
  # Contraseña al azar de 32 caracteres (letras y cifras), sin pasar nunca por la pantalla.
  $alphabet = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $newPassword = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  Set-Content -Path $passwordFile -Value $newPassword -NoNewline -Encoding ascii
}

$password = Get-Content -Path $passwordFile -Raw
$env:MICELIO_KEYSTORE_PASSWORD = $password
try {
  if (-not $hasKeystore) {
    # PKCS12 con la misma contraseña para el almacén y la clave (lo que espera android/app/build.gradle).
    # 10 000 días: Android pide que la clave dure más de 25 años.
    Invoke-Native 'keytool -genkeypair' {
      & $keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias micelio `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -dname 'CN=Micelio, O=PipeHerreraL, C=CO' `
        -storepass:env MICELIO_KEYSTORE_PASSWORD -keypass:env MICELIO_KEYSTORE_PASSWORD
    } | Out-Null
  }

  # Huella SHA-256 del certificado, la misma que muestra apksigner: el workflow la compara.
  Invoke-Native 'keytool -exportcert' {
    & $keytool -exportcert -keystore $keystore -storetype PKCS12 -alias micelio `
      -storepass:env MICELIO_KEYSTORE_PASSWORD -file $certFile
  } | Out-Null
  $fingerprint = (Get-FileHash -Algorithm SHA256 -Path $certFile).Hash.ToLowerInvariant()

  if (-not $hasSecret) {
    $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
    Invoke-Native 'gh secret set ANDROID_KEYSTORE_BASE64' { $base64 | gh secret set ANDROID_KEYSTORE_BASE64 --repo $Repo } | Out-Null
    Invoke-Native 'gh secret set ANDROID_KEYSTORE_PASSWORD' { $password | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $Repo } | Out-Null
  }
}
finally {
  Remove-Item Env:MICELIO_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
}

Set-Content -Path $fingerprintFile -Value $fingerprint -Encoding ascii

Write-Host ''
if ($hasSecret) {
  Write-Host 'La clave ya existía y GitHub ya la tenía: no se cambió nada.' -ForegroundColor Green
}
else {
  Write-Host 'Clave lista y secretos subidos a GitHub.' -ForegroundColor Green
}
Write-Host "Carpeta: $Folder"
Write-Host "Huella del certificado (pública) en: $fingerprintFile"
Write-Host 'IMPORTANTE: copia esa carpeta a un lugar seguro fuera de este PC (USB, tu nube personal).'
Write-Host 'Sin ella no se podrán publicar actualizaciones de la app de Android.'
