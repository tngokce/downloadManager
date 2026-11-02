import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { PostAction } from '@shared/types'
import { runProcess } from './engine'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

/**
 * ffmpeg'i bulur. Finder/Başlat menüsünden açılan uygulamalar kullanıcının PATH'ini
 * tam görmez; bu yüzden Homebrew, Chocolatey, Scoop ve winget'in yaygın konumlarına da bakılır.
 */
export async function findFfmpeg(custom: string): Promise<string | null> {
  const exe = isWin ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [custom.trim()].filter(Boolean)
  if (isMac) candidates.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg')
  if (isWin) {
    const local = process.env.LOCALAPPDATA ?? ''
    const user = process.env.USERPROFILE ?? ''
    candidates.push(
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      join(user, 'scoop', 'shims', 'ffmpeg.exe'),
      join(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe'
    )
  }
  if (!isWin) candidates.push('/usr/bin/ffmpeg')
  candidates.push(exe) // PATH
  for (const c of candidates) {
    if (c !== exe && !existsSync(c)) continue
    const r = await runProcess(c, ['-version'])
    if (r.code === 0) return c
  }
  return null
}

/** Kuyruk/indirme bitince yapılacak sistem işlemi */
export function runPostAction(action: PostAction): void {
  const run = (cmd: string, args: string[]) => spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  switch (action) {
    case 'sleep':
      if (isMac) run('pmset', ['sleepnow'])
      else if (isWin) run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])
      else run('systemctl', ['suspend'])
      break
    case 'shutdown':
      if (isMac) run('osascript', ['-e', 'tell application "System Events" to shut down'])
      else if (isWin) run('shutdown', ['/s', '/t', '0'])
      else run('systemctl', ['poweroff'])
      break
    case 'quit':
      app.quit()
      break
    default:
      break
  }
}

export function applyLoginItem(openAtLogin: boolean): void {
  if (!app.isPackaged) return
  // Yalnızca değişiklik varsa sisteme yaz (gereksiz izin uyarılarını önler)
  if (app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin === openAtLogin) return
  app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
}

export function launchedHidden(): boolean {
  return process.argv.includes('--hidden')
}
