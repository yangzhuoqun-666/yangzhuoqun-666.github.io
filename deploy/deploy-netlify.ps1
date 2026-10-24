# 通过 Netlify API 一键部署（不需要打开 Netlify 网页）
#
#   .\deploy\deploy-netlify.ps1
#
# 会提示粘贴 Netlify Personal Access Token（输入不显示），然后：
#   1. 创建（或复用）站点
#   2. 上传 dist/ 里的全部文件
#   3. 等待部署完成
#   4. 尝试绑定 blog.yangzhuoqun.is-a.dev
#   5. 生成 deploy/is-a-dev.netlify.json
#
# Token 创建地址：
#   https://app.netlify.com/user/applications#personal-access-tokens
# 建议有效期选 1 天，部署完立刻撤销。
[CmdletBinding()]
param(
    [string]$SiteName = "yangzhuoqun-blog",
    [string]$Domain = "blog.yangzhuoqun.is-a.dev",
    [string]$DistPath,
    [switch]$SkipDomain
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$api = $env:NETLIFY_API_BASE
if (-not $api) {
    $api = "https://api.netlify.com/api/v1"
}
$root = Split-Path -Parent $PSScriptRoot
if (-not $DistPath) {
    $DistPath = Join-Path $root "dist"
}
$owner = @{
    username = "yangzhuoqun-666"
    email    = "yangzhuoqun_youxi@outlook.com"
}

function Write-Step([string]$text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body,
        [string]$ContentType = "application/json"
    )

    $params = @{
        Method      = $Method
        Uri         = "$api$Path"
        Headers     = $script:headers
        ErrorAction = "Stop"
        TimeoutSec  = 120
    }

    if ($null -ne $Body) {
        if ($ContentType -eq "application/octet-stream") {
            $params.Body = $Body
            $params.ContentType = "application/octet-stream"
        }
        else {
            $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
            $params.ContentType = "application/json"
        }
    }

    Invoke-RestMethod @params
}

if (-not (Test-Path (Join-Path $DistPath "index.html"))) {
    throw "找不到 $DistPath\index.html。请先在项目根目录运行 npm run build。"
}

$token = $env:NETLIFY_AUTH_TOKEN
if (-not $token) {
    $secure = Read-Host "粘贴 Netlify Personal Access Token（输入不会显示）" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if (-not $token) {
    throw "没有拿到 token。"
}

$script:headers = @{
    Authorization = "Bearer $token"
    "User-Agent"  = "yangzhuoqun-blog-deploy"
}

Write-Step "检查账号"
try {
    $me = Invoke-Api -Method GET -Path "/user"
    Write-Host "已登录：$($me.full_name) <$($me.email)>"
}
catch {
    $detail = $_.ErrorDetails.Message
    throw "Token 无效或没有权限。$detail"
}

Write-Step "创建或复用站点"
$sites = Invoke-Api -Method GET -Path "/sites?per_page=100"
$site = $sites | Where-Object { $_.name -eq $SiteName } | Select-Object -First 1

if (-not $site) {
    try {
        $site = Invoke-Api -Method POST -Path "/sites" -Body @{ name = $SiteName }
    }
    catch {
        $suffix = -join ((97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
        $fallback = "$SiteName-$suffix"
        Write-Host "站点名 $SiteName 不可用（可能已被占用），改用 $fallback"
        $site = Invoke-Api -Method POST -Path "/sites" -Body @{ name = $fallback }
    }
}

$defaultDomain = $site.default_domain
if (-not $defaultDomain) { $defaultDomain = "$($site.name).netlify.app" }
Write-Host "站点：https://$defaultDomain"

Write-Step "计算文件指纹"
$files = @{}
$bySha = @{}
$list = Get-ChildItem -Path $DistPath -Recurse -File
foreach ($file in $list) {
    $rel = $file.FullName.Substring($DistPath.Length).Replace("\", "/")
    if (-not $rel.StartsWith("/")) { $rel = "/$rel" }
    $sha = (Get-FileHash -Path $file.FullName -Algorithm SHA1).Hash.ToLower()
    $files[$rel] = $sha
    if (-not $bySha.ContainsKey($sha)) { $bySha[$sha] = $file.FullName }
}
Write-Host "$($files.Count) 个文件"

Write-Step "创建部署"
$deploy = Invoke-Api -Method POST -Path "/sites/$($site.id)/deploys" -Body @{ files = $files }

$required = @($deploy.required)
if ($required.Count -gt 0) {
    Write-Host "需要上传 $($required.Count) 个文件"
    $shaToPath = @{}
    foreach ($entry in $files.GetEnumerator()) {
        if (-not $shaToPath.ContainsKey($entry.Value)) {
            $shaToPath[$entry.Value] = $entry.Key
        }
    }

    $done = 0
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Authorization =
        New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
    try {
        foreach ($sha in $required) {
            $rel = $shaToPath[$sha]
            $file = $bySha[$sha]
            $encoded = ($rel.TrimStart("/").Split("/") | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/"
            $bytes = [IO.File]::ReadAllBytes($file)
            $content = New-Object System.Net.Http.ByteArrayContent -ArgumentList (, $bytes)
            $content.Headers.ContentType =
                [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
            try {
                $response = $client.PutAsync("$api/deploys/$($deploy.id)/files/$encoded", $content).GetAwaiter().GetResult()
                if (-not $response.IsSuccessStatusCode) {
                    throw "上传失败 $rel：HTTP $([int]$response.StatusCode)"
                }
                $response.Dispose()
            }
            finally {
                $content.Dispose()
            }

            $done += 1
            if ($done % 10 -eq 0 -or $done -eq $required.Count) {
                Write-Host "  已上传 $done / $($required.Count)"
            }
        }
    }
    finally {
        $client.Dispose()
    }
}

Write-Step "等待部署完成"
$state = "unknown"
for ($i = 0; $i -lt 60; $i++) {
    $info = Invoke-Api -Method GET -Path "/deploys/$($deploy.id)"
    $state = $info.state
    if ($state -eq "ready") { break }
    if ($state -eq "error") {
        throw "部署失败：$($info.error_message)"
    }
    Start-Sleep -Seconds 2
}

if ($state -ne "ready") {
    throw "部署超时，最后状态：$state"
}
Write-Host "部署状态：ready"
Write-Host "预览地址：https://$defaultDomain"

if (-not $SkipDomain -and $Domain) {
    Write-Step "绑定自定义域名"
    try {
        $updated = Invoke-Api -Method PATCH -Path "/sites/$($site.id)" -Body @{ custom_domain = $Domain }
        Write-Host "已提交域名：$($updated.custom_domain)"
    }
    catch {
        Write-Warning "API 绑定域名没有成功：$($_.ErrorDetails.Message)"
        Write-Host "可以先在浏览器里打开 Netlify 项目，手动添加 $Domain。"
    }
}

$record = [ordered]@{
    owner   = $owner
    records = [ordered]@{
        CNAME = $defaultDomain
    }
}
$recordJson = $record | ConvertTo-Json -Depth 5
$recordPath = Join-Path $root "deploy\is-a-dev.netlify.json"
[IO.File]::WriteAllText($recordPath, $recordJson + "`n", [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "完成。" -ForegroundColor Green
Write-Host ""
Write-Host "下一步："
Write-Host "  1. 把 deploy\is-a-dev.netlify.json 的内容覆盖到你的 is-a.dev fork："
Write-Host "     domains/blog.yangzhuoqun.json"
Write-Host "  2. 提 PR，等合并后 DNS 生效"
Write-Host "  3. Netlify 会自动签发 HTTPS 证书（可能需要几分钟）"
Write-Host ""
Write-Host "  CNAME  $Domain  ->  $defaultDomain"
