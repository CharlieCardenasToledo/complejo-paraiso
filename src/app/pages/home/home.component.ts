import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, collectionData, query, orderBy } from '@angular/fire/firestore';
import { map, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormatDateSpanishPipe } from '../../pipes/format-date-spanish.pipe';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOption?: string;
  status?: 'En espera' | 'En preparación' | 'Realizado'; // Nuevo campo para estado individual
}

interface Order {
  id: string;
  customer: {
    idNumber: string;
    name: string;
  };
  date: Date;
  status: 'En espera' | 'En preparación' | 'Realizado';
  total: number;
  items: OrderItem[];
  tables?: number[];
}

interface DashboardStats {
  totalRevenue: number;
  orderCount: number;
  totalItems: number;
  averageTicket: number;
  topProducts: {name: string, quantity: number, revenue: number}[];
  statusCounts: {[key: string]: number};
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormatDateSpanishPipe, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  private firestore = inject(Firestore);
  private router = inject(Router);

  orders$: Observable<Order[]> = of([]);
  groupedOrders: Map<string, Order[]> = new Map();
  visibleDates: string[] = [];
  allDates: string[] = [];

  // Estadísticas del dashboard
  statsMap: Map<string, DashboardStats> = new Map();
  overallStats: DashboardStats = this.createEmptyStats();
  selectedDate: string = 'overall';

  // Filtro para pedidos con platos listos
  showOnlyWithReadyItems: boolean = false;

  readonly INITIAL_DATES_TO_SHOW = 3;
  readonly DATES_TO_LOAD_MORE = 3;
  readonly TOP_PRODUCTS_COUNT = 5;

  ngOnInit() {
    this.loadOrders();
  }

  private loadOrders() {
    const ordersCollection = collection(this.firestore, 'orders');
    // Crear una consulta ordenada por fecha descendente (más reciente primero)
    const ordersQuery = query(ordersCollection, orderBy('date', 'desc'));

    collectionData(ordersQuery, { idField: 'id' })
      .pipe(
        map((docs) =>
          docs.map((doc) => {
            const data = doc as any;
            // Si no hay un status definido, asignar "En espera" por defecto
            if (!data.status) {
              data.status = 'En espera';
            }

            // Asegurarse de que cada ítem tenga un estado
            if (data.items && Array.isArray(data.items)) {
              data.items = data.items.map((item:any) => ({
                ...item,
                status: item.status || 'En espera'
              }));
            }

            return {
              ...data,
              date: data.date?.toDate(),
            } as Order;
          })
        )
      )
      .subscribe((orders: Order[]) => {
        this.groupedOrders = this.groupOrdersByDate(orders);
        this.allDates = this.getSortedDates(this.groupedOrders);
        this.visibleDates = this.allDates.slice(0, this.INITIAL_DATES_TO_SHOW);

        // Calcular estadísticas
        this.calculateStats(orders);

        // Por defecto, seleccionar la fecha más reciente si existe
        if (this.allDates.length > 0) {
          this.selectedDate = this.allDates[0];
        }
      });
  }

  private groupOrdersByDate(orders: Order[]): Map<string, Order[]> {
    const grouped = new Map<string, Order[]>();

    orders.forEach((order) => {
      const date = order.date.toLocaleDateString();
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(order);
    });

    // Ordenar los pedidos dentro de cada fecha por hora (más recientes primero)
    grouped.forEach((ordersForDate) => {
      ordersForDate.sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    return grouped;
  }

  private getSortedDates(groupedOrders: Map<string, Order[]>): string[] {
    return Array.from(groupedOrders.keys()).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime(); // Orden descendente
    });
  }

  // Método para obtener los pedidos de una fecha, aplicando filtros si es necesario
  getOrdersForDate(date: string): Order[] {
    const orders = this.groupedOrders.get(date) || [];
    if (this.showOnlyWithReadyItems) {
      return orders.filter(order => this.hasReadyItems(order));
    }
    return orders;
  }

  loadMoreDates() {
    const currentLength = this.visibleDates.length;
    const nextDates = this.allDates.slice(
      currentLength,
      currentLength + this.DATES_TO_LOAD_MORE
    );
    this.visibleDates.push(...nextDates);
  }

  navigateToOrders() {
    this.router.navigate(['/pedidos']);
  }

  navigateToKitchen() {
    this.router.navigate(['/cocina']);
  }

  // Métodos para verificar estados de platos
  hasReadyItems(order: Order): boolean {
    return order.items.some(item =>
      (item.status || 'En espera') === 'Realizado' &&
      order.status !== 'Realizado'
    );
  }

  getItemStatusClass(status: string): string {
    switch(status) {
      case 'En espera':
        return 'bg-yellow-50 border-l-2 border-yellow-300';
      case 'En preparación':
        return 'bg-blue-50 border-l-2 border-blue-300';
      case 'Realizado':
        return 'bg-green-50 border-l-2 border-green-300';
      default:
        return 'bg-gray-50 border-l-2 border-gray-300';
    }
  }

  // Métodos para el dashboard

  private calculateStats(orders: Order[]) {
    // Resetear las estadísticas
    this.statsMap = new Map();
    this.overallStats = this.createEmptyStats();

    // Calcular estadísticas por fecha
    orders.forEach(order => {
      const dateString = order.date.toLocaleDateString();

      // Inicializar estadísticas si no existen para esta fecha
      if (!this.statsMap.has(dateString)) {
        this.statsMap.set(dateString, this.createEmptyStats());
      }

      const dateStats = this.statsMap.get(dateString)!;
      const overallStats = this.overallStats;

      // Actualizar estadísticas de la fecha y globales
      this.updateStats(dateStats, order);
      this.updateStats(overallStats, order);
    });

    // Finalizar cálculos
    this.finalizeStats(this.overallStats);
    this.statsMap.forEach(stats => this.finalizeStats(stats));
  }

  private createEmptyStats(): DashboardStats {
    return {
      totalRevenue: 0,
      orderCount: 0,
      totalItems: 0,
      averageTicket: 0,
      topProducts: [],
      statusCounts: { 'En espera': 0, 'En preparación': 0, 'Realizado': 0 }
    };
  }

  private updateStats(stats: DashboardStats, order: Order) {
    // Actualizar contadores básicos
    stats.totalRevenue += order.total;
    stats.orderCount += 1;

    // Contar por estado
    if (order.status) {
      stats.statusCounts[order.status] = (stats.statusCounts[order.status] || 0) + 1;
    }

    // Procesar items
    const productMap = new Map<string, {name: string, quantity: number, revenue: number}>();

    order.items.forEach(item => {
      stats.totalItems += item.quantity;

      const uniqueItemName = item.selectedOption
        ? `${item.name} (${item.selectedOption})`
        : item.name;

      if (!productMap.has(uniqueItemName)) {
        productMap.set(uniqueItemName, {
          name: uniqueItemName,
          quantity: 0,
          revenue: 0
        });
      }

      const product = productMap.get(uniqueItemName)!;
      product.quantity += item.quantity;
      product.revenue += item.price * item.quantity;
    });

    // Actualizar lista de productos
    productMap.forEach(product => {
      const existingIndex = stats.topProducts.findIndex(p => p.name === product.name);

      if (existingIndex >= 0) {
        stats.topProducts[existingIndex].quantity += product.quantity;
        stats.topProducts[existingIndex].revenue += product.revenue;
      } else {
        stats.topProducts.push(product);
      }
    });
  }

  private finalizeStats(stats: DashboardStats) {
    // Calcular promedio de ticket
    if (stats.orderCount > 0) {
      stats.averageTicket = stats.totalRevenue / stats.orderCount;
    }

    // Ordenar productos más vendidos por cantidad
    stats.topProducts.sort((a, b) => b.quantity - a.quantity);

    // Limitar a los N productos más vendidos
    stats.topProducts = stats.topProducts.slice(0, this.TOP_PRODUCTS_COUNT);
  }

  // Métodos de ayuda para la vista

  getSelectedStats(): DashboardStats {
    if (this.selectedDate === 'overall') {
      return this.overallStats;
    }
    return this.statsMap.get(this.selectedDate) || this.createEmptyStats();
  }

  onDateChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedDate = select.value;
  }

  getStatusPercentage(status: string): number {
    const stats = this.getSelectedStats();
    const total = stats.orderCount;
    if (total === 0) return 0;

    const count = stats.statusCounts[status] || 0;
    return Math.round((count / total) * 100);
  }

  getColor(index: number): string {
    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    return colors[index % colors.length];
  }
}
