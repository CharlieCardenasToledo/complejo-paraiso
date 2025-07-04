// Actualización de app.routes.ts para incluir el componente de reportes

import { Routes } from '@angular/router';
import { RedirectComponent } from './components/redirect/redirect.component';
import { LoginComponent } from './pages/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { KitchenComponent } from './pages/kitchen/kitchen.component';
import { OrderComponent } from './pages/order/order.component';
import { PaymentComponent } from './pages/payment/payment.component';
import { UserManagementComponent } from './pages/user-management/user-management.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { CategoryManagementComponent } from './pages/category-management/category-management.component';
import { DishManagementComponent } from './pages/dish-management/dish-management.component';
import { InventoryManagementComponent } from './pages/inventory-management/inventory-management.component';
import { StoreComponent } from './pages/store/store.component';
import { ReportsComponent } from './pages/reports/reports.component'; // Importar el nuevo componente

// Importar guards
import { UserRole } from './services/auth.service';
import { roleGuard } from './guard/auth.guard';
import { CashRegisterComponent } from './components/cash-register/cash-register.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'redirect',
    component: RedirectComponent
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero, UserRole.cobrador])]
  },
  {
    path: 'cocina',
    component: KitchenComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.cocinero])]
  },
  {
    path: 'pedido',
    component: OrderComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.mesero])]
  },
  {
    path: 'cobrar/:id',
    component: PaymentComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'cobrar',
    component: PaymentComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'tienda',
    component: StoreComponent,
    canActivate: [roleGuard([UserRole.admin, UserRole.cobrador, UserRole.mesero])]
  },
  {
    path: 'users',
    component: UserManagementComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  // Rutas de administración
  {
    path: 'admin',
    component: AdminDashboardComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/caja',
    component: CashRegisterComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/categorias',
    component: CategoryManagementComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/productos',
    component: DishManagementComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/inventario',
    component: InventoryManagementComponent,
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: 'admin/reportes',
    component: ReportsComponent, // Usar el nuevo componente de reportes
    canActivate: [roleGuard([UserRole.admin])]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home'
  }
];