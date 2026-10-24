# 把 dist/ 上传到自己的服务器。
#
#   .\deploy\deploy-vps.ps1 -HostName 154.9.227.36 -User root
#   .\deploy\deploy-vps.ps1 -HostName 1.2.3.4 -User deploy -RemotePath /srv/blog -ReloadNginx
#
# 需要本机有 node（构建用）、ssh、scp、tar（Windows 10/11 自带）。
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$HostName,

    [string]$User = "root",
    [int]$Port = 22,
    [string]$RemotePath = "/var/www/blog",
    [switch]$SkipBuild,
    [switch]$ReloadNginx
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    if (-not $SkipBuild) {
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            throw "找不到 node。请先安装 Node.js 18+，或者用 -SkipBuild 直接上传已构建的 dist。"
        }
        node scripts/build.mjs
    }

    if (-not (Test-Path "dist/index.html")) {
        throw "dist 不存在或为空，请先运行 npm run build。"
    }

    $archive = Join-Path $env:TEMP "yangzhuoqun-blog.tar.gz"
    if (Test-Path $archive) { Remove-Item $archive -Force }
    tar -czf $archive -C dist .

    $target = "$User@$HostName"
    scp -P $Port $archive "${target}:/tmp/yangzhuoqun-blog.tar.gz"

    $remote = "mkdir -p '$RemotePath' && tar -xzf /tmp/yangzhuoqun-blog.tar.gz -C '$RemotePath' && rm -f /tmp/yangzhuoqun-blog.tar.gz"
    if ($ReloadNginx) {
        $remote = "$remote && nginx -t && systemctl reload nginx"
    }

    ssh -p $Port $target "$remote"

    Write-Host ""
    Write-Host "✓ 已上传到 ${target}:${RemotePath}" -ForegroundColor Green
    Write-Host "  第一次部署还需要确认 nginx 指向该目录，并配置 HTTPS。"
}
finally {
    Pop-Location
}
