import { inject } from '@angular/core'
import { CanActivateFn, Router, Routes } from '@angular/router'
import { AuthService } from './auth.service'

const loggedInGuardWithRedirect =
  (url: string): CanActivateFn =>
  async () => {
    const authService = inject(AuthService)
    const router = inject(Router)
    await authService.init()
    if (authService.isLoggedIn) return true
    await router.navigateByUrl(url)
    return false
  }

const notLoggedInGuardWithRedirect =
  (url: string): CanActivateFn =>
  async () => {
    const authService = inject(AuthService)
    const router = inject(Router)
    await authService.init()
    if (!authService.isLoggedIn) return true
    await router.navigateByUrl(url)
    return false
  }

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-page.component').then((m) => m.LoginPageComponent),
    canActivate: [notLoggedInGuardWithRedirect('devices')],
  },
  {
    path: 'devices',
    loadComponent: () =>
      import('./pages/devices-page.component').then(
        (m) => m.DevicesPageComponent
      ),
    canActivate: [loggedInGuardWithRedirect('login')],
  },
  {
    path: '**',
    redirectTo: 'devices',
    pathMatch: 'full',
  },
]
