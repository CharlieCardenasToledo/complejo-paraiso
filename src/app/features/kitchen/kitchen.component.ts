import { Component, inject, OnInit, ElementRef, ViewChild, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  doc,
  updateDoc,
  getDoc
} from '@angular/fire/firestore';
import { map, Subscription } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { FormatDateSpanishPipe } from '../../pipes/format-date-spanish.pipe';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { Order, OrderItem } from '../../models/data.model';
import { InventoryService } from '../../core/services/inventory.service';

@Component({
    selector: 'app-kitchen',
    standalone: true,
    imports: [CommonModule, DatePipe, FormsModule],
    templateUrl: './kitchen.component.html',
    styleUrls: ['./kitchen.component.scss']
})
export class KitchenComponent implements OnInit, OnDestroy {
  @ViewChild('notificationSound') notificationSound!: ElementRef<HTMLAudioElement>;

  private firestore = inject(Firestore);
  private inventoryService = inject(InventoryService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  // Suscripciones para mejor manejo de memoria
  private subscriptions: Subscription[] = [];

  // Propiedades para los items
  allItems: OrderItem[] = [];
  filteredItems: OrderItem[] = [];

  // Para búsqueda - con texto simplificado para tablet
  searchQuery = '';

  // Para filtrado de fecha
  showPastDates = false;
  currentDate = new Date();

  // Para notificaciones
  hasNewItems = false;
  lastItemCount = 0;
  soundEnabled = false; // Controla si el sonido está habilitado
  notificationsEnabled = false; // Controla si las notificaciones están habilitadas
  isFullscreen = false; // Controla si está en pantalla completa

  // Intervalo para actualizar datos
  private refreshInterval: any;
  private audioResetInterval: any;

  // Categorías excluidas de la cocina
  excludedCategoryIds: string[] = ['JWXmTEO143llfKM5PmkU', 'p4r4p8ofhtPIOrf4M14c', 'UmMtTqxhOZETuKr7tVMd']; // piscina, tienda, heladeria

  ngOnInit() {
    this.loadOrders();
    this.startAudioResetInterval();

    // Actualizar la fecha actual cada minuto
    setInterval(() => {
      this.currentDate = new Date();
      this.applyFilters(); // Actualizar filtros al cambiar la fecha
    }, 60000);

    // Verificar preferencias guardadas
    const savedSoundPreference = localStorage.getItem('kitchenSoundEnabled');
    this.soundEnabled = savedSoundPreference === 'true';

    const savedNotificationPreference = localStorage.getItem('kitchenNotificationsEnabled');
    this.notificationsEnabled = savedNotificationPreference === 'true';

    // Auto-recarga de pedidos cada 30 segundos (optimizado para tablet)
    this.refreshInterval = setInterval(() => {
      this.loadOrders();
    }, 30000);

    // Optimización para tablets: ajustar la altura máxima del contenedor
    this.adjustContainerHeight();
    window.addEventListener('resize', this.adjustContainerHeight);

    // Eventos de fullscreen
    document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));

    // Inicializar audio después de un tiempo para asegurar que el DOM está cargado
    setTimeout(() => {
      if (this.soundEnabled) {
        this.initAudio();
      }
    }, 1000);
  }

  ngOnDestroy() {
    // Limpiar recursos al destruir el componente
    this.subscriptions.forEach(sub => sub.unsubscribe());
    clearInterval(this.refreshInterval);
    clearInterval(this.audioResetInterval);
    window.removeEventListener('resize', this.adjustContainerHeight);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
  }

  // Método para ajustar altura del contenedor en tablets
  private adjustContainerHeight() {
    // Ajustar para que el kanban board sea visible completo en la tablet
    const viewportHeight = window.innerHeight;
    const headerHeight = 220; // Altura aproximada del header

    // Establecer variables CSS personalizadas para altura dinámica
    document.documentElement.style.setProperty('--kanban-height', `${viewportHeight - headerHeight}px`);
    document.documentElement.style.setProperty('--cards-container-height', `${viewportHeight - headerHeight - 55}px`);
  }

  handleFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  // Método para activar/desactivar sonido
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('kitchenSoundEnabled', this.soundEnabled.toString());

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

  // Método para activar/desactivar notificaciones
  toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    localStorage.setItem('kitchenNotificationsEnabled', this.notificationsEnabled.toString());

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
            localStorage.setItem('kitchenNotificationsEnabled', 'false');
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

  // Inicializa el audio de forma robusta
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
    localStorage.setItem('kitchenSoundEnabled', 'true');
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

  playNotificationSound() {
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
      title: 'Nuevo pedido recibido',
      text: '¡Se ha recibido un nuevo pedido en la cocina!'
    });

    // Restaurar el sistema de notificaciones del navegador solo en escritorio
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (this.notificationsEnabled && !isMobile && Notification.permission === 'granted') {
      const notification = new Notification('Nuevo pedido recibido', {
        body: '¡Se ha recibido un nuevo pedido en la cocina!',
        icon: '/assets/icons/bell-svgrepo-com.svg'
      });
      setTimeout(() => notification.close(), 5000);
    }
  }

  private loadOrders() {
    const ordersCollection = collection(this.firestore, 'orders');
    // Crear una consulta ordenada por fecha descendente (más reciente primero)
    const ordersQuery = query(ordersCollection, orderBy('date', 'desc'));

    // Guardar la suscripción para limpieza posterior
    const subscription = collectionData(ordersQuery, { idField: 'id' })
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
              data.items = data.items.map((item: any) => ({
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
        // Extraer todos los ítems
        this.extractAllItems(orders);

        // Aplicar filtros iniciales
        this.applyFilters();

        // Verificar si hay nuevos items
        this.checkForNewItems();

        // Forzar detección de cambios
        this.ngZone.run(() => {
          setTimeout(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          }, 0);
        });
      });

    this.subscriptions.push(subscription);
  }

  // Método para extraer todos los ítems de todos los pedidos
  private extractAllItems(orders: Order[]) {
    const previousItemCount = this.allItems.length;
    this.allItems = [];

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        // Añadir información del pedido a cada ítem y filtrar categorías excluidas
        const itemsWithOrderInfo = order.items
          .filter(item => !this.excludedCategoryIds.includes(item.categoryId || ''))
          .map(item => ({
            ...item,
            orderId: order.id,
            orderDate: order.date,
            customerName: order.customer.name,
            tableInfo: order.tables ? order.tables.join(', ') : 'No especificada'
          }));

        this.allItems.push(...itemsWithOrderInfo);
      }
    });

    // Ordenar los ítems por fecha (más recientes primero)
    this.allItems.sort((a, b) => {
      // Si ambas fechas existen, comparamos normalmente
      if (a.orderDate && b.orderDate) {
        return b.orderDate.getTime() - a.orderDate.getTime();
      }
      // Si solo a.orderDate existe, a debería ir primero
      else if (a.orderDate) {
        return -1;
      }
      // Si solo b.orderDate existe, b debería ir primero
      else if (b.orderDate) {
        return 1;
      }
      // Si ninguna fecha existe, mantenemos el orden original
      return 0;
    });

    // Verificar si hay nuevos ítems y emitir sonido si está habilitado
    if (this.allItems.length > previousItemCount && previousItemCount > 0) {
      this.hasNewItems = true;
      this.notifyNewItems();

      // Solo reproducir sonido si está habilitado
      if (this.soundEnabled) {
        this.playNotificationSound();
      }
    }

    this.lastItemCount = this.allItems.length;
  }

  // Método para notificar nuevos pedidos - Optimizado para tablet
  private notifyNewItems() {
    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      icon: 'info',
      title: '¡Nuevos pedidos recibidos!',
      width: '300px' // Mejor tamaño para tablet
    });
  }

  // Método para aplicar todos los filtros
  applyFilters() {
    this.filteredItems = [...this.allItems];

    // Aplicar filtro de fecha pasada
    if (!this.showPastDates) {
      const today = new Date(this.currentDate);
      today.setHours(0, 0, 0, 0);

      this.filteredItems = this.filteredItems.filter(item => {
        // Verificar si orderDate existe antes de crear una nueva fecha
        if (!item.orderDate) {
          return false; // Items sin fecha se excluyen cuando se filtran por fecha
        }
        const itemDate = new Date(item.orderDate);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate.getTime() >= today.getTime();
      });
    }

    // Aplicar búsqueda
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase().trim();
      this.filteredItems = this.filteredItems.filter(item =>
        // Usar operadores de encadenamiento opcional para propiedades que pueden ser undefined
        (item.name?.toLowerCase().includes(query) || false) ||
        (item.customerName?.toLowerCase().includes(query) || false) ||
        (item.selectedOption?.toLowerCase().includes(query) || false) ||
        (item.tableInfo?.toLowerCase().includes(query) || false)
      );
    }
  }

  // Método para filtrar ítems por búsqueda
  filterItems() {
    this.applyFilters();
  }

  // Método para obtener ítems filtrados por estado
  getFilteredItemsByStatus(status: string): OrderItem[] {
    return this.filteredItems.filter(item => (item.status || 'En espera') === status);
  }

  // Método para obtener el conteo de ítems por estado
  getItemCountByStatus(status: string): number {
    return this.getFilteredItemsByStatus(status).length;
  }

  // Método para verificar si un ítem es de una fecha pasada
  isItemFromPastDate(item: OrderItem): boolean {
    // Verificar si orderDate existe
    if (!item.orderDate) {
      return false; // Si no hay fecha, no podemos determinar si es del pasado
    }

    const itemDate = new Date(item.orderDate);
    const today = new Date(this.currentDate);

    // Comparar solo las fechas (sin la hora)
    return itemDate.setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0);
  }

  // Método para actualizar el estado de un ítem con feedback táctil mejorado
  updateItemStatus(item: OrderItem, newStatus: 'En espera' | 'En preparación' | 'Listos para servir') {
    // Verificar si el ítem es de una fecha pasada
    if (this.isItemFromPastDate(item)) {
      Swal.fire({
        icon: 'warning',
        title: 'No se puede modificar',
        text: 'No se pueden modificar pedidos de fechas pasadas',
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        width: '350px' // Mejor tamaño para tablet
      });
      return;
    }

    const orderRef = doc(this.firestore, `orders/${item.orderId}`);

    // Primero, obtener el pedido completo
    getDoc(orderRef).then(docSnapshot => {
      if (docSnapshot.exists()) {
        const orderData = docSnapshot.data() as any;
        const items = orderData.items || [];

        // Estado anterior para verificar cambios
        let oldStatus = '';

        // Encontrar y actualizar el ítem específico
        const updatedItems = items.map((orderItem: any) => {
          if (orderItem.id === item.id &&
            orderItem.name === item.name &&
            orderItem.selectedOption === item.selectedOption) {
            // Guardar el estado anterior
            oldStatus = orderItem.status || 'En espera';
            return {
              ...orderItem,
              status: newStatus
            };
          }
          return orderItem;
        });

        // Mostrar indicador de carga para mejorar experiencia en tablet
        Swal.fire({
          title: 'Actualizando...',
          didOpen: () => {
            Swal.showLoading();
          },
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          backdrop: true
        });

        // Actualizar el documento en Firestore
        updateDoc(orderRef, { items: updatedItems })
          .then(() => {
            // Cerrar indicador de carga
            Swal.close();

            // Actualizar el estado localmente
            item.status = newStatus;

            // Modificar el orden en filteredItems
            this.applyFilters();

            // LÓGICA DE INVENTARIO ACTUALIZADA
            if (oldStatus !== 'Listos para servir' && newStatus === 'Listos para servir') {
              // Caso 1: Ítem cambia a "Listos para servir" - descontar del inventario
              this.processInventoryForCompletedItem(item);
            }
            else if (oldStatus === 'Listos para servir' && newStatus !== 'Listos para servir') {
              // Caso 2: Ítem reabierto - restaurar al inventario
              this.restoreInventoryForReopenedItem(item);
            }

            // Verificar si necesitamos actualizar el estado general del pedido
            this.updateOrderStatusIfNeeded(item.orderId);

            // Mostrar notificación adaptada para tablet
            let statusMessage = '';
            let statusIcon = '';

            switch (newStatus) {
              case 'En preparación':
                statusMessage = `${item.name} ha pasado a preparación`;
                statusIcon = 'info';
                break;
              case 'Listos para servir':
                statusMessage = `${item.name} está listo`;
                statusIcon = 'success';
                break;
              case 'En espera':
                statusMessage = `${item.name} ha vuelto a la lista de espera`;
                statusIcon = 'warning';
                break;
            }

            Swal.fire({
              toast: true,
              position: 'top',
              showConfirmButton: false,
              timer: 3000,
              timerProgressBar: true,
              icon: statusIcon as any,
              title: statusMessage,
              width: '350px' // Optimizado para tablet
            });
          })
          .catch((error) => {
            console.error('Error al actualizar el estado del ítem:', error);
            Swal.fire({
              title: 'Error',
              text: 'No se pudo actualizar el estado del ítem',
              icon: 'error',
              confirmButtonText: 'OK',
              confirmButtonColor: '#2196F3'
            });
          });
      }
    });
  }

  // NUEVO MÉTODO: Procesar inventario cuando un ítem se marca como completado
  private async processInventoryForCompletedItem(item: OrderItem) {
    try {
      // Crear un array con solo el ítem completado
      const completedItems = [{
        ...item,
        // Asegúrate de que estas propiedades existan
        categoryId: item.categoryId || '',
        categoryName: item.categoryName || ''
      }];

      console.log('Procesando inventario para ítem completado:', completedItems);

      // Procesar el ítem en el inventario
      await this.inventoryService.processOrderInventory(item.orderId || '', completedItems);

      console.log('Inventario actualizado para ítem completado');
    } catch (error) {
      console.error('Error al procesar inventario para ítem completado:', error);
    }
  }

  // NUEVO MÉTODO: Restaurar inventario cuando un ítem cambia de "Listos para servir" a otro estado
  private async restoreInventoryForReopenedItem(item: OrderItem) {
    try {
      console.log('Restaurando inventario para ítem reabierto:', item);

      // Obtener el ingrediente principal del plato (para mostrar en la notificación)
      let mainIngredientName = 'ingredientes';
      try {
        const dishRef = doc(this.firestore, `menu/${item.id}`);
        const dishSnapshot = await getDoc(dishRef);
        if (dishSnapshot.exists()) {
          const dishData = dishSnapshot.data() as any;
          if (dishData.ingredients && dishData.ingredients.length > 0) {
            mainIngredientName = dishData.ingredients[0].name || 'ingredientes';
          }
        }
      } catch (err) {
        console.error('Error al obtener ingredientes del plato:', err);
      }

      // Restaurar el inventario - crear un objeto con la estructura similar a lo que procesa
      const reopenedItems = [{
        ...item,
        categoryId: item.categoryId || '',
        categoryName: item.categoryName || ''
      }];

      // Llamar al método de restauración de inventario
      await this.inventoryService.restoreOrderInventory(item.orderId || '');

      console.log('Inventario restaurado para ítem reabierto');

      // Notificar al usuario
      Swal.fire({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        icon: 'info',
        title: `Inventario actualizado`,
        text: `Se ha restaurado ${mainIngredientName} al inventario`,
        width: '350px' // Optimizado para tablet
      });
    } catch (error) {
      console.error('Error al restaurar inventario para ítem reabierto:', error);

      // Notificar error de forma discreta
      Swal.fire({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        icon: 'warning',
        title: 'Error al restaurar inventario',
        width: '350px' // Optimizado para tablet
      });
    }
  }

  // Método para actualizar el estado general del pedido si es necesario
  private updateOrderStatusIfNeeded(orderId: string | undefined) {
    if (!orderId) {
      console.warn('Se intentó actualizar un estado de pedido con un ID indefinido');
      return;
    }
    // Obtener todos los ítems de este pedido
    const orderItems = this.allItems.filter(item => item.orderId === orderId);

    // Verificar si todos los ítems tienen el mismo estado
    const allItemsStatuses = orderItems.map(item => item.status || 'En espera');
    const uniqueStatuses = new Set(allItemsStatuses);

    if (uniqueStatuses.size === 1) {
      // Si todos los ítems tienen el mismo estado, actualizar el estado del pedido
      const newOrderStatus = allItemsStatuses[0] as 'En espera' | 'En preparación' | 'Listos para servir';

      const orderRef = doc(this.firestore, `orders/${orderId}`);
      updateDoc(orderRef, { status: newOrderStatus })
        .then(() => {
          console.log(`Estado del pedido ${orderId} actualizado a ${newOrderStatus}`);
        })
        .catch(error => {
          console.error('Error al actualizar el estado general del pedido:', error);
        });
    } else if (allItemsStatuses.every(status => status === 'Listos para servir' || status === 'En preparación')) {
      // Si todos los ítems están en preparación o Listos para servir, el pedido está en preparación
      const orderRef = doc(this.firestore, `orders/${orderId}`);
      updateDoc(orderRef, { status: 'En preparación' })
        .then(() => {
          console.log(`Estado del pedido ${orderId} actualizado a En preparación`);
        })
        .catch(error => {
          console.error('Error al actualizar el estado general del pedido:', error);
        });
    }
  }

  // Método para verificar si hay nuevos ítems
  private checkForNewItems() {
    // Contar ítems actuales en espera
    const itemsEnEspera = this.allItems.filter(item =>
      (item.status || 'En espera') === 'En espera' &&
      !this.isItemFromPastDate(item)
    ).length;

    // Si hay más ítems en espera que antes, notificar
    if (itemsEnEspera > 0 && this.hasNewItems) {
      this.notifyNewItems();

      // Solo reproducir sonido si está habilitado
      if (this.soundEnabled) {
        this.playNotificationSound();
      }

      this.hasNewItems = false;
    }
  }

  // Obtener ítems listos para servir y servidos
  getReadyAndServedItems(): OrderItem[] {
    return this.filteredItems.filter(item =>
      (item.status || 'En espera') === 'Listos para servir' ||
      (item.status || 'En espera') === 'Servido'
    );
  }

  // Obtener el conteo combinado de ítems listos para servir y servidos
  getReadyAndServedItemCount(): number {
    return this.getReadyAndServedItems().length;
  }
}