import { inject, effect } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';


// Guard para verificar si un usuario tiene los roles permitidos
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return new Promise<boolean>(resolve => {
      const authEffect = effect(() => {
        const isLoading = authService.isLoading();
        if (!isLoading) {
          const hasRole = authService.hasRole(allowedRoles);
          if (hasRole) {
            resolve(true);
          } else {
            router.navigate(['/login']);
            resolve(false);
          }
          authEffect.destroy(); // Limpiar el effect después de usarlo
        }
      });
    });
  };
};

// Guard para verificar si un usuario está autenticado
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return new Promise<boolean>(resolve => {
    const authEffect = effect(() => {
      const isLoading = authService.isLoading();
      if (!isLoading) {
        const isLoggedIn = !!authService.user();
        if (isLoggedIn) {
          resolve(true);
        } else {
          // Guarda la URL de destino para redirigir después del login
          authService.redirectUrl = state.url;
          router.navigate(['/login']);
          resolve(false);
        }
        authEffect.destroy();
      }
    });
  });
};

// Guard para verificar si un usuario NO está autenticado (útil para la página de login)
export const nonAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return new Promise<boolean>(resolve => {
    const authEffect = effect(() => {
      const isLoading = authService.isLoading();
      if (!isLoading) {
        const isLoggedIn = !!authService.user();
        if (isLoggedIn) {
          router.navigate(['/home']);
          resolve(false);
        } else {
          resolve(true);
        }
        authEffect.destroy();
      }
    });
  });
};