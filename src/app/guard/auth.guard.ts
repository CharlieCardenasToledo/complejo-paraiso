import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService, UserRole } from '../services/auth.service';

// Guard para verificar si un usuario tiene los roles permitidos
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.hasRole(allowedRoles).pipe(
      take(1),
      map(hasRole => {
        if (!hasRole) {
          router.navigate(['/login']);
          return false;
        }
        return true;
      })
    );
  };
};

// Guard para verificar si un usuario está autenticado
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map(user => {
      const isLoggedIn = !!user;
      if (!isLoggedIn) {
        router.navigate(['/login']);
        return false;
      }
      return true;
    })
  );
};

// Guard para verificar si un usuario NO está autenticado (útil para la página de login)
export const nonAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map(user => {
      const isLoggedIn = !!user;
      if (isLoggedIn) {
        router.navigate(['/home']);
        return false;
      }
      return true;
    })
  );
};