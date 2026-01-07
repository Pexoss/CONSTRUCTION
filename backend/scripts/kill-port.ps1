# Script para encerrar processo usando porta específica
param(
    [int]$Port = 3000
)

Write-Host "🔍 Procurando processo na porta $Port..."

$connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if ($connection) {
    $processId = $connection.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    
    if ($process) {
        Write-Host "⚠️  Processo encontrado: $($process.ProcessName) (PID: $processId)"
        Write-Host "🛑 Encerrando processo..."
        
        Stop-Process -Id $processId -Force
        
        Start-Sleep -Seconds 1
        
        # Verificar se foi encerrado
        $stillRunning = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($stillRunning) {
            Write-Host "❌ Falha ao encerrar processo"
        } else {
            Write-Host "✅ Porta $Port liberada!"
        }
    } else {
        Write-Host "❌ Processo não encontrado"
    }
} else {
    Write-Host "✅ Porta $Port já está livre"
}
