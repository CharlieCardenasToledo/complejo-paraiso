import { Component, inject, OnInit, OnDestroy, signal, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import {
  Firestore,
  doc,
  deleteDoc,
  collection,
  query,
  orderBy,
  Timestamp,
  updateDoc,
  getDoc,
  onSnapshot
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormatDateSpanishPipe } from '../../pipes/format-date-spanish.pipe';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { DishOption, Order, OrderItem } from '../../models/data.model';
import Swal from 'sweetalert2';
import { CashRegisterService } from '../../services/cash-register.service';
import { take } from 'rxjs';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [
        CommonModule,
        FormatDateSpanishPipe,
        FormsModule,
        RouterModule
    ],
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private router = inject(Router);
  private authService = inject(AuthService);
  private cashRegisterService = inject(CashRegisterService);


  // Observables to control visibility based on role
  isAdmin$ = this.authService.isAdmin$;
  isWaiter$ = this.authService.isWaiter$;
  isCook$ = this.authService.isCook$;
  isCashier$ = this.authService.isCashier$;

  // Secciones expandibles
  sectionExpanded = {
    waiting: true,
    preparing: false,
    ready: false,
    served: false,  // Nueva sección
    paid: false
  };

  currentDate: Date = new Date();
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // Para el sonido de notificación
  @ViewChild('notificationSound') notificationSound!: ElementRef<HTMLAudioElement>;

  // Para controlar el sonido y las notificaciones
  soundEnabled: boolean = false;
  notificationsEnabled: boolean = false;
  isFullscreen: boolean = false;

  // Orden seleccionada para detalles
  selectedOrderSignal = signal<Order | null>(null);

  get selectedOrder(): Order | null {
    return this.selectedOrderSignal();
  }

  set selectedOrder(value: Order | null) {
    this.selectedOrderSignal.set(value);
  }

  // Mapa de órdenes agrupadas
  groupedOrders: Map<string, Order[]> = new Map();
  filteredGroupedOrders: Map<string, Order[]> = new Map();

  // Datos de fechas
  visibleDates: string[] = [];
  allDates: string[] = [];

  // Agregar en la clase HomeComponent, junto con las otras propiedades
  selectedDateFilter: string = 'today'; // 'today', 'yesterday', 'week', 'all', 'custom'
  customDate: Date = new Date(); // Para almacenar la fecha personalizada

  // Categorías excluidas
  excludedCategoryIds: string[] = ['JWXmTEO143llfKM5PmkU', 'p4r4p8ofhtPIOrf4M14c', 'UmMtTqxhOZETuKr7tVMd']; // piscina, tienda, heladeria

  // Para la limpieza de suscripciones
  private unsubscribeOrders: any;

  /**
   * Determina si un objeto es una opción de plato
   */
  isObject(option: any): option is DishOption {
    return option !== null && typeof option === 'object' && 'name' in option;
  }
  // Modificar el método getFilteredDates() en home.component.ts
  getFilteredDates(): string[] {
    const today = new Date().toLocaleDateString();

    switch (this.selectedDateFilter) {
      case 'today':
        return this.allDates.filter(date => date === today);
      case 'yesterday': {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toLocaleDateString();
        return this.allDates.filter(date => date === yesterdayString);
      }
      case 'week': {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return this.allDates.filter(date => {
          const dateObj = new Date(date);
          return dateObj >= oneWeekAgo;
        });
      }
      case 'custom': {
        // Convertir customDate a formato localeDateString para comparar
        const customDateString = this.customDate.toLocaleDateString();
        return this.allDates.filter(date => date === customDateString);
      }
      case 'all':
      default:
        return this.allDates;
    }
  }
  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;
    // Resetear la fecha personalizada si no se está usando
    if (filter !== 'custom') {
      this.customDate = new Date(); // Asegurarse de que la fecha personalizada sea la actual
    }
    this.applyDateFilter();

    // Opcional: Mostrar feedback visual
    let mensaje = '';
    switch (filter) {
      case 'today': mensaje = 'Mostrando pedidos de hoy'; break;
      case 'yesterday': mensaje = 'Mostrando pedidos de ayer'; break;
      case 'week': mensaje = 'Mostrando pedidos de la última semana'; break;
      case 'all': mensaje = 'Mostrando todos los pedidos'; break;
      default: break;
    }

    if (mensaje) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        icon: 'info',
        title: mensaje
      });
    }
  }
  // Método para obtener conteos de los distintos estados según el filtro de fecha actual
  // Modify the getStatusCounts method to use the filtered items
  getStatusCounts() {
    // Get items based on current date filter
    const filteredItems = this.extractAllItems();

    const waitingCount = filteredItems.filter(item =>
      (item.status || 'En espera') === 'En espera').length;

    const preparingCount = filteredItems.filter(item =>
      (item.status || 'En espera') === 'En preparación').length;

    const readyCount = filteredItems.filter(item =>
      (item.status || 'En espera') === 'Listos para servir').length;

    const servedCount = this.getServedOrders().length;

    // For paid orders
    let paidCount = 0;
    this.getFilteredDates().forEach(date => {
      paidCount += this.getOrdersForDateAndStatus(date, 'Cobrado').length;
    });

    return {
      waitingCount,
      preparingCount,
      readyCount,
      servedCount,
      paidCount
    };
  }
  // Método para establecer una fecha personalizada
  setCustomDate(dateStr: string): void {
    // Convertir la cadena de fecha a objeto Date
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // Los meses en JavaScript van de 0 a 11
      const day = parseInt(parts[2]);

      this.customDate = new Date(year, month, day);
      this.selectedDateFilter = 'custom';

      // Aplicar el filtro de fecha después de cambiar la selección
      this.applyDateFilter();

      // Mostrar una notificación para confirmar
      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        icon: 'info',
        title: `Mostrando pedidos del ${day}/${month + 1}/${year}`
      });
    } else {
      // Manejo de error si el formato de fecha es incorrecto
      console.error('Formato de fecha incorrecto:', dateStr);
      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        icon: 'error',
        title: 'Formato de fecha inválido'
      });
    }
  }
  /**
   * Obtiene el precio adicional de una opción seleccionada
   */
  getOptionPrice(optionName: string | undefined, item: OrderItem): number {
    if (!optionName) return 0;

    if (item.options && item.options.length > 0) {
      const optionObj = item.options.find(opt =>
        this.isObject(opt) && opt.name === optionName
      );

      if (optionObj && this.isObject(optionObj) && optionObj.price) {
        return optionObj.price;
      }
    }
    return 0;
  }

  /**
   * Cancela un pedido
   */
  async cancelOrder(order: Order): Promise<void> {
    // Verificar permisos
    const isAdmin = await this.isAdmin$.pipe(take(1)).toPromise();
    const isWaiter = await this.isWaiter$.pipe(take(1)).toPromise();

    if (!isAdmin && !isWaiter) {
      Swal.fire({
        icon: 'error',
        title: 'Acceso denegado',
        text: 'No tienes permisos para cancelar pedidos',
        confirmButtonText: 'Entendido'
      });
      return;
    }

    // Verificar si el pedido ya está cobrado
    if (this.isPaid(order)) {
      Swal.fire({
        icon: 'warning',
        title: 'Pedido Cobrado',
        text: 'No se pueden cancelar pedidos que ya han sido cobrados',
        confirmButtonText: 'Entendido'
      });
      return;
    }

    // Confirmar cancelación
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción cancelará el pedido y restaurará el inventario',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No, mantener',
      heightAuto: false
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'Cancelando pedido...',
          text: 'Por favor, espere',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
          heightAuto: false
        });

        // Eliminar el pedido
        const orderRef = doc(this.firestore, `orders/${order.id}`);
        await deleteDoc(orderRef);

        Swal.close();

        Swal.fire({
          icon: 'success',
          title: 'Pedido Cancelado',
          text: 'El pedido ha sido cancelado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        // Recargar pedidos
        this.loadOrders();
      } catch (error) {
        console.error('Error al cancelar pedido:', error);
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo cancelar el pedido. Intente nuevamente.',
          footer: `${error instanceof Error ? error.message : 'Error desconocido'}`,
          heightAuto: false
        });
      }
    }
  }

  /**
   * Calcula el precio total de un ítem incluyendo opciones adicionales
   */
  calculateItemPrice(item: OrderItem): number {
    let basePrice = item.price;

    if (item.selectedOption && item.options && item.options.length > 0) {
      const additionalPrice = this.getOptionPrice(item.selectedOption, item);
      basePrice += additionalPrice;
    }

    return basePrice;
  }

  /**
   * Inicialización del componente
   */
  ngOnInit() {
    this.selectedDateFilter = 'today';

    this.loadOrders();
    this.startAudioResetInterval();

    // Cargar preferencias
    const savedSoundPreference = localStorage.getItem('homeSoundEnabled');
    this.soundEnabled = savedSoundPreference === 'true';

    const savedNotificationPreference = localStorage.getItem('homeNotificationsEnabled');
    this.notificationsEnabled = savedNotificationPreference === 'true';

    // Eventos de fullscreen
    document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));

    // Optimización para tablet
    this.optimizeForTablet();

    // Inicializar audio después de un tiempo para asegurar que el DOM está cargado
    setTimeout(() => {
      if (this.soundEnabled) {
        this.initAudio();
      }
    }, 1000);
  }
  /**
   * Optimiza la experiencia para tablet
   */
  private optimizeForTablet() {
    document.documentElement.style.setProperty('--touch-target-min', '44px');

    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
  }

  handleFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  /**
   * Cargar pedidos desde Firestore con actualización en tiempo real
   */
  loadOrders() {
    try {
      // Mantener un registro de los estados previos 
      const previousOrderStates = new Map<string, string>();
      const previousItemStates = new Map<string, string>();

      // Almacenar estados actuales
      this.groupedOrders.forEach((orders) => {
        orders.forEach(order => {
          previousOrderStates.set(order.id, order.status);

          order.items.forEach(item => {
            const itemKey = `${order.id}-${item.id}-${item.name}-${item.selectedOption || ''}`;
            previousItemStates.set(itemKey, item.status || 'En espera');
          });
        });
      });

      const ordersRef = collection(this.firestore, 'orders');
      const q = query(ordersRef, orderBy('date', 'desc'));

      // Listener en tiempo real
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const orders: Order[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Convertir Timestamp a Date
          const date = data['date'] instanceof Timestamp ? data['date'].toDate() : new Date(data['date']);
          const paidAt = data['paidAt'] instanceof Timestamp ? data['paidAt'].toDate() : data['paidAt'] ? new Date(data['paidAt']) : null;

          const order = {
            id: doc.id,
            ...data,
            date,
            paidAt
          } as Order;

          orders.push(order);

          // Verificar si el estado del pedido cambió a "Listos para servir"
          const previousStatus = previousOrderStates.get(order.id);
          if (previousStatus &&
            previousStatus !== 'Listos para servir' &&
            order.status === 'Listos para servir') {
            // Notificar pedido listo
            this.playNotification();

            Swal.fire({
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 3000,
              timerProgressBar: true,
              icon: 'success',
              title: `Pedido #${order.id.substring(0, 6)} listo para servir`,
              text: `${order.customer.name} - Mesa ${order.tables?.join(', ') || 'N/A'}`
            });
          }

          // Verificar cambios de estado en ítems
          order.items.forEach(item => {
            const itemKey = `${order.id}-${item.id}-${item.name}-${item.selectedOption || ''}`;
            const previousItemStatus = previousItemStates.get(itemKey);
            const currentItemStatus = item.status || 'En espera';

            // Si el ítem cambió a "Listos para servir"
            if (previousItemStatus &&
              previousItemStatus !== 'Listos para servir' &&
              currentItemStatus === 'Listos para servir') {
              // Notificar
              this.playNotification();

              Swal.fire({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                icon: 'success',
                title: `Ítem listo para servir`,
                text: `${item.name} (Pedido de ${order.customer.name})`
              });
            }

            // Actualizar estado previo
            previousItemStates.set(itemKey, currentItemStatus);
          });
        });

        // Dentro del método loadOrders, justo después de agrupar pedidos por fecha
        this.groupedOrders = this.groupOrdersByDate(orders);
        const today = new Date().toLocaleDateString();
        if (this.groupedOrders.has(today)) {
          // Filtrar solo pedidos que no son de tienda
          const comandasHoy = this.groupedOrders.get(today)?.filter(
            order => order.customer && order.customer.name !== 'Cliente de Tienda'
          );
          console.log('Pedidos de comandas hoy:', comandasHoy);
        } else {
          console.log('No hay pedidos para la fecha actual:', today);
        }
        // Actualizar estados previos
        orders.forEach(order => {
          previousOrderStates.set(order.id, order.status);

          order.items.forEach(item => {
            const itemKey = `${order.id}-${item.id}-${item.name}-${item.selectedOption || ''}`;
            previousItemStates.set(itemKey, item.status || 'En espera');
          });
        });

        // Ordenar fechas
        this.allDates = Array.from(this.groupedOrders.keys()).sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateB.getTime() - dateA.getTime();
        });

        // Inicializar fechas visibles
        this.visibleDates = this.allDates;

        // Inicializar pedidos filtrados
        this.applyDateFilter();

        // Forzar detección de cambios
        this.ngZone.run(() => {
          setTimeout(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          }, 0);
        });

      }, (error) => {
        console.error('Error al escuchar pedidos:', error);
        this.showErrorToast('No se pudieron cargar los pedidos');
      });

      // Guardar función unsubscribe
      this.unsubscribeOrders = unsubscribe;
    } catch (error) {
      console.error('Error al configurar el listener de pedidos:', error);
      this.showErrorToast('Error de conexión');
    }
  }
  /**
 * Registra el pago de un pedido como transacción en la caja registradora
 * @param order - Pedido a registrar
 */
  private registerOrderPaymentInCashRegister(order: Order): void {
    if (!order || !order.total || order.syncedWithCashRegister) {
      return;
    }

    // Primero verificar si hay una caja abierta
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register) {
          // No hay caja abierta, mostrar notificación
          Swal.fire({
            icon: 'warning',
            title: 'Caja cerrada',
            text: 'El pedido ha sido cobrado pero no se ha registrado en caja porque no hay una caja abierta.',
            toast: true,
            position: 'top-end',
            showConfirmButton: true,
            confirmButtonText: 'Entendido'
          });
          return;
        }

        // Continuar con el registro del pago
        const paymentMethod = order.paymentMethod || 'efectivo';

        // Formatear descripción
        const tableInfo = order.tables && order.tables.length > 0
          ? `Mesa ${order.tables.join(', ')}`
          : 'Sin mesa';
        const description = `Pago de orden #${order.id.substring(0, 6)} - ${order.customer.name} - ${tableInfo}`;

        // Registrar el pago en la caja
        this.cashRegisterService.registerPayment({
          orderId: order.id,
          amount: order.total,
          paymentMethod: paymentMethod,
          description: description
        }).subscribe({
          next: (success) => {
            if (success) {
              console.log(`Pago registrado automáticamente en caja: Orden ${order.id}`);

              // Marcar el pedido como sincronizado con la caja
              const orderRef = doc(this.firestore, `orders/${order.id}`);
              updateDoc(orderRef, {
                syncedWithCashRegister: true,
                cashRegisterId: register.id
              }).catch(error => console.error('Error al marcar pedido como sincronizado:', error));

              // Mostrar notificación de éxito
              Swal.fire({
                icon: 'success',
                title: 'Pago registrado',
                text: `El pago del pedido se ha registrado automáticamente en caja`,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
              });
            } else {
              console.error(`No se pudo registrar el pago en caja: Orden ${order.id}`);

              // Mostrar notificación de error
              Swal.fire({
                icon: 'error',
                title: 'Error en registro',
                text: 'No se pudo registrar el pago automáticamente en caja',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
              });
            }
          },
          error: (error) => {
            console.error('Error al registrar pago en caja:', error);

            // Mostrar notificación de error
            Swal.fire({
              icon: 'error',
              title: 'Error en registro',
              text: 'Ocurrió un error al registrar el pago en caja',
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 3000
            });
          }
        });
      },
      error: (error) => {
        console.error('Error al verificar estado de caja:', error);

        // Mostrar notificación de error
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo verificar el estado de la caja',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  }

  syncPaidOrdersWithCashRegister(): void {
    // Evitar propagación del evento si viene de un botón
    if (event) {
      event.stopPropagation();
    }

    Swal.fire({
      title: '¿Sincronizar pedidos cobrados?',
      text: 'Esta acción registrará en la caja todos los pedidos cobrados que no hayan sido sincronizados previamente.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, sincronizar',
      cancelButtonText: 'Cancelar',
      heightAuto: false
    }).then((result) => {
      if (result.isConfirmed) {
        // Mostrar indicador de carga
        Swal.fire({
          title: 'Sincronizando',
          text: 'Procesando pedidos cobrados...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
          heightAuto: false
        });

        // Recolectar todos los pedidos cobrados no sincronizados
        const paidOrders: Order[] = [];

        this.allDates.forEach(date => {
          const ordersForDate = this.groupedOrders.get(date) || [];

          ordersForDate.forEach(order => {
            if (order.status === 'Cobrado' &&
              order.paidAt &&
              !order.syncedWithCashRegister &&
              order.customer &&
              order.customer.name !== 'Cliente de Tienda') {
              paidOrders.push(order);
            }
          });
        });

        if (paidOrders.length === 0) {
          Swal.fire({
            icon: 'info',
            title: 'Sin pedidos para sincronizar',
            text: 'Todos los pedidos cobrados ya están sincronizados con la caja.',
            confirmButtonText: 'Entendido',
            heightAuto: false
          });
          return;
        }

        // Usar el servicio de caja para sincronizar pedidos uno por uno
        const processOrder = (index: number) => {
          if (index >= paidOrders.length) {
            // Hemos terminado
            Swal.close();
            Swal.fire({
              icon: 'success',
              title: 'Sincronización completada',
              text: `Se han sincronizado ${paidOrders.length} pedidos con la caja.`,
              confirmButtonText: 'Entendido',
              heightAuto: false
            });
            return;
          }

          const order = paidOrders[index];
          this.registerOrderPaymentInCashRegister(order);

          // Continuar con el siguiente pedido después de un breve retraso
          setTimeout(() => {
            processOrder(index + 1);
          }, 500);
        };

        // Comenzar procesamiento
        processOrder(0);
      }
    });
  }
  // When applying the date filter, make sure to reload displayed data
  applyDateFilter(): void {
    const filteredDates = this.getFilteredDates();
    this.filteredGroupedOrders = new Map();

    // If no dates filtered but dates available, we're filtering by a date with no orders
    if (filteredDates.length === 0 && this.allDates.length > 0) {
      console.log('No hay pedidos para la fecha seleccionada');
      // No asignar nada a filteredGroupedOrders para mostrar "No hay pedidos"
    } else {
      filteredDates.forEach(date => {
        if (this.groupedOrders.has(date)) {
          // Filtrar pedidos de tienda al aplicar el filtro
          const filteredOrders = this.groupedOrders.get(date)!.filter(
            order => order.customer && order.customer.name !== 'Cliente de Tienda'
          );

          if (filteredOrders.length > 0) {
            this.filteredGroupedOrders.set(date, filteredOrders);
          }
        }
      });
    }
    // Make sure to update any displayed counts
    const statusCounts = this.getStatusCounts();
    // Force change detection
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  /**
   * Muestra un toast de error
   */
  private showErrorToast(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: message,
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  }

  /**
   * Limpia listeners al destruir
   */
  ngOnDestroy() {
    if (this.unsubscribeOrders) {
      this.unsubscribeOrders();
    }

    if (this.audioResetInterval) {
      clearInterval(this.audioResetInterval);
    }

    document.removeEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
  }
  /**
 * Verifica si todos los ítems de un pedido están servidos
 * @param order - Pedido a verificar
 * @returns true si todos los ítems están servidos, false en caso contrario
 */
  areAllItemsServed(order: Order): boolean {
    if (!order || !order.items || order.items.length === 0) {
      return false;
    }

    // Verificar que todos los ítems tengan estado "Servido"
    return order.items.every(item => item.status === 'Servido');
  }

  /**
   * Verifica si un ítem es de categoría especial
   */
  isSpecialCategory(item: OrderItem): boolean {
    return this.excludedCategoryIds.includes(item.categoryId || '');
  }

  /**
   * Marca un ítem como listo
   */
  async markItemAsReady(item: OrderItem, orderId: string) {
    try {
      const orderRef = doc(this.firestore, `orders/${orderId}`);
      const docSnapshot = await getDoc(orderRef);

      if (docSnapshot.exists()) {
        const orderData = docSnapshot.data() as any;
        const items = orderData.items || [];

        // Actualizar el ítem específico
        const updatedItems = items.map((orderItem: any) => {
          if (orderItem.id === item.id &&
            orderItem.name === item.name &&
            orderItem.selectedOption === item.selectedOption) {
            return {
              ...orderItem,
              status: 'Servido'
            };
          }
          return orderItem;
        });

        // Actualizar en Firestore
        await updateDoc(orderRef, { items: updatedItems });

        // Actualizar estado general
        await this.updateOrderStatusIfNeeded(orderId);

        // Actualización local del modal
        this.ngZone.run(() => {
          if (this.selectedOrder && this.selectedOrder.id === orderId) {
            const currentOrder = { ...this.selectedOrder };

            // Actualizar los items
            currentOrder.items = currentOrder.items.map(orderItem => {
              if (orderItem.id === item.id &&
                orderItem.name === item.name &&
                orderItem.selectedOption === item.selectedOption) {
                return {
                  ...orderItem,
                  status: 'Servido'
                };
              }
              return orderItem;
            });

            // Actualizar signal
            this.selectedOrderSignal.set(currentOrder);

            setTimeout(() => {
              this.cdr.markForCheck();
              this.cdr.detectChanges();
            }, 0);
          }
        });

        this.playNotification();

        // Notificación
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          icon: 'success',
          title: `${item.name} está listo para servir`
        });

        // Recargar pedidos
        this.loadOrders();
      }
    } catch (error) {
      console.error('Error al marcar ítem como listo:', error);
      this.showErrorToast('No se pudo actualizar el estado del ítem');
    }
  }

  /**
   * Muestra detalles de un pedido
   */
  viewOrderDetails(order: Order | null) {
    if (order) {
      this.selectedOrderSignal.set(order);
    } else {
      // Opcional: mostrar un mensaje si la orden no existe
      Swal.fire({
        icon: 'warning',
        title: 'Pedido no encontrado',
        text: 'No se pudo encontrar el pedido seleccionado',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  }


  /**
   * Cierra el modal de detalles
   */
  closeOrderDetails() {
    this.selectedOrderSignal.set(null);
  }

  /**
   * Actualiza el estado general del pedido
   */
  private async updateOrderStatusIfNeeded(orderId: string) {
    try {
      const orderRef = doc(this.firestore, `orders/${orderId}`);
      const docSnapshot = await getDoc(orderRef);

      if (docSnapshot.exists()) {
        const orderData = docSnapshot.data() as any;
        const items = orderData.items || [];

        // Verificar estados
        const allItemsStatuses = items.map((item: any) => item.status || 'En espera');

        // Si todos los ítems están "Listos para servir", actualizar el pedido completo
        if (allItemsStatuses.every((status: string) => status === 'Listos para servir')) {
          await updateDoc(orderRef, { status: 'Listos para servir' });
          return;
        }

        // Si todos los ítems están en "En preparación" o "Listos para servir", pero no todos listos
        if (allItemsStatuses.every((status: string) =>
          status === 'Listos para servir' || status === 'En preparación')) {
          await updateDoc(orderRef, { status: 'En preparación' });
          return;
        }

        // Si hay al menos un ítem en espera, el pedido está en espera
        if (allItemsStatuses.some((status: string) => status === 'En espera')) {
          await updateDoc(orderRef, { status: 'En espera' });
        }
      }
    } catch (error) {
      console.error('Error al actualizar estado general:', error);
    }
  }

  /**
   * Verifica si un pedido está pagado
   */
  isPaid(order: Order): boolean {
    return !!order.paidAt;
  }

  /**
   * Agrupa los pedidos por fecha
   */
  private groupOrdersByDate(orders: Order[]): Map<string, Order[]> {
    const grouped = new Map<string, Order[]>();

    orders.forEach((order) => {
      const date = order.date.toLocaleDateString();
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(order);
    });

    // Ordenar por hora
    grouped.forEach((ordersForDate) => {
      ordersForDate.sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    return grouped;
  }

  /**
   * Obtiene los pedidos para una fecha y estado específicos
   */
  getOrdersForDateAndStatus(date: string, status: string): Order[] {
    if (status === 'Cobrado') {
      let allPaidOrders: Order[] = [];

      if (this.selectedDateFilter !== 'today' && this.selectedDateFilter !== 'custom') {
        this.getFilteredDates().forEach(filteredDate => {
          const ordersForDate = this.filteredGroupedOrders.get(filteredDate) || [];
          // Filtrar los pedidos de tienda
          const filteredPaidOrders = ordersForDate.filter(order =>
            this.isPaid(order) &&
            order.customer &&
            order.customer.name !== 'Cliente de Tienda'
          );

          allPaidOrders = [...allPaidOrders, ...filteredPaidOrders];
        });
        return allPaidOrders;
      }

      const orders = this.filteredGroupedOrders.get(date) || [];
      // Filtrar los pedidos de tienda
      const paidOrders = orders.filter(order =>
        this.isPaid(order) &&
        order.customer &&
        order.customer.name !== 'Cliente de Tienda'
      );

      return paidOrders;
    } else {
      const orders = this.filteredGroupedOrders.get(date) || [];
      // Filtrar los pedidos de tienda
      return orders.filter(order =>
        !this.isPaid(order) &&
        order.status === status &&
        order.customer &&
        order.customer.name !== 'Cliente de Tienda'
      );
    }
  }

  /**
   * Navega a la pantalla de cobro
   */
  chargeOrder(orderId: string) {
    this.router.navigate(['/cobrar', orderId]);
  }
  /**
   * Obtiene el color de texto apropiado (oscuro/claro) según el color de fondo
   * @param bgColor - Color de fondo en formato hsl
   * @returns Color de texto apropiado
   */
  getTextColor(bgColor: string): string {
    // Para colores en formato hexadecimal
    if (bgColor.startsWith('#')) {
      // Convertir hexadecimal a RGB
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);

      // Calcular la luminancia (fórmula estándar para accesibilidad)
      // Valores más altos = colores más claros
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Umbral de 0.5 es un buen punto para cambiar entre texto oscuro y claro
      return luminance > 0.6 ? 'text-gray-800' : 'text-white';
    }

    // Para colores HSL (mantener la implementación anterior como respaldo)
    const match = bgColor.match(/hsl\(\d+,\s*\d+%,\s*(\d+)%\)/);
    if (match && match[1]) {
      const lightness = parseInt(match[1], 10);
      return lightness > 70 ? 'text-gray-800' : 'text-white';
    }

    return 'text-gray-800'; // Por defecto texto oscuro
  }

  getOrderColor(orderId: string | undefined): string {
    if (!orderId) {
      return '#f0f0f0'; // Color gris por defecto
    }

    // Conjunto de colores pastel de alta visibilidad pero suaves
    const colors = [
      '#FFCDB2', // melocotón claro
      '#B5EAD7', // menta suave
      '#C7CEEA', // lavanda claro
      '#FFB4A2', // rosa salmón
      '#E2F0CB', // lima pastel
      '#CDDAFD', // azul cielo
      '#FDE4CF', // naranja pastel
      '#F4ACB7', // rosa claro
      '#D8E2DC', // gris verdoso claro
      '#BEE1E6', // celeste pastel
      '#F8EDEB', // rosa pálido
      '#ECE4DB'  // beige claro
    ];

    // Usar el ID para determinar un índice consistente
    let idHash = 0;
    for (let i = 0; i < orderId.length; i++) {
      idHash = orderId.charCodeAt(i) + ((idHash << 5) - idHash);
    }

    // Convertir a número positivo y obtener un índice en el arreglo
    idHash = Math.abs(idHash);
    const colorIndex = idHash % colors.length;

    return colors[colorIndex];
  }

  /**
   * Añade ítems a un pedido existente
   */
  addItemsToOrder(order: Order) {
    localStorage.setItem('editOrderId', order.id);

    this.router.navigate(['/pedido'], {
      queryParams: {
        mode: 'edit',
        orderId: order.id
      }
    });
  }

  /**
   * Verifica si un pedido tiene ítems listos
   */
  hasReadyItems(order: Order): boolean {
    return order.items.some(item =>
      (item.status || 'En espera') === 'Listos para servir' &&
      order.status !== 'Listos para servir'
    );
  }

  /**
   * Obtiene la clase CSS para el estado de un ítem
   */
  getItemStatusClass(status: string): string {
    switch (status) {
      case 'En espera':
        return 'bg-yellow-50 border-l-2 border-yellow-300';
      case 'En preparación':
        return 'bg-blue-50 border-l-2 border-blue-300';
      case 'Listos para servir':
        return 'bg-green-50 border-l-2 border-green-300';
      default:
        return 'bg-gray-50 border-l-2 border-gray-300';
    }
  }

  /**
   * Alterna la expansión de una sección
   */
  // Modifica el método toggleSection para asegurar que la sección se expande
  toggleSection(section: 'waiting' | 'preparing' | 'ready' | 'served' | 'paid'): void {
    this.sectionExpanded[section] = !this.sectionExpanded[section];

    // Si estás expandiendo la sección de Cobrado, fuerza una actualización de los datos
    if (section === 'paid' && this.sectionExpanded.paid) {
      // Aplicar de nuevo el filtro para asegurar datos actualizados
      this.applyDateFilter();

      // Forzar detección de cambios
      setTimeout(() => {
        this.cdr.detectChanges();
      }, 0);
    }
  }
  /**
   * Obtiene los pedidos que tienen al menos un ítem servido
   * @returns Lista de pedidos servidos
   */
  getServedOrders(): Order[] {
    const result: Order[] = [];

    this.getFilteredDates().forEach(date => {
      // Get orders from filteredGroupedOrders instead of all orders
      const ordersForDate = this.filteredGroupedOrders.get(date) || [];

      for (const order of ordersForDate) {
        // Filtrar pedidos de tienda
        if (!this.isPaid(order) &&
          order.customer &&
          order.customer.name !== 'Cliente de Tienda') {
          // Verificar si el pedido tiene al menos un ítem servido
          const hasServedItems = order.items.some(item => item.status === 'Servido');
          if (hasServedItems) {
            result.push(order);
          }
        }
      }
    });

    return result;
  }
  /**
 * Obtiene los pedidos para una fecha específica
 * @param date - Fecha en formato de cadena (DD/MM/YYYY)
 * @returns Lista de pedidos
 */
  getOrdersForDate(date: string): Order[] {
    return this.filteredGroupedOrders.get(date) || [];
  }

  /**
   * Obtiene los ítems más relevantes para mostrar en resumen
   * @param order - Pedido
   * @param limit - Número máximo de ítems a devolver
   * @returns Lista limitada de ítems
   */
  getTopItems(order: Order, limit: number): OrderItem[] {
    return order.items.slice(0, limit);
  }

  /**
   * Marca un ítem como servido y actualiza el status del pedido
   * @param item - Ítem a marcar
   * @param orderId - ID del pedido
   */
  async markItemAsServed(item: OrderItem, orderId: string) {
    try {
      const orderRef = doc(this.firestore, `orders/${orderId}`);
      const docSnapshot = await getDoc(orderRef);

      if (docSnapshot.exists()) {
        const orderData = docSnapshot.data() as any;
        const items = orderData.items || [];

        // Actualizar el ítem específico
        const updatedItems = items.map((orderItem: any) => {
          if (orderItem.id === item.id &&
            orderItem.name === item.name &&
            orderItem.selectedOption === item.selectedOption) {
            return {
              ...orderItem,
              status: 'Servido'
            };
          }
          return orderItem;
        });

        // Actualizar en Firestore
        await updateDoc(orderRef, { items: updatedItems });

        // Mostrar notificación
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          icon: 'success',
          title: `${item.name} ha sido servido`
        });

        // Recargar pedidos
        this.loadOrders();
      }
    } catch (error) {
      console.error('Error al marcar ítem como servido:', error);
      this.showErrorToast('No se pudo actualizar el estado del ítem');
    }
  }
  /**
   * Imprime un recibo
   */
  printReceipt(orderId: string): void {
    // Evitar propagación del evento
    event?.stopPropagation();

    Swal.fire({
      title: 'Imprimiendo recibo...',
      text: 'Enviando a la impresora',
      icon: 'info',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
      heightAuto: false
    });

    // Simulación de impresión
    setTimeout(() => {
      Swal.fire({
        title: 'Recibo enviado',
        text: 'El recibo se ha enviado a la impresora correctamente',
        icon: 'success',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }, 2000);
  }

  // Método para activar/desactivar sonido
  // Modifica el método toggleSound() para ser más robusto
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('homeSoundEnabled', this.soundEnabled.toString());

    if (this.soundEnabled) {
      this.initAudio();
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        icon: 'info',
        title: 'Sonido desactivado'
      });
    }
  }

  // Añade este nuevo método para inicializar el audio de forma más robusta
  initAudio() {
    if (!this.notificationSound) {
      console.warn('Elemento de audio no disponible');
      return;
    }

    const audio = this.notificationSound.nativeElement;
    audio.volume = 0.01; // Volumen bajo para la prueba

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1.0; // Restaurar volumen
        console.log('Contexto de audio activado.');
      }).catch(error => {
        console.warn('La reproducción automática de audio falló. Se requiere interacción del usuario.');
        // No mostrar alerta aquí para no ser intrusivo
      });
    }
  }

  // Método para que el usuario inicie el audio con un clic
  userInitAudio() {
    this.soundEnabled = true;
    localStorage.setItem('homeSoundEnabled', 'true');
    this.initAudio();

    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      icon: 'success',
      title: 'Sonido activado'
    });
  }

  // Método para activar/desactivar notificaciones
  toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    localStorage.setItem('homeNotificationsEnabled', this.notificationsEnabled.toString());

    if (this.notificationsEnabled) {
      if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            Swal.fire({
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 2000,
              icon: 'success',
              title: 'Notificaciones activadas'
            });
          } else {
            this.notificationsEnabled = false;
            localStorage.setItem('homeNotificationsEnabled', 'false');
            Swal.fire({
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 3000,
              icon: 'warning',
              title: 'Permiso denegado',
              text: 'No se pudo activar las notificaciones'
            });
          }
        });
      } else {
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          icon: 'success',
          title: 'Notificaciones activadas'
        });
      }
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        icon: 'info',
        title: 'Notificaciones desactivadas'
      });
    }
  }

  // Método para fullscreen
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen = true;
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          icon: 'success',
          title: 'Modo pantalla completa activado'
        });
      }).catch(err => {
        console.error('Error al entrar en pantalla completa:', err);
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          icon: 'error',
          title: 'No se pudo activar pantalla completa'
        });
      });
    } else {
      document.exitFullscreen().then(() => {
        this.isFullscreen = false;
        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          icon: 'info',
          title: 'Saliendo de pantalla completa'
        });
      }).catch(err => {
        console.error('Error al salir de pantalla completa:', err);
      });
    }
  }

  // Modifica el método playNotification()
  playNotification() {
    if (!this.soundEnabled || !this.notificationSound) {
      return;
    }

    const audio = this.notificationSound.nativeElement;
    audio.currentTime = 0;
    audio.volume = 0.8;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Error al reproducir sonido de notificación:', error);
        // Si falla, es probable que el contexto de audio se haya suspendido.
        // Se requerirá interacción del usuario para reanudarlo.
        Swal.fire({
          title: 'Sonido bloqueado',
          text: 'El navegador ha bloqueado el sonido. Haga clic en cualquier lugar de la página para reactivarlo.',
          icon: 'warning',
          confirmButtonText: 'Entendido'
        });
      });
    }

    // Vibrar si está disponible
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // Mostrar notificación visual
    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true,
      icon: 'success',
      title: 'Nuevo plato listo',
      text: 'Un plato ha sido marcado como listo para servir'
    });

    // Restaurar el sistema de notificaciones del navegador solo en escritorio
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (this.notificationsEnabled && !isMobile && Notification.permission === 'granted') {
      const notification = new Notification('Nuevo plato listo', {
        body: 'Un plato ha sido marcado como listo para servir',
        icon: '/assets/icons/bell-svgrepo-com.svg'
      });
      setTimeout(() => notification.close(), 5000);
    }
  }
  // Añade este método a tu clase
  startAudioResetInterval() {
    // Cada 5 minutos, reinicializar el audio para evitar problemas
    const interval = setInterval(() => {
      if (this.soundEnabled && this.notificationSound) {
        console.log('Mantenimiento programado del sistema de audio');
        const audio = this.notificationSound.nativeElement;
        audio.pause();
        audio.currentTime = 0;
        audio.load();
      }
    }, 300000); // 5 minutos

    // Guardar referencia para limpiar en ngOnDestroy
    this.audioResetInterval = interval;
  }

  // Añade esta propiedad a tu clase
  private audioResetInterval: any;


  // Añadir este nuevo método para extraer todos los ítems de todos los pedidos
  // Modify the extractAllItems method to only use filtered orders
  private extractAllItems(): OrderItem[] {
    const allItems: OrderItem[] = [];

    // Get only the filtered dates
    const filteredDates = this.getFilteredDates();

    filteredDates.forEach(date => {
      // Use filtered orders instead of all orders
      const orders = this.filteredGroupedOrders.get(date) || [];

      orders.forEach(order => {
        // Filtrar los pedidos de tienda (tienen "Cliente de Tienda" como nombre)
        if (order.customer && order.customer.name !== 'Cliente de Tienda') {
          if (order.items && Array.isArray(order.items)) {
            const itemsWithOrderInfo = order.items.map(item => ({
              ...item,
              orderId: order.id,
              orderDate: order.date,
              customerName: order.customer.name,
              tableInfo: order.tables ? order.tables.join(', ') : 'No especificada'
            }));

            allItems.push(...itemsWithOrderInfo);
          }
        }
      });
    });

    return allItems;
  }

  // Update getItemsByStatus to use only filtered items
  getItemsByStatus(status: string): OrderItem[] {
    const allItems = this.extractAllItems(); // This now uses filtered orders
    return allItems.filter(item =>
      (item.status || 'En espera') === status
    );
  }

  // Método para obtener un pedido por su ID
  getOrderById(orderId: string): Order | null {
    // Primero buscar en los pedidos filtrados
    for (const orders of this.filteredGroupedOrders.values()) {
      const foundOrder = orders.find(order => order.id === orderId);
      if (foundOrder) return foundOrder;
    }

    // Si no se encuentra en los filtrados, buscar en todos los pedidos
    // Esto es útil cuando se hace clic en un ítem que pertenece a un pedido
    // que podría no estar en el filtro actual
    for (const orders of this.groupedOrders.values()) {
      const foundOrder = orders.find(order => order.id === orderId);
      if (foundOrder) return foundOrder;
    }

    return null;
  }
}