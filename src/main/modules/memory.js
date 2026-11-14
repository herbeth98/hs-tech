// Limpeza da memória RAM: esvazia a lista "em espera" (cache) e a memória ociosa dos programas.
// Mesmo método do RAMMap / ISLC: NtSetSystemInformation(SystemMemoryListInformation).
const { psJson } = require('../ps');

const SCRIPT = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HsMem {
  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int cls, ref int info, int len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr h, uint acc, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool LookupPrivilegeValue(string s, string n, out long luid);
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct TP { public int Count; public long Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool dis, ref TP n, int len, IntPtr p, IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  static void Priv(string name) {
    IntPtr t; OpenProcessToken(GetCurrentProcess(), 0x28, out t);
    long l; LookupPrivilegeValue(null, name, out l);
    var tp = new TP { Count = 1, Luid = l, Attr = 2 };
    AdjustTokenPrivileges(t, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
  }
  // 80 = SystemMemoryListInformation · 2 = esvaziar working sets · 4 = limpar lista em espera
  public static int Run(int cmd) {
    Priv("SeProfileSingleProcessPrivilege"); Priv("SeIncreaseQuotaPrivilege");
    return NtSetSystemInformation(80, ref cmd, 4);
  }
}
'@
function FreeMB { [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB) }
$total = [math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1KB)
$before = FreeMB
$ws = [HsMem]::Run(2)
$sb = [HsMem]::Run(4)
Start-Sleep -Milliseconds 600
$after = FreeMB
@{ before = $before; after = $after; total = $total; workingSets = $ws; standby = $sb } | ConvertTo-Json -Compress
`;

async function clean() {
  const r = await psJson(SCRIPT, { timeout: 60000 });
  if (!r) throw new Error('Sem resposta ao limpar a memória');
  if (r.workingSets !== 0 && r.standby !== 0) {
    throw new Error(`o Windows recusou a limpeza (códigos ${r.workingSets} e ${r.standby}). Abra o HS TECH como administrador`);
  }
  return { freedMB: Math.max(0, r.after - r.before), beforeMB: r.before, afterMB: r.after, totalMB: r.total };
}

module.exports = { clean };
