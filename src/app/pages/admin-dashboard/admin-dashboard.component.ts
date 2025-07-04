import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  // Signals para controlar acceso
  isAdmin = this.authService.isAdmin;

  // Menú de administración
  adminMenuItems = [
    {
      title: 'Categorías',
      description: 'Administrar categorías de Productos',
      icon: '📋',
      route: '/admin/categorias'
    },
    {
      title: 'Productos',
      description: 'Administrar productos',
      icon: '🍽️',
      route: '/admin/productos',
      highlight: true // Para destacarlo visualmente

    },
    {
      title: 'Inventario',
      description: 'Gestionar stock y disponibilidad',
      icon: '📦',
      route: '/admin/inventario'
    },
    {
      title: 'Reportes',
      description: 'Ver reportes y estadísticas',
      icon: '📊',
      route: '/admin/reportes'
    },
    {
      title: 'Usuarios',
      description: 'Administrar usuarios del sistema',
      icon: '👥',
      route: '/users'
    },

  ];

  constructor() {
    // Verificar acceso de administrador
    effect(() => {
      if (!this.isAdmin()) {
        this.router.navigate(['/login']);
      }
    });
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}