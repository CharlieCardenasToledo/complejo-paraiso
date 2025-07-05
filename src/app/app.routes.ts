import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/auth.guard';
import { UserRole } from './core/services/auth.service';

export const routes: Routes = [
  {
    path: 'login',
        loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'redirect',
    loadComponent: () => import('./core/shared/components/redirect/redirect.component').then(m => m.RedirectComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero, UserRole.cobrador])]
  },
  {
    path: 'cocina',
    loadComponent: () => import('./features/kitchen/kitchen.component').then(m => m.KitchenComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cocinero])]
  },
  {
    path: 'pedido',
    loadComponent: () => import('./features/order/order.component').then(m => m.OrderComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero])]
  },
  {
    path: 'cobrar/:id',
    loadComponent: () => import('./features/payment/payment.component').then(m => m.PaymentComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'cobrar',
    loadComponent: () => import('./features/payment/payment.component').then(m => m.PaymentComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'tienda',
    loadComponent: () => import('./features/store/store.component').then(m => m.StoreComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'users',
    loadComponent: () => import('./features/user-management/user-management.component').then(m => m.UserManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  // Rutas de administración
  {
    path: 'admin',
    loadComponent: () => import('./features/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/caja',
    loadComponent: () => import('./features/cash-register/cash-register.component').then(m => m.CashRegisterComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/categorias',
    loadComponent: () => import('./features/category-management/category-management.component').then(m => m.CategoryManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/productos',
    loadComponent: () => import('./features/dish-management/dish-management.component').then(m => m.DishManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/inventario',
    loadComponent: () => import('./features/inventory-management/inventory-management.component').then(m => m.InventoryManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/reportes',
    loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home'
  }
];
