// src/app/pages/reports/reports.component.ts
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, query, where, orderBy, limit, getDoc, doc } from '@angular/fire/firestore';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { InventoryItem } from '../../models/data.model';

// Registrar los componentes necesarios de Chart.js
Chart.register(...registerables);

@Component({
    selector: 'app-reports',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reports.component.html',
    styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit {
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Exponer Math para usar en el template
  Math = Math;

  // Referencias a los canvas para las gráficas
  @ViewChild('salesByDayChart') salesByDayChartRef!: ElementRef;
  @ViewChild('paymentMethodsChart') paymentMethodsChartRef!: ElementRef;
  @ViewChild('topDishesChart') topDishesChartRef!: ElementRef;
  @ViewChild('salesByHourChart') salesByHourChartRef!: ElementRef;
  @ViewChild('categoriesChart') categoriesChartRef!: ElementRef;
  @ViewChild('inventoryChart') inventoryChartRef!: ElementRef;

  // Variables para filtros
  startDate: string = '';
  endDate: string = '';
  selectedPeriod: string = 'thisMonth';

  // Variables para paginación
  currentPage: number = 1;
  pageSize: number = 10;

  // Datos del reporte
  reportData = {
    totalSales: 0,
    salesGrowth: 0,
    totalOrders: 0,
    totalOrderCount: 0,
    totalItems: 0,
    uniqueDishes: 0,
    averageTicket: 0,
    topPaymentMethod: '',
    topPaymentMethodPercentage: 0,
    salesByDay: [] as any[],
    paymentMethods: [] as any[],
    topDishes: [] as any[],
    salesByHour: [] as any[],
    categories: [] as any[],
    inventoryItems: [] as any[],
    recentOrders: [] as any[]
  };

  // Referencias a las instancias de gráficos
  charts: { [key: string]: Chart } = {};

  ngOnInit() {
    this.updateDateRange();
    this.loadReportData();
  }

  // Actualizar el rango de fechas según el periodo seleccionado
  updateDateRange() {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (this.selectedPeriod) {
      case 'today':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 59, 59);
        break;
      case 'thisWeek':
        // Comenzar desde el lunes de esta semana
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Si es domingo (0), restar 6 días, sino restar dayOfWeek - 1
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'lastWeek':
        // Semana pasada (lunes a domingo)
        const lastWeekDay = today.getDay();
        const lastWeekDiff = lastWeekDay === 0 ? 6 : lastWeekDay - 1;
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - lastWeekDiff - 7);
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - lastWeekDiff - 1, 23, 59, 59);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case 'custom':
        // Usar las fechas seleccionadas manualmente
        return;
    }

    this.startDate = this.formatDateForInput(start);
    this.endDate = this.formatDateForInput(end);
  }

  // Formatear fecha para input type="date"
  formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Cargar los datos del reporte
  async loadReportData() {
    try {
      // Mostrar loading
      Swal.fire({
        title: 'Cargando datos',
        text: 'Por favor espere...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // Convertir las fechas de string a Date
      const startDateObj = this.startDate ? new Date(this.startDate) : new Date();
      const endDateObj = this.endDate ? new Date(this.endDate + 'T23:59:59') : new Date();

      // Obtener pedidos en el rango de fechas
      const ordersData = await this.fetchOrders(startDateObj, endDateObj);

      // Calcular métricas
      this.calculateMetrics(ordersData);

      // Obtener datos del inventario
      await this.fetchInventoryData();

      // Renderizar gráficos cuando los datos estén listos
      setTimeout(() => {
        this.renderCharts();
        Swal.close();
      }, 500);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      Swal.fire('Error', 'No se pudieron cargar los datos del reporte', 'error');
    }
  }

  // Obtener pedidos de Firestore
  async fetchOrders(startDate: Date, endDate: Date) {
    const ordersCollection = collection(this.firestore, 'orders');

    // Crear la consulta para pedidos Cobrados
    const ordersQuery = query(
      ordersCollection,
      where('status', '==', 'Cobrado'),
      where('paidAt', '>=', startDate),
      where('paidAt', '<=', endDate),
      orderBy('paidAt', 'desc')
    );

    const ordersSnapshot = await getDocs(ordersQuery);

    // Procesar los datos
    const orders: any[] = [];

    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        ...data,
        paidAt: data['paidAt']?.toDate() || new Date(),
        date: data['date']?.toDate() || new Date()
      });
    });

    // Cargar los pagos para cada pedido
    for (const order of orders) {
      const paymentsCollection = collection(this.firestore, `orders/${order.id}/payments`);
      const paymentsSnapshot = await getDocs(paymentsCollection);

      const payments: any[] = [];
      paymentsSnapshot.forEach(doc => {
        const data = doc.data();
        payments.push({
          id: doc.id,
          ...data,
          timestamp: data['timestamp']?.toDate() || new Date()
        });
      });

      order.payments = payments;
    }

    return orders;
  }

  // Calcular métricas basadas en los pedidos
  calculateMetrics(orders: any[]) {
    // Resetear datos
    const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;

    // Calcular items totales y platos únicos
    let allItems: any[] = [];
    let uniqueDishIds = new Set();

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        allItems = allItems.concat(order.items);
        order.items.forEach((item: any) => {
          if (item.id) uniqueDishIds.add(item.id);
        });
      }
    });

    const totalItems = allItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Método de pago más popular
    const paymentMethodCount: { [key: string]: number } = {};
    const paymentMethodAmount: { [key: string]: number } = {};

    orders.forEach(order => {
      const method = order.paymentMethod || 'Desconocido';
      paymentMethodCount[method] = (paymentMethodCount[method] || 0) + 1;
      paymentMethodAmount[method] = (paymentMethodAmount[method] || 0) + (order.total || 0);
    });

    let topMethod = 'Desconocido';
    let topMethodCount = 0;

    Object.entries(paymentMethodCount).forEach(([method, count]) => {
      if (count > topMethodCount) {
        topMethod = method;
        topMethodCount = count;
      }
    });

    // Datos para gráficos

    // 1. Ventas por día
    const salesByDay = this.groupOrdersByDay(orders);

    // 2. Métodos de pago
    const paymentMethods = Object.entries(paymentMethodAmount).map(([method, amount]) => ({
      method,
      amount,
      percentage: orders.length > 0 ? amount / totalSales : 0
    }));

    // 3. Top platos
    const dishesCount: { [key: string]: { name: string, count: number, total: number } } = {};

    allItems.forEach(item => {
      const id = item.id || 'unknown';
      const quantity = item.quantity || 1;
      const price = item.price || 0;

      if (!dishesCount[id]) {
        dishesCount[id] = {
          name: item.name || 'Desconocido',
          count: 0,
          total: 0
        };
      }

      dishesCount[id].count += quantity;
      dishesCount[id].total += quantity * price;
    });

    const topDishes = Object.values(dishesCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 4. Ventas por hora
    const salesByHour = this.groupOrdersByHour(orders);

    // 5. Categorías
    const categories = this.groupOrdersByCategory(allItems);

    // Pedidos recientes para la tabla
    const recentOrders = orders.slice(0, this.pageSize).map(order => ({
      id: order.id,
      date: order.paidAt || order.date,
      customerName: order.customer?.name || 'Cliente no registrado',
      itemCount: order.items?.length || 0,
      total: order.total || 0,
      paymentMethod: order.paymentMethod || 'Desconocido',
      paymentDetails: this.getPaymentDetails(order)
    }));

    // Actualizar datos del reporte
    this.reportData = {
      totalSales,
      salesGrowth: this.calculateGrowth(totalSales, 0), // Placeholder hasta que implementemos comparación con periodo anterior
      totalOrders,
      totalOrderCount: totalOrders,
      totalItems,
      uniqueDishes: uniqueDishIds.size,
      averageTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
      topPaymentMethod: topMethod,
      topPaymentMethodPercentage: totalOrders > 0 ? topMethodCount / totalOrders : 0,
      salesByDay,
      paymentMethods,
      topDishes,
      salesByHour,
      categories,
      inventoryItems: [],
      recentOrders
    };
  }

  // Agrupar pedidos por día
  groupOrdersByDay(orders: any[]) {
    const dailySales: { [key: string]: number } = {};

    orders.forEach(order => {
      const date = order.paidAt || order.date;
      const dateStr = date.toISOString().split('T')[0];

      dailySales[dateStr] = (dailySales[dateStr] || 0) + (order.total || 0);
    });

    // Convertir a array y ordenar por fecha
    return Object.entries(dailySales)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Agrupar pedidos por hora
  groupOrdersByHour(orders: any[]) {
    const hourlySales: number[] = Array(24).fill(0);

    orders.forEach(order => {
      const date = order.paidAt || order.date;
      const hour = date.getHours();

      hourlySales[hour] += (order.total || 0);
    });

    return hourlySales.map((amount, hour) => ({
      hour: `${hour}:00`,
      amount
    }));
  }

  // Agrupar por categoría
  groupOrdersByCategory(items: any[]) {
    const categorySales: { [key: string]: number } = {};

    items.forEach(item => {
      // Usar la propiedad categoryName que ya está disponible en tus datos
      let category = item.categoryName || 'Sin categoría';

      const quantity = item.quantity || 1;
      const price = item.price || 0;
      const total = quantity * price;

      // Acumular ventas por categoría
      categorySales[category] = (categorySales[category] || 0) + total;
    });

    // Convertir a array para gráfico
    return Object.entries(categorySales)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  // Calcular crecimiento porcentual
  calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  // Obtener detalles de pago formateados
  getPaymentDetails(order: any): string {
    if (!order.paymentMethod) return '';

    if (order.paymentMethod === 'Efectivo' && order.amountReceived) {
      return `Recibido: $${order.amountReceived.toFixed(2)}, Cambio: $${(order.amountReceived - order.total).toFixed(2)}`;
    }
    else if (order.paymentMethod === 'Transferencia' && order.bankName) {
      return `Banco: ${order.bankName}, Código: ${order.transactionCode || 'N/A'}`;
    }
    else if (['Ahorita', 'De una'].includes(order.paymentMethod) && order.transactionCode) {
      return `Código: ${order.transactionCode}`;
    }

    return '';
  }

  // Obtener datos del inventario
  async fetchInventoryData() {
    try {
      const inventoryCollection = collection(this.firestore, 'inventory');
      const inventorySnapshot = await getDocs(inventoryCollection);

      const inventoryItems: any[] = [];

      inventorySnapshot.forEach(doc => {
        const data = doc.data();
        inventoryItems.push({
          id: doc.id,
          name: data['name'] || 'Sin nombre',
          quantity: data['quantity'] || 0,
          unit: data['unit'] || 'unidad',
          minStock: data['minStock'] || 0,
          category: data['category'] || 'Sin categoría',
          lastUpdated: data['updatedAt']?.toDate() || new Date()
        });
      });

      // Ordenar por cantidad disponible (de menor a mayor)
      this.reportData.inventoryItems = inventoryItems.sort((a, b) => a.quantity - b.quantity);
    } catch (error) {
      console.error('Error al obtener datos de inventario:', error);
    }
  }

  // Renderizar los gráficos
  renderCharts() {
    // Destruir gráficos previos si existen
    Object.values(this.charts).forEach(chart => chart.destroy());

    // 1. Gráfico de ventas por día
    this.renderSalesByDayChart();

    // 2. Gráfico de métodos de pago
    this.renderPaymentMethodsChart();

    // 3. Gráfico de platos más vendidos
    this.renderTopDishesChart();

    // 4. Gráfico de ventas por hora
    this.renderSalesByHourChart();

    // 5. Gráfico de categorías
    this.renderCategoriesChart();

    // 6. Gráfico de inventario
    this.renderInventoryChart();
  }

  // Gráfico de ventas por día
  renderSalesByDayChart() {
    if (!this.salesByDayChartRef || this.reportData.salesByDay.length === 0) return;

    const canvas = this.salesByDayChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    const labels = this.reportData.salesByDay.map(day => {
      const date = new Date(day.date);
      return date.toLocaleDateString();
    });

    const data = this.reportData.salesByDay.map(day => day.amount);

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas ($)',
          data: data,
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: false
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `$ ${context.raw}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return '$ ' + value;
              }
            }
          }
        }
      }
    };

    this.charts['salesByDay'] = new Chart(ctx, config);
  }

  // Gráfico de métodos de pago
  renderPaymentMethodsChart() {
    if (!this.paymentMethodsChartRef || this.reportData.paymentMethods.length === 0) return;

    const canvas = this.paymentMethodsChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    const labels = this.reportData.paymentMethods.map(method => method.method);
    const data = this.reportData.paymentMethods.map(method => method.amount);

    // Colores para gráfico de dona
    const backgroundColor = [
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 99, 132, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)'
    ];

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColor,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right'
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.raw as number;
                const total = context.chart.data.datasets[0].data.reduce((a: any, b: any) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: $${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.charts['paymentMethods'] = new Chart(ctx, config);
  }

  // Gráfico de platos más vendidos
  renderTopDishesChart() {
    if (!this.topDishesChartRef || this.reportData.topDishes.length === 0) return;

    const canvas = this.topDishesChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    const labels = this.reportData.topDishes.map(dish => dish.name);
    const data = this.reportData.topDishes.map(dish => dish.count);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cantidad',
          data: data,
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    };

    this.charts['topDishes'] = new Chart(ctx, config);
  }

  // Gráfico de ventas por hora
  renderSalesByHourChart() {
    if (!this.salesByHourChartRef || this.reportData.salesByHour.length === 0) return;

    const canvas = this.salesByHourChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    const labels = this.reportData.salesByHour.map(item => item.hour);
    const data = this.reportData.salesByHour.map(item => item.amount);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas ($)',
          data: data,
          backgroundColor: 'rgba(153, 102, 255, 0.8)',
          borderColor: 'rgb(153, 102, 255)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `$ ${context.raw}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return '$ ' + value;
              }
            }
          }
        }
      }
    };

    this.charts['salesByHour'] = new Chart(ctx, config);
  }

  // Gráfico de categorías
  // Reemplazar la implementación actual con esta
  renderCategoriesChart() {
    if (!this.categoriesChartRef || this.reportData.categories.length === 0) return;

    const canvas = this.categoriesChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    // Limitamos a las top 7 categorías para mejor visualización
    // y agrupamos el resto como "Otras"
    let categories = [...this.reportData.categories];

    if (categories.length > 7) {
      const topCategories = categories.slice(0, 6);
      const otherCategories = categories.slice(6);

      // Calcular el total para "Otras"
      const otherTotal = otherCategories.reduce((sum, cat) => sum + cat.amount, 0);

      // Crear una categoría para "Otras"
      if (otherTotal > 0) {
        topCategories.push({
          category: 'Otras',
          amount: otherTotal
        });
      }

      categories = topCategories;
    }

    const labels = categories.map(cat => cat.category);
    const data = categories.map(cat => cat.amount);

    // Colores más atractivos para el gráfico
    const backgroundColor = [
      'rgba(54, 162, 235, 0.85)',   // Azul
      'rgba(255, 99, 132, 0.85)',   // Rosa
      'rgba(255, 206, 86, 0.85)',   // Amarillo
      'rgba(75, 192, 192, 0.85)',   // Verde azulado
      'rgba(153, 102, 255, 0.85)',  // Morado
      'rgba(255, 159, 64, 0.85)',   // Naranja
      'rgba(119, 136, 153, 0.85)'   // Gris azulado
    ];

    const config: ChartConfiguration = {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColor,
          borderWidth: 1,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              padding: 15,
              usePointStyle: true,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.raw as number;
                const total = context.chart.data.datasets[0].data.reduce((a: any, b: any) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: $${value.toFixed(2)} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    this.charts['categories'] = new Chart(ctx, config);
  }
  // Gráfico de inventario
  renderInventoryChart() {
    if (!this.inventoryChartRef || this.reportData.inventoryItems.length === 0) return;

    // Tomar los 10 items con menos stock
    const lowStockItems = this.reportData.inventoryItems
      .slice()
      .sort((a, b) => (a.quantity / (a.minStock || 1)) - (b.quantity / (b.minStock || 1)))
      .slice(0, 10);

    const canvas = this.inventoryChartRef.nativeElement;
    const ctx = canvas.getContext('2d');

    const labels = lowStockItems.map(item => item.name);
    const data = lowStockItems.map(item => item.quantity);
    const minStockData = lowStockItems.map(item => item.minStock);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Stock actual',
            data: data,
            backgroundColor: 'rgba(75, 192, 192, 0.8)',
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1
          },
          {
            label: 'Stock mínimo',
            data: minStockData,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
            type: 'line'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    };

    this.charts['inventory'] = new Chart(ctx, config);
  }

  // Cambiar página en la tabla de pedidos
  changePage(page: number) {
    if (page < 1) return;

    // Actualizar página actual
    this.currentPage = page;

    // Implementar la paginación real obteniendo más datos
    this.fetchPagedOrders();
  }

  // Obtener pedidos paginados
  async fetchPagedOrders() {
    try {
      const startDateObj = this.startDate ? new Date(this.startDate) : new Date();
      const endDateObj = this.endDate ? new Date(this.endDate + 'T23:59:59') : new Date();

      const ordersCollection = collection(this.firestore, 'orders');

      // Crear la consulta con paginación
      const ordersQuery = query(
        ordersCollection,
        where('status', '==', 'Cobrado'),
        where('paidAt', '>=', startDateObj),
        where('paidAt', '<=', endDateObj),
        orderBy('paidAt', 'desc'),
        limit(this.pageSize)
        // Para implementar una paginación real, necesitaríamos usar startAfter() con un cursor
      );

      const ordersSnapshot = await getDocs(ordersQuery);

      // Procesar los datos
      const orders: any[] = [];

      ordersSnapshot.forEach(doc => {
        const data = doc.data();
        orders.push({
          id: doc.id,
          ...data,
          paidAt: data['paidAt']?.toDate() || new Date(),
          date: data['date']?.toDate() || new Date()
        });
      });

      // Actualizar solo los pedidos recientes en reportData
      this.reportData.recentOrders = orders.map(order => ({
        id: order.id,
        date: order.paidAt || order.date,
        customerName: order.customer?.name || 'Cliente no registrado',
        itemCount: order.items?.length || 0,
        total: order.total || 0,
        paymentMethod: order.paymentMethod || 'Desconocido',
        paymentDetails: this.getPaymentDetails(order)
      }));
    } catch (error) {
      console.error('Error al obtener pedidos paginados:', error);
    }
  }

  // Ver detalles de un pedido
  async viewOrderDetails(orderId: string) {
    try {
      const orderRef = doc(this.firestore, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);

      if (!orderDoc.exists()) {
        Swal.fire('Error', 'No se encontró el pedido', 'error');
        return;
      }

      const orderData = orderDoc.data();

      // Obtener los pagos asociados
      const paymentsCollection = collection(this.firestore, `orders/${orderId}/payments`);
      const paymentsSnapshot = await getDocs(paymentsCollection);

      const payments: any[] = [];
      paymentsSnapshot.forEach(doc => {
        const data = doc.data();
        payments.push({
          id: doc.id,
          ...data,
          timestamp: data['timestamp']?.toDate()
        });
      });

      // Crear HTML para mostrar en el modal
      let html = `
        <div class="text-left">
          <h2 class="text-lg font-semibold mb-2">Pedido #${orderId.substring(0, 8)}</h2>
          <p><strong>Cliente:</strong> ${orderData['customer']?.name || 'Sin nombre'}</p>
          <p><strong>Fecha:</strong> ${orderData['paidAt']?.toDate().toLocaleString() || orderData['date']?.toDate().toLocaleString()}</p>
          <p><strong>Total:</strong> $${orderData['total']?.toFixed(2) || '0.00'}</p>
          <p><strong>Estado:</strong> ${orderData['status'] || 'Desconocido'}</p>
          <p><strong>Método de pago:</strong> ${orderData['paymentMethod'] || 'Desconocido'}</p>
          
          <h3 class="text-md font-semibold mt-4 mb-2">Detalle de artículos:</h3>
          <ul class="space-y-1">
      `;

      // Agregar items
      if (orderData['items'] && Array.isArray(orderData['items'])) {
        orderData['items'].forEach((item: any) => {
          html += `
            <li>${item.quantity || 1} x ${item.name || 'Item sin nombre'} - $${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</li>
          `;
        });
      } else {
        html += `<li>No hay items disponibles</li>`;
      }

      html += `</ul>`;

      // Agregar pagos si existen
      if (payments.length > 0) {
        html += `
          <h3 class="text-md font-semibold mt-4 mb-2">Pagos Cobrados:</h3>
          <ul class="space-y-2">
        `;

        payments.forEach(payment => {
          html += `
            <li class="border-t pt-2">
              <div><strong>${payment.partName || 'Pago'}</strong> - $${payment.amount?.toFixed(2) || '0.00'}</div>
              <div>Método: ${payment.method || 'Desconocido'}</div>
          `;

          // Mostrar detalles específicos según el método
          if (payment.method === 'Efectivo' && payment.amountReceived !== undefined) {
            html += `
              <div>Recibido: $${payment.amountReceived.toFixed(2)}</div>
              <div>Cambio: $${payment.change?.toFixed(2) || '0.00'}</div>
            `;
          }
          else if (payment.method === 'Transferencia' && payment.bankName) {
            html += `
              <div>Banco: ${payment.bankName}</div>
              <div>Código: ${payment.transactionCode || 'No registrado'}</div>
            `;
          }
          else if (['Ahorita', 'De una'].includes(payment.method) && payment.transactionCode) {
            html += `<div>Código: ${payment.transactionCode}</div>`;
          }

          html += `
              <div class="text-xs text-gray-500">${payment.timestamp?.toLocaleString() || 'Fecha desconocida'}</div>
            </li>
          `;
        });

        html += `</ul>`;
      }

      html += `</div>`;

      Swal.fire({
        title: 'Detalles del Pedido',
        html: html,
        width: '600px',
        confirmButtonText: 'Cerrar'
      });
    } catch (error) {
      console.error('Error al obtener detalles del pedido:', error);
      Swal.fire('Error', 'No se pudieron cargar los detalles del pedido', 'error');
    }
  }

  // Exportar datos a Excel
  exportSalesData() {
    try {
      // Crear un array con los datos para Excel
      const exportData = this.reportData.recentOrders.map((order, index) => ({
        'N°': index + 1,
        'Fecha': this.formatDate(order.date),
        'ID Pedido': order.id,
        'Cliente': order.customerName,
        'N° Items': order.itemCount,
        'Total': order.total.toFixed(2),
        'Método de Pago': order.paymentMethod,
        'Detalles': order.paymentDetails
      }));

      // Crear workbook y worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');

      // Ajustar ancho de columnas
      const colWidths = [
        { wch: 5 },   // N°
        { wch: 20 },  // Fecha
        { wch: 15 },  // ID Pedido
        { wch: 25 },  // Cliente
        { wch: 10 },  // N° Items
        { wch: 12 },  // Total
        { wch: 15 },  // Método de Pago
        { wch: 35 }   // Detalles
      ];

      worksheet['!cols'] = colWidths;

      // Generar nombre del archivo
      const dateRange = `${this.formatDate(new Date(this.startDate))} al ${this.formatDate(new Date(this.endDate))}`;
      const fileName = `Reporte_Ventas_${dateRange}.xlsx`;

      // Exportar a Excel
      XLSX.writeFile(workbook, fileName);

      Swal.fire({
        title: 'Exportación exitosa',
        text: `Los datos han sido exportados a "${fileName}"`,
        icon: 'success'
      });
    } catch (error) {
      console.error('Error al exportar datos:', error);
      Swal.fire('Error', 'No se pudieron exportar los datos', 'error');
    }
  }

  // Formatear fecha
  formatDate(date: Date): string {
    if (!date) return '';
    return date.toLocaleDateString();
  }
}