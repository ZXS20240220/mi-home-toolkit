import { Injectable, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { emit, listen } from '@tauri-apps/api/event'
import { BehaviorSubject, map } from 'rxjs'
import { MiService } from './mi.service'

type User = { email: string; country?: string }

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  miService = inject(MiService)

  user$ = new BehaviorSubject<User | null>(null)
  user = toSignal(this.user$)
  loggedIn$ = this.user$.pipe(map(Boolean))

  private initPromise?: Promise<User | null>

  get isLoggedIn() {
    return this.user$.value !== null
  }

  /** 启动时尝试恢复上次的登录状态；多次调用只执行一次 */
  init() {
    this.initPromise ??= this.miService
      .restoreSession()
      .catch(() => null)
      .then((user) => {
        if (user) this.user$.next(user)
        return user
      })
    return this.initPromise
  }

  async logout() {
    await this.miService.logout().catch(() => undefined)
    this.user$.next(null)
  }

  async setCountry(country: string) {
    const res = this.miService.setCountry(country)
    this.user$.next({ ...this.user$.value!, country })
    return res
  }

  async login(
    creds: { email: string; password: string; country?: string },
    captchaHandler?: (value: string) => void,
    twoFactorHandler?: (data: [payload: string, error?: string]) => void
  ) {
    const unsubFns = await Promise.all([
      listen<string>('captcha_requested', (e) => captchaHandler?.(e.payload)),
      listen<[string, string]>('two_factor_requested', (e) =>
        twoFactorHandler?.(e.payload)
      ),
    ])
    const res = await this.miService
      .login(creds)
      .finally(() => unsubFns.forEach((unsub) => unsub()))
    this.user$.next(creds)
    return res
  }

  solveCaptcha(value: string) {
    return emit('captcha_solved', value)
  }
  refreshCaptcha() {
    return emit('captcha_solved', '')
  }
  cancelCaptcha() {
    return emit('captcha_solved', 'CANCEL')
  }

  solveTwoFactor(value: string) {
    return emit('two_factor_solved', value)
  }
  cancelTwoFactor() {
    return emit('two_factor_solved', 'CANCEL')
  }
}
