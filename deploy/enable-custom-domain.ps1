# is-a.dev 的 PR 合并后，把自定义域名加回 GitHub Pages。
#
#   $env:GITHUB_TOKEN = "ghp_xxx"
#   .\deploy\enable-custom-domain.ps1
#
# 会做三件事：
#   1. 在仓库根目录写回 CNAME
#   2. 在 GitHub Pages 设置里绑定 blog.yangzhuoqun.is-a.dev
#   3. 等 HTTPS 生效并检查站点
[CmdletBinding()]
param(
    [string]$Owner = "yangzhuoqun-666",
    [string]$Repo = "yangzhuoqun-666.github.io",
    [string]$Domain = "blog.yangzhuoqun.is-a.dev"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$token = $env:GITHUB_TOKEN
if (-not $token) {
    $secure = Read-Host "粘贴 GitHub Personal Access Token（输入不会显示）" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $token) { throw "没有拿到 token。" }

$headers = @{
    Authorization          = "Bearer $token"
    "User-Agent"           = "dsh-blog"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}
$api = "https://api.github.com"

function Write-Step([string]$text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Call-GitHub {
    param([string]$Method, [string]$Path, $Body)

    $params = @{
        Method      = $Method
        Uri         = "$api$Path"
        Headers     = $headers
        ErrorAction = "Stop"
        TimeoutSec  = 120
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json; charset=utf-8"
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    Invoke-RestMethod @params
}

Write-Step "确认 token"
$me = Call-GitHub -Method GET -Path "/user"
if ($me.login -ne $Owner) { throw "token 属于 $($me.login)，不是 $Owner。" }
Write-Host "已登录：$($me.login)"

Write-Step "写回 CNAME"
$cnameContent = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$Domain`n"))
$existing = $null
try {
    $existing = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/contents/CNAME"
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
}

if ($existing) {
    Call-GitHub -Method PUT -Path "/repos/$Owner/$Repo/contents/CNAME" -Body @{
        message = "Re-enable custom domain"
        content = $cnameContent
        sha     = $existing.sha
        branch  = "main"
    } | Out-Null
}
else {
    Call-GitHub -Method PUT -Path "/repos/$Owner/$Repo/contents/CNAME" -Body @{
        message = "Re-enable custom domain"
        content = $cnameContent
        branch  = "main"
    } | Out-Null
}
Write-Host "CNAME -> $Domain"

Write-Step "绑定 GitHub Pages 自定义域名"
$pages = Call-GitHub -Method PUT -Path "/repos/$Owner/$Repo/pages" -Body @{
    cname  = $Domain
    source = @{ branch = "main"; path = "/" }
}
Write-Host "Pages cname：$($pages.cname)"

Write-Step "等待构建和 HTTPS"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 10
    try {
        $p = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/pages"
        Write-Host "  $($p.status)  cname=$($p.cname)  https_enforced=$($p.https_enforced)"
        if ($p.status -eq "built" -and $p.cname -eq $Domain) {
            try {
                $r = Invoke-WebRequest -Uri "https://$Domain/" -UseBasicParsing -TimeoutSec 20
                if ($r.StatusCode -eq 200) {
                    $ready = $true
                    break
                }
            }
            catch {
                Write-Host "  HTTPS 还没就绪：$($_.Exception.Message)"
            }
        }
    }
    catch {
        Write-Host "  查询失败：$($_.Exception.Message)"
    }
}

Write-Host ""
if ($ready) {
    Write-Host "完成：https://$Domain/" -ForegroundColor Green
}
else {
    Write-Host "域名已提交，但 HTTPS 可能还在签发。过几分钟再打开 https://$Domain/ 看看。" -ForegroundColor Yellow
}
