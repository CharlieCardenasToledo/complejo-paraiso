import { Routes } from '@angular/router';
import { UserRole } from './services/auth.service';
import { roleGuard } from './guard/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'redirect',
    loadComponent: () => import('./components/redirect/redirect.component').then(m => m.RedirectComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero, UserRole.cobrador])]
  },
  {
    path: 'cocina',
    loadComponent: () => import('./pages/kitchen/kitchen.component').then(m => m.KitchenComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cocinero])]
  },
  {
    path: 'pedido',
    loadComponent: () => import('./pages/order/order.component').then(m => m.OrderComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero])]
  },
  {
    path: 'cobrar/:id',
    loadComponent: () => import('./pages/payment/payment.component').then(m => m.PaymentComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'cobrar',
    loadComponent: () => import('./pages/payment/payment.component').then(m => m.PaymentComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'tienda',
    loadComponent: () => import('./pages/store/store.component').then(m => m.StoreComponent),
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'users',
    loadComponent: () => import('./pages/user-management/user-management.component').then(m => m.UserManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  // Rutas de administración
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/caja',
    loadComponent: () => import('./components/cash-register/cash-register.component').then(m => m.CashRegisterComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/categorias',
    loadComponent: () => import('./pages/category-management/category-management.component').then(m => m.CategoryManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/productos',
    loadComponent: () => import('./pages/dish-management/dish-management.component').then(m => m.DishManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/inventario',
    loadComponent: () => import('./pages/inventory-management/inventory-management.component').then(m => m.InventoryManagementComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/reportes',
    loadComponent: () => import('./pages/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home'
  }
];
