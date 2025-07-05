import { Component, inject, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService, UserRole } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './sidebar.component.html'
})
export class SidebarComponent {
  private authService = inject(AuthService);

  // Emitter para controlar la visibilidad en tablet
  @Output() toggleSidebar = new EventEmitter<void>();

  // Signals para controlar la visibilidad de elementos según rol
  isAdmin = this.authService.isAdmin;
  canAccessDashboard = computed(() => this.authService.hasRole([UserRole.admin, UserRole.mesero, UserRole.cobrador]));
  canAccessOrders = computed(() => this.authService.hasRole([UserRole.admin, UserRole.mesero]));
  canAccessKitchen = computed(() => this.authService.hasRole([UserRole.admin, UserRole.cocinero]));
  canAccessPayments = computed(() => this.authService.hasRole([UserRole.admin, UserRole.cobrador, UserRole.mesero]));

  // Datos del usuario
  userData = this.authService.userData;

  // Método para cerrar el sidebar después de una navegación en tablet
  closeSidebar(): void {
    // Determinar si estamos en un dispositivo pequeño/tablet
    const isSmallDevice = window.innerWidth < 1280;

    // Solo cerrar automáticamente en dispositivos pequeños
    if (isSmallDevice) {
      this.toggleSidebar.emit();

      // Pequeño retardo para mejorar la experiencia de usuario
      setTimeout(() => {
        // Hacer scroll al inicio de la página para mejor usabilidad
        window.scrollTo(0, 0);
      }, 150);
    }
  }

  logout() {
    // Primero cerrar el sidebar para evitar una experiencia visual extraña
    this.closeSidebar();

    // Pequeño retardo antes de logout para garantizar animación fluida
    setTimeout(() => {
      this.authService.logout();
    }, 200);
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'mesero': return 'Mesero';
      case 'cocinero': return 'Cocinero';
      case 'cobrador': return 'Cobrador';
      default: return role;
    }
  }
}