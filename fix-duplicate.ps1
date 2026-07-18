# Fix 1: Add deliveryPending Set to prevent duplicate auto-delivery
# Fix 2: Ensure pre-payment messages skip AI replies properly

$file = Join-Path $PSScriptRoot "bot.js"
if (-not (Test-Path $file)) {
    $file = Join-Path (Split-Path $PSScriptRoot -Parent) "bot.js"
}
$content = Get-Content $file -Raw

# Fix 1: Add deliveryPending Set definition
$old1 = 'const deliveredCids = new Set();     // 已自动发货的会话 ID（防止重复发货）'
$new1 = @'
const deliveredCids = new Set();     // 已自动发货的会话 ID（防止重复发货）
const deliveryPending = new Set();   // 正在发货中的会话 ID（防止并发重复发货）
'@
$content = $content.Replace($old1, $new1)

# Fix 2: Update handleAutoDelivery to use double-lock
$old2 = @'
async function handleAutoDelivery(cid, conv) {
    // 防止重复发货
    if (deliveredCids.has(cid)) return;
    if (!conv.itemId) return;
'@
$new2 = @'
async function handleAutoDelivery(cid, conv) {
    // 防止重复发货 - 双重锁防并发
    if (deliveredCids.has(cid)) return;
    if (deliveryPending.has(cid)) return;
    deliveryPending.add(cid);
    if (!conv.itemId) { deliveryPending.delete(cid); return; }
'@
$content = $content.Replace($old2, $new2)

# Fix 3: Add deliveryPending.delete after successful delivery
$old3 = @'
    // 记录到日志文件
    logger.info(`[自动发货] 已发货: ${deliveryText.substring(0, 100)}`);
}
'@
$new3 = @'
    // 记录到日志文件
    logger.info(`[自动发货] 已发货: ${deliveryText.substring(0, 100)}`);
    deliveryPending.delete(cid);
}
'@
$content = $content.Replace($old3, $new3)

# Fix 4: Add "拍下" to the PRE_PAYMENT_KEYWORDS to ensure pre-payment messages are filtered
$old4 = "    '已拍下', '待付款', '待成交', '待刀成', '待确认', '已小刀',"
$new4 = "    '已拍下', '待付款', '待成交', '待刀成', '待确认', '已小刀', '拍下了',"

$content = $content.Replace($old4, $new4)

Set-Content $file -Value $content -NoNewline

Write-Host "Fixed:"
Write-Host "  - deliveryPending lock to prevent duplicate shipments"
Write-Host "  - Added '拍下了' to pre-payment filter"
Write-Host "Done."
