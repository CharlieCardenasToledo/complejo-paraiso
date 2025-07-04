import { Component, OnInit, HostListener, inject, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, SidebarComponent, CommonModule],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'complejo-paraiso';
  showSidebar = false;
  pageTitle = '';
  isTabletView = true; // Asumimos tablet por defecto ya que se usará en Lenovo M11

  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private titleService = inject(Title);

  constructor() {
    effect(() => {
      const user = this.authService.user();
      if (!user && !this.router.url.includes('/login')) {
        this.router.navigate(['/login']);
      }
    });
  }

  ngOnInit() {
    // Verificamos el tamaño de pantalla inicial
    this.checkScreenSize();

    // Gestión de eventos de navegación para título y visibilidad del sidebar
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route;
      }),
      mergeMap(route => route.data)
    ).subscribe(data => {
      // Configurar el título de la página
      this.pageTitle = data['title'] || this.getDefaultTitle();
      this.titleService.setTitle(`${this.pageTitle} | Complejo Paraíso`);

      // Cerrar sidebar automáticamente al navegar en tablet
      if (this.isTabletView) {
        this.showSidebar = false;
      }
    });

    // Recuperar estado del sidebar de localStorage (persistencia)
    const savedSidebarState = localStorage.getItem('sidebarOpen');
    if (savedSidebarState === 'true') {
      this.showSidebar = true;
    }
  }

  // Detección de cambios de tamaño de pantalla
  @HostListener('window:resize', ['$event'])
  checkScreenSize() {
    const width = window.innerWidth;

    // Optimizaciones específicas para tablet Lenovo M11 (típicamente 1200x800)
    // Asumimos que es una tablet, pero ajustamos comportamiento según tamaño
    this.isTabletView = width < 1280;

    // Si la pantalla es muy pequeña (modo portrait en tablet), cerramos sidebar
    if (width < 768) {
      this.showSidebar = false;
    }
  }

  // Método para alternar la visibilidad del sidebar
  toggleSidebar() {
    this.showSidebar = !this.showSidebar;

    // Guardar preferencia en localStorage
    localStorage.setItem('sidebarOpen', this.showSidebar.toString());
  }

  // Obtener título predeterminado según la ruta
  private getDefaultTitle(): string {
    const path = this.router.url;

    if (path.includes('/home')) return 'Inicio';
    if (path.includes('/pedido')) return ' 🛒 Realizar Pedido';
    if (path.includes('/cocina')) return 'Cocina';
    if (path.includes('/tienda')) return 'Tienda';
    if (path.includes('/cobrar')) return 'Cobrar Pedido';
    if (path.includes('/users')) return 'Administración de Usuarios';
    if (path.includes('/admin/categorias')) return 'Gestión de Categorías';
    if (path.includes('/admin/productos')) return 'Gestión de Productos';
    if (path.includes('/admin/inventario')) return 'Gestión de Inventario';
    if (path.includes('/admin/reportes')) return 'Reportes';
    if (path.includes('/admin')) return 'Panel de Administración';

    return 'Complejo Paraíso';
  }
}
