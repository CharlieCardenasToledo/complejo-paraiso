import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';

// Guard para verificar si un usuario tiene los roles permitidos
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.hasRole(allowedRoles)) {
      return true;
    } else {
      router.navigate(['/login']);
      return false;
    }
  };
};

// Guard para verificar si un usuario está autenticado
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isLoggedIn = !!authService.user();
  if (!isLoggedIn) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

// Guard para verificar si un usuario NO está autenticado (útil para la página de login)
export const nonAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isLoggedIn = !!authService.user();
  if (isLoggedIn) {
    router.navigate(['/home']);
    return false;
  }
  return true;
};
