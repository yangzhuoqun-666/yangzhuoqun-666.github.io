# 通过 GitHub API 部署到 GitHub Pages，并给 is-a.dev 提 PR。
#
#   $env:GITHUB_TOKEN = "ghp_xxx"
#   .\deploy\deploy-github.ps1
#
# 默认创建用户站点仓库 yangzhuoqun-666.github.io，这样根路径就是站点，
# /assets 这类绝对路径可以直接工作。
[CmdletBinding()]
param(
    [string]$Owner = "yangzhuoqun-666",
    [string]$Repo = "yangzhuoqun-666.github.io",
    [string]$Domain = "blog.yangzhuoqun.is-a.dev",
    [string]$DistPath,
    [switch]$SkipPages,
    [switch]$SkipPullRequest,
    [switch]$SkipCname
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
if (-not $DistPath) { $DistPath = Join-Path $root "dist" }
if (-not (Test-Path (Join-Path $DistPath "index.html"))) {
    throw "找不到 $DistPath\index.html，请先构建。"
}

$token = $env:GITHUB_TOKEN
if (-not $token) {
    $secure = Read-Host "粘贴 GitHub Personal Access Token（输入不会显示）" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $token) { throw "没有拿到 token。" }

$script:headers = @{
    Authorization          = "Bearer $token"
    "User-Agent"           = "dsh-blog-deploy"
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
        Headers     = $script:headers
        ErrorAction = "Stop"
        TimeoutSec  = 120
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json; charset=utf-8"
        $params.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
    }

    try {
        Invoke-RestMethod @params
    }
    catch {
        $status = 0
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode.value__
        }
        $detail = $_.ErrorDetails.Message
        $ex = New-Object System.Exception("GitHub API $Method $Path -> $status $detail")
        $ex.Data["StatusCode"] = $status
        throw $ex
    }
}

function Get-StatusOfError {
    param($ErrorRecord)

    if ($ErrorRecord.Exception.Data -and $ErrorRecord.Exception.Data.Contains("StatusCode")) {
        return [int]$ErrorRecord.Exception.Data["StatusCode"]
    }
    if ($ErrorRecord.Exception.Response) {
        return [int]$ErrorRecord.Exception.Response.StatusCode.value__
    }
    return 0
}

Write-Step "校验 token"
$me = Call-GitHub -Method GET -Path "/user"
if ($me.login -ne $Owner) {
    throw "token 属于 $($me.login)，不是 $Owner。"
}
Write-Host "已登录：$($me.login)"

Write-Step "创建仓库 $Owner/$Repo"
$repoExists = $true
try {
    $repoInfo = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo"
}
catch {
    if ((Get-StatusOfError $_) -eq 404) { $repoExists = $false }
    else { throw }
}

if (-not $repoExists) {
    $repoInfo = Call-GitHub -Method POST -Path "/user/repos" -Body @{
        name        = $Repo
        private     = $false
        auto_init   = $false
        description = "Yang Zhuoqun's blog"
        has_issues  = $true
        has_wiki    = $false
        has_projects = $false
    }
    Write-Host "已创建：$($repoInfo.html_url)"
}
else {
    Write-Host "仓库已存在，将覆盖 main 分支。"
}

Write-Step "上传 dist（一个 commit）"
$mainSha = $null
try {
    $mainRef = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/git/ref/heads/main"
    $mainSha = $mainRef.object.sha
}
catch {
    $status = Get-StatusOfError $_
    if ($status -ne 404 -and $status -ne 409) { throw }
}

if (-not $mainSha) {
    Write-Host "初始化空仓库..."
    $readme = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("# $Repo`n"))
    Call-GitHub -Method PUT -Path "/repos/$Owner/$Repo/contents/README.md" -Body @{
        message = "Initial commit"
        content = $readme
    } | Out-Null
    $mainRef = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/git/ref/heads/main"
    $mainSha = $mainRef.object.sha
}

$files = Get-ChildItem -Path $DistPath -Recurse -File
$entries = @()
$count = 0
foreach ($file in $files) {
    $rel = $file.FullName.Substring($DistPath.Length).TrimStart("\", "/").Replace("\", "/")
    if ($SkipCname -and $rel -eq "CNAME") { continue }
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    $blob = Call-GitHub -Method POST -Path "/repos/$Owner/$Repo/git/blobs" -Body @{
        content  = $b64
        encoding = "base64"
    }
    $entries += @{
        path = $rel
        mode = "100644"
        type = "blob"
        sha  = $blob.sha
    }
    $count += 1
    if ($count % 10 -eq 0 -or $count -eq $files.Count) {
        Write-Host "  已上传 $count / $($files.Count)"
    }
}

$tree = Call-GitHub -Method POST -Path "/repos/$Owner/$Repo/git/trees" -Body @{ tree = $entries }
$commit = Call-GitHub -Method POST -Path "/repos/$Owner/$Repo/git/commits" -Body @{
    message = "Deploy blog"
    tree    = $tree.sha
    parents = @($mainSha)
}
Write-Host "commit：$($commit.sha.Substring(0, 7))"

Call-GitHub -Method PATCH -Path "/repos/$Owner/$Repo/git/refs/heads/main" -Body @{
    sha   = $commit.sha
    force = $true
} | Out-Null
Write-Host "main -> $($commit.sha.Substring(0, 7))"

if (-not $SkipPages) {
    Write-Step "开启 GitHub Pages"
    $pages = $null
    try { $pages = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/pages" }
    catch { if ((Get-StatusOfError $_) -ne 404) { throw } }

    $source = @{ branch = "main"; path = "/" }
    if (-not $pages) {
        try {
            $pages = Call-GitHub -Method POST -Path "/repos/$Owner/$Repo/pages" -Body @{ source = $source }
        }
        catch {
            if ((Get-StatusOfError $_) -eq 409) {
                $pages = Call-GitHub -Method GET -Path "/repos/$Owner/$Repo/pages"
            }
            else { throw }
        }
    }

    try {
        $pages = Call-GitHub -Method PUT -Path "/repos/$Owner/$Repo/pages" -Body @{
            cname  = $Domain
            source = $source
        }
        Write-Host "Pages 已配置，自定义域名：$($pages.cname)"
    }
    catch {
        Write-Warning "设置自定义域名失败（CNAME 文件仍会生效）：$($_.Exception.Message)"
    }

    Write-Host "Pages 地址：https://$Repo/"
    Write-Host "自定义域名：https://$Domain/"
}

if (-not $SkipPullRequest) {
    Write-Step "给 is-a.dev 提 PR"

    $fork = $null
    try { $fork = Call-GitHub -Method GET -Path "/repos/$Owner/register" }
    catch {
        if ((Get-StatusOfError $_) -ne 404) { throw }
    }

    if (-not $fork) {
        Write-Host "创建 fork（可能需要几秒）..."
        Call-GitHub -Method POST -Path "/repos/is-a-dev/register/forks" -Body @{} | Out-Null
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            try {
                $fork = Call-GitHub -Method GET -Path "/repos/$Owner/register"
                break
            }
            catch {
                if ((Get-StatusOfError $_) -ne 404) { throw }
            }
        }
        if (-not $fork) { throw "fork 创建超时。" }
    }
    Write-Host "fork：$($fork.full_name)"

    $filePath = "/repos/$Owner/register/contents/domains/blog.yangzhuoqun.json"
    $existing = Call-GitHub -Method GET -Path $filePath
    $mainRef = Call-GitHub -Method GET -Path "/repos/$Owner/register/git/ref/heads/main"

    $record = [ordered]@{
        owner   = [ordered]@{
            username = $Owner
            email    = "yangzhuoqun_youxi@outlook.com"
        }
        records = [ordered]@{
            CNAME = "yangzhuoqun-666.github.io"
        }
    }
    $recordJson = $record | ConvertTo-Json -Depth 5
    $recordB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($recordJson + "`n"))

    $branch = "update-blog-domain-" + (Get-Date -Format "yyyyMMddHHmmss")
    Call-GitHub -Method POST -Path "/repos/$Owner/register/git/refs" -Body @{
        ref = "refs/heads/$branch"
        sha = $mainRef.object.sha
    } | Out-Null

    Call-GitHub -Method PUT -Path $filePath -Body @{
        message = "Update blog.yangzhuoqun.is-a.dev to GitHub Pages"
        content = $recordB64
        sha     = $existing.sha
        branch  = $branch
    } | Out-Null

    try {
        $pr = Call-GitHub -Method POST -Path "/repos/is-a-dev/register/pulls" -Body @{
            title = "Update blog.yangzhuoqun.is-a.dev"
            head  = "$Owner`:$branch"
            base  = "main"
            body  = "Point blog.yangzhuoqun.is-a.dev to GitHub Pages (yangzhuoqun-666.github.io)."
        }
        Write-Host "PR：$($pr.html_url)"
    }
    catch {
        Write-Warning "PR 创建失败，请手动提交：$($_.Exception.Message)"
        Write-Host "分支已推到 $Owner/register:$branch"
    }
}

Write-Host ""
Write-Host "完成。" -ForegroundColor Green
Write-Host "站点：https://$Domain/"
Write-Host "仓库：https://github.com/$Owner/$Repo"
