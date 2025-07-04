import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { CashRegisterService } from '../../services/cash-register.service';
import { InventoryService } from '../../services/inventory.service';
import { CommonModule } from '@angular/common';
import { Category, DishOption, OrderItem, Table, TableGroup } from '../../models/data.model';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  imports: [FormsModule, CommonModule],
  selector: 'app-order',
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.scss']
})
export class OrderComponent implements OnInit, OnDestroy {
  // Variables para búsqueda y filtrado
  searchQuery = '';
  selectedTables: (number | string)[] = [];

  // Variables para cliente
  isConsumidorFinal = false;
  customer = {
    name: '',
    idNumber: '',
  };

  // Variables para pedido
  orderItems: OrderItem[] = [];
  storeCategories: Category[] = [];
  selectedCategory: Category | null = null;

  // Variables para edición de pedido
  isEditing = false;
  editOrderId: string | null = null;
  originalOrderItems: OrderItem[] = [];  // Para guardar los items originales

  // Control de inventario y procesamiento
  isProcessingOrder = false;
  loadingCategories = true;
  loadingMenu = true;

  // Suscripciones para mejor manejo de memoria
  private subscriptions: Subscription[] = [];

  // Grupos de mesas
  tableGroups: TableGroup[] = [
    {
      name: 'Mesas numéricas',
      tables: [
        { id: 1, type: 'regular' },
        { id: 2, type: 'regular' },
        { id: 3, type: 'regular' },
        { id: 4, type: 'regular' },
        { id: 5, type: 'regular' },
        { id: 6, type: 'regular' },
        { id: 7, type: 'regular' },
        { id: 8, type: 'regular' },
        { id: 9, type: 'regular' },
        { id: 10, type: 'regular' },
        { id: 11, type: 'regular' },
        { id: 12, type: 'regular' },
        { id: 13, type: 'regular' },
        { id: 14, type: 'regular' },
        { id: 15, type: 'regular' },
        { id: 16, type: 'regular' },
        { id: 17, type: 'regular' },
        { id: 18, type: 'regular' },
        { id: 19, type: 'regular' },
        { id: 20, type: 'regular' },
        { id: 21, type: 'regular' },
        { id: 24, type: 'regular' },
        { id: 25, type: 'regular' }
      ]
    },
    {
      name: 'Mesas especiales',
      tables: [
        { id: 'S1', type: 'special' },
        { id: 'S2', type: 'special' },
        { id: 'Madera', type: 'special' },
        { id: 'Plástico', type: 'special' },
        { id: 'Rustica', type: 'special' },
        { id: 'Corona', type: 'special' },
        { id: 'Club', type: 'special' },
        { id: 'Heineken', type: 'special' },
        { id: 'Modelo', type: 'special' }
      ]
    }
  ];

  // Servicios mediante inyección
  private firestore = inject(Firestore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private inventoryService = inject(InventoryService);
  private cashRegisterService = inject(CashRegisterService);

  // Inicialización del componente
  ngOnInit() {
    // Establecer cliente por defecto como consumidor final
    this.setClientType(true);

    // Cargar categorías y menú
    this.loadCategoriesAndMenu();

    // Verificar si estamos en modo edición
    const routeSub = this.route.queryParams.subscribe(params => {
      if (params['mode'] === 'edit' && params['orderId']) {
        this.isEditing = true;
        this.editOrderId = params['orderId'];

        // Cargar pedido existente si estamos en modo edición
        if (this.editOrderId) {
          this.loadExistingOrder(this.editOrderId);
        }
      }
    });

    this.subscriptions.push(routeSub);
  }

  // Liberar recursos al destruir el componente
  ngOnDestroy() {
    // Cancelar todas las suscripciones
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Método para alternar selección de mesa
  toggleTable(table: number | string): void {
    const tableIndex = this.selectedTables.indexOf(table);

    if (tableIndex === -1) {
      // Añadir mesa si no está seleccionada
      this.selectedTables.push(table);
    } else {
      // Remover mesa si ya está seleccionada
      this.selectedTables.splice(tableIndex, 1);
    }
  }

  // Obtener mesas numéricas
  getNumericTables(): Table[] {
    return this.tableGroups[0].tables;
  }

  // Obtener mesas especiales
  getSpecialTables(): Table[] {
    return this.tableGroups[1].tables;
  }

  // Verificar si una mesa está seleccionada
  isTableSelected(table: number | string): boolean {
    return this.selectedTables.includes(table);
  }

  // Métodos auxiliares para manejo seguro de opciones de platos
  isObject(option: any): option is DishOption {
    return option !== null && typeof option === 'object' && 'name' in option;
  }

  getOptionValue(option: string | DishOption): string {
    if (this.isObject(option)) {
      return option.name;
    }
    return option;
  }

  getOptionDisplay(option: string | DishOption): string {
    if (this.isObject(option)) {
      return option.name;
    }
    return option;
  }

  // Método para cargar un pedido existente
  // Método mejorado para cargar un pedido existente
  private loadExistingOrder(orderId: string): void {
    // Mostrar feedback visual durante la carga
    Swal.fire({
      title: 'Cargando pedido',
      text: 'Por favor espera...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const orderRef = doc(this.firestore, 'orders', orderId);
    getDoc(orderRef)
      .then((docSnapshot) => {
        if (docSnapshot.exists()) {
          const orderData = docSnapshot.data() as any;

          // Cargar datos del cliente
          this.customer = orderData.customer || { name: '', idNumber: '' };

          // Verificar si es consumidor final
          this.isConsumidorFinal = orderData.isConsumidorFinal || false;

          // Cargar mesas seleccionadas
          this.selectedTables = orderData.tables || [];

          // Guardar los items originales pero no los cargamos en orderItems todavía
          this.originalOrderItems = JSON.parse(JSON.stringify(orderData.items || [])).map((item: any) => ({
            ...item,
            originalQuantity: item.quantity  // Guardar la cantidad original
          }));

          // Promise para asegurar que el menú esté cargado antes de continuar
          const loadMenuPromise = new Promise<void>((resolve) => {
            // Si ya tenemos categorías cargadas
            if (this.storeCategories.length > 0) {
              resolve();
              return;
            }

            // Esperar a que se cargue el menú (máximo 5 segundos)
            const timeout = setTimeout(() => resolve(), 5000);

            // Verificar cada 100ms si el menú ya está cargado
            const interval = setInterval(() => {
              if (this.storeCategories.length > 0) {
                clearTimeout(timeout);
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });

          // Cuando el menú esté listo, procesar los ítems
          loadMenuPromise.then(() => {
            Swal.close();

            // Al editar un pedido, empezamos con un carrito vacío
            // Los ítems existentes se añadirán con sus cantidades originales
            this.orderItems = [];

            // Ahora procesamos los ítems originales añadiéndolos al carrito
            this.originalOrderItems.forEach(item => {
              // Buscar en el menú para obtener toda la información actualizada
              const menuItem = this.findMenuItemById(item.id);

              if (menuItem) {
                // Crear un ítem completo con la info del menú y la cantidad original
                const completeItem: OrderItem = {
                  ...menuItem,
                  quantity: item.quantity,
                  selectedOption: item.selectedOption || undefined,
                  status: item.status || 'En espera'
                };

                // Añadir al carrito con la cantidad correcta
                // Forzamos la cantidad porque addItemWithOption y addToOrderNoOptions incrementan
                if (item.selectedOption) {
                  // Añadir el ítem con su opción
                  for (let i = 0; i < item.quantity; i++) {
                    this.addItemWithOption(completeItem, item.selectedOption);
                  }
                } else {
                  // Añadir el ítem sin opción
                  for (let i = 0; i < item.quantity; i++) {
                    this.addToOrderNoOptions(completeItem);
                  }
                }
              } else {
                // Si el ítem ya no está en el menú, añadirlo directamente
                this.orderItems.push({ ...item });
              }
            });

            Swal.fire({
              title: 'Pedido cargado',
              text: 'Puedes añadir más items al pedido',
              icon: 'info',
              timer: 2000,
              showConfirmButton: false
            });
          });
        } else {
          Swal.close();
          Swal.fire({
            title: 'Error',
            text: 'No se encontró el pedido',
            icon: 'error',
            confirmButtonText: 'Entendido'
          });
          this.router.navigate(['/']);
        }
      })
      .catch((error) => {
        Swal.close();
        Swal.fire({
          title: 'Error',
          text: 'No se pudo cargar el pedido',
          icon: 'error',
          confirmButtonText: 'Entendido'
        });
        console.error('Error loading order:', error);
        this.router.navigate(['/']);
      });
  }

  // Método auxiliar para encontrar un ítem del menú por ID
  private findMenuItemById(id: string): OrderItem | undefined {
    for (const category of this.storeCategories) {
      const item = category.items.find(item => item.id === id);
      if (item) return item;
    }
    return undefined;
  }

  // Método para cambiar el tipo de cliente
  setClientType(isConsumidorFinal: boolean): void {
    this.isConsumidorFinal = isConsumidorFinal;
    if (isConsumidorFinal) {
      this.customer.idNumber = '9999999999'; // Número estándar para consumidor final
    } else {
      this.customer.idNumber = '';
      this.customer.name = '';
    }
  }

  // Método para seleccionar una categoría
  selectCategory(category: Category): void {
    this.selectedCategory = category;
    this.searchQuery = ''; // Limpiar búsqueda al seleccionar categoría
  }

  // Método para obtener los items filtrados según búsqueda o categoría seleccionada
  getFilteredItems(): OrderItem[] {
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      return this.storeCategories
        .flatMap(category => category.items)
        .filter(item =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
        );
    } else if (this.selectedCategory) {
      return this.selectedCategory.items;
    }
    return [];
  }

  // Método para cargar categorías y menú
  private loadCategoriesAndMenu(): void {
    this.loadingCategories = true;
    this.loadingMenu = true;

    // 1. Primero cargar todas las categorías activas
    const categoriesCollection = collection(this.firestore, 'categories');
    const categoriesQuery = query(
      categoriesCollection,
      where('active', '==', true),
      orderBy('order', 'asc')
    );

    const categoriesSub = collectionData(categoriesQuery, { idField: 'id' }).subscribe(
      (categoriesData: any[]) => {
        this.loadingCategories = false;
        const categoriesMap = new Map<string, Category>();

        // Inicializar las categorías vacías
        categoriesData.forEach(category => {
          categoriesMap.set(category.id, {
            id: category.id,
            name: category.name,
            items: []
          });
        });

        // 2. Luego cargar los platos y asignarlos a sus categorías
        const menuCollection = collection(this.firestore, 'menu');
        const menuQuery = query(
          menuCollection,
          where('active', '==', true)
        );

        const menuSub = collectionData(menuQuery, { idField: 'id' }).subscribe(
          (menuData: any[]) => {
            this.loadingMenu = false;

            // Agregar cada plato a su categoría correspondiente
            menuData.forEach(item => {
              const categoryId = item.categoryId;

              // Si la categoría existe y está activa
              if (categoryId && categoriesMap.has(categoryId)) {
                // Procesar opciones para asegurar compatibilidad
                let processedOptions: Array<string | DishOption> = [];
                if (item.options && Array.isArray(item.options)) {
                  processedOptions = item.options.map((opt: any) => {
                    if (typeof opt === 'object' && opt !== null && 'name' in opt) {
                      return { name: opt.name, price: opt.price || 0 };
                    }
                    return String(opt);
                  });
                }

                const menuItem: OrderItem = {
                  id: item.id,
                  name: item.name,
                  price: Number(item.price) || 0,
                  quantity: 0,
                  description: item.description || '',
                  options: processedOptions,
                  isTracked: item.isTracked || false,
                  stockQuantity: item.stockQuantity || 0,
                  categoryId: categoryId,
                  categoryName: item.categoryName || categoriesMap.get(categoryId)?.name || ''
                };

                categoriesMap.get(categoryId)?.items.push(menuItem);
              }
            });

            // Convertir el mapa a un array de categorías
            this.storeCategories = Array.from(categoriesMap.values())
              .filter(category => category.items.length > 0);

            // Si hay categorías disponibles, seleccionar la primera por defecto
            if (this.storeCategories.length > 0 && !this.selectedCategory) {
              this.selectedCategory = this.storeCategories[0];
            }
          },
          (error) => {
            this.loadingMenu = false;
            Swal.fire({
              title: 'Error',
              text: 'No se pudo cargar el menú',
              icon: 'error',
              confirmButtonText: 'Entendido'
            });
            console.error('Error loading menu:', error);
          }
        );

        this.subscriptions.push(menuSub);
      },
      (error) => {
        this.loadingCategories = false;
        Swal.fire({
          title: 'Error',
          text: 'No se pudo cargar las categorías',
          icon: 'error',
          confirmButtonText: 'Entendido'
        });
        console.error('Error loading categories:', error);
      }
    );

    this.subscriptions.push(categoriesSub);
  }

  // Método para filtrar menú (actualiza resultados según búsqueda)
  filterMenu(): void {
    // Este método se activa con cada cambio en el input de búsqueda
    // No necesita hacer nada adicional ya que getFilteredItems() maneja la lógica
  }

  // Método para limpiar el carrito
  clearCart(): void {
    if (this.orderItems.length === 0) return;

    Swal.fire({
      title: '¿Limpiar carrito?',
      text: '¿Estás seguro de que deseas vaciar el carrito?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.orderItems = [];
        Swal.fire({
          icon: 'success',
          title: 'Carrito vacío',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      }
    });
  }

  // Método para crear una versión de un ítem con una opción específica
  private _addItemToOrder(item: OrderItem, optionValue?: string): void {
    if (item.isTracked && typeof item.stockQuantity === 'number') {
      const currentQty = this.getItemQuantity(item.id, optionValue);
      if (item.stockQuantity <= currentQty) {
        if ('vibrate' in navigator) {
          navigator.vibrate(200);
        }
        Swal.fire({
          icon: 'error',
          title: 'Stock insuficiente',
          text: `Solo hay ${item.stockQuantity} unidades disponibles de "${item.name}"`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
    }

    const itemCopy = { ...item, selectedOption: optionValue };
    const existingItemIndex = this.orderItems.findIndex(
      order => order.id === itemCopy.id && order.selectedOption === optionValue
    );

    if (existingItemIndex !== -1) {
      this.orderItems[existingItemIndex].quantity += 1;
    } else {
      itemCopy.quantity = 1;
      this.orderItems.push(itemCopy);
    }

    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }

  addItemWithOption(item: OrderItem, optionValue: string): void {
    this._addItemToOrder(item, optionValue);
  }

  addToOrderNoOptions(item: OrderItem): void {
    this._addItemToOrder(item);
  }

  // Método actualizado para eliminar un ítem de la orden
  removeFromOrder(item: OrderItem): void {
    const existingItemIndex = this.orderItems.findIndex(
      order => order.id === item.id && order.selectedOption === item.selectedOption
    );

    if (existingItemIndex !== -1) {
      this.orderItems[existingItemIndex].quantity -= 1;

      if (this.orderItems[existingItemIndex].quantity === 0) {
        this.orderItems.splice(existingItemIndex, 1);
      }

      // Feedback táctil
      if ('vibrate' in navigator) {
        navigator.vibrate([30, 30, 30]);  // Patrón de vibración para eliminar
      }
    }
  }

  // Método para validar cliente por cédula
  validateCustomer(): void {
    if (this.isConsumidorFinal) return;

    const idNumberRegex = /^[0-9]{10}$/;
    if (!idNumberRegex.test(this.customer.idNumber)) {
      this.customer.name = '';
      return;
    }

    const clientDocRef = doc(
      this.firestore,
      `client/${this.customer.idNumber}`
    );
    getDoc(clientDocRef)
      .then((docSnapshot) => {
        if (docSnapshot.exists()) {
          const clientData = docSnapshot.data() as { name: string };
          this.customer.name = clientData.name;
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Cliente Encontrado',
            text: `Bienvenido, ${clientData.name}`,
            showConfirmButton: false,
            timer: 3000
          });
        } else {
          this.customer.name = '';
        }
      })
      .catch((error) => {
        console.error('Error validating customer:', error);
      });
  }

  // Método para confirmar el pedido
  async confirmOrder(): Promise<void> {
    // Verificar si hay una caja abierta
    this.cashRegisterService.isCashRegisterOpenToday().subscribe(isOpen => {
      if (!isOpen) {
        Swal.fire('Error', 'No se puede crear un pedido porque no hay una caja abierta.', 'error');
        return;
      }
    });

    // Validar que haya items en el carrito
    if (this.orderItems.length === 0) {
      Swal.fire('Error', 'El carrito está vacío. Agrega productos para continuar.', 'error');
      return;
    }

    // Validar datos del cliente
    if (!this.customer.name) {
      Swal.fire('Error', 'Debes ingresar un nombre para el pedido', 'error');
      return;
    }

    // Validar que haya mesas seleccionadas
    if (this.selectedTables.length === 0) {
      Swal.fire('Error', 'Debes seleccionar al menos una mesa', 'error');
      return;
    }

    if (this.isProcessingOrder) return;
    this.isProcessingOrder = true;

    try {
      // Mostrar indicador de carga adaptado para tablet
      Swal.fire({
        title: 'Procesando pedido',
        text: 'Por favor espera...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // Usar prepareItemsForSummary para asegurar que los ítems están correctamente agrupados
      let orderItems = this.prepareItemsForSummary().map(item => {
        // Crear una copia limpia del ítem, eliminando propiedades undefined
        const cleanItem: OrderItem = {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          status: item.status || 'En espera' // Mantener el estado si existe
        };

        // Añadir propiedades opcionales solo si tienen valor
        if (item.selectedOption) cleanItem.selectedOption = item.selectedOption;
        if (item.description) cleanItem.description = item.description;
        if (item.isTracked !== undefined) cleanItem.isTracked = item.isTracked;
        if (item.stockQuantity !== undefined) cleanItem.stockQuantity = item.stockQuantity;
        if (item.categoryId) cleanItem.categoryId = item.categoryId;
        if (item.categoryName) cleanItem.categoryName = item.categoryName;

        return cleanItem;
      });

      // Si estamos en modo edición, necesitamos manejar los ítems de manera diferente
      if (this.isEditing && this.editOrderId) {
        // Obtener el pedido original para preservar los ítems que no hemos modificado
        const orderRef = doc(this.firestore, 'orders', this.editOrderId);
        const orderSnapshot = await getDoc(orderRef);

        if (orderSnapshot.exists()) {
          const originalOrder = orderSnapshot.data() as any;
          const originalItems = originalOrder.items || [];

          // Vamos a construir un nuevo arreglo de ítems que combine los originales con los modificados
          const combinedItems: OrderItem[] = [];

          // 1. Añadir los ítems originales que NO están en la UI actual (posiblemente eliminados por el usuario)
          originalItems.forEach((origItem: OrderItem) => {
            // Si el ítem original no está en los ítems que el usuario ha modificado en la UI,
            // conservamos el ítem original tal como está
            const isInCurrentView = this.orderItems.some(uiItem =>
              uiItem.id === origItem.id &&
              uiItem.selectedOption === origItem.selectedOption
            );

            if (!isInCurrentView) {
              // Este ítem se mantiene como está en la BD, no lo tocamos
              combinedItems.push(origItem);
            }
          });

          // 2. Ahora agregamos los ítems que el usuario ha modificado o añadido
          orderItems.forEach(uiItem => {
            // Buscamos si este ítem ya existía en el pedido original
            const originalItem = originalItems.find((origItem: OrderItem) =>
              origItem.id === uiItem.id &&
              origItem.selectedOption === uiItem.selectedOption
            );

            if (originalItem) {
              // Si el ítem existía, actualizamos su cantidad y mantenemos su estado
              const updatedItem = {
                ...uiItem,
                status: originalItem.status || 'En espera'
              };
              combinedItems.push(updatedItem);
            } else {
              // Si es un ítem nuevo, lo agregamos con estado "En espera"
              combinedItems.push({
                ...uiItem,
                status: 'En espera'
              });
            }
          });

          // Usamos los ítems combinados para la actualización
          orderItems = combinedItems;
        }

        // Actualizamos el pedido en Firestore
        await updateDoc(orderRef, {
          customer: this.customer,
          isConsumidorFinal: this.isConsumidorFinal,
          tables: this.selectedTables,
          items: orderItems,
          total: this.getTotal(),
          updatedAt: new Date()  // Añadir fecha de actualización
        });

        Swal.close();
        Swal.fire({
          title: 'Pedido Actualizado',
          text: 'El pedido ha sido actualizado correctamente',
          icon: 'success',
          confirmButtonText: 'OK'
        }).then(() => {
          this.router.navigate(['/']);
        });
      } else {
        // Si es un nuevo pedido, seguir con el flujo normal
        const orderCollection = collection(this.firestore, 'orders');
        const clientDocRef = doc(
          this.firestore,
          `client/${this.customer.idNumber}`
        );

        // Añadir fecha de creación
        const newOrderData = {
          customer: this.customer,
          isConsumidorFinal: this.isConsumidorFinal,
          tables: this.selectedTables,
          items: orderItems,
          total: this.getTotal(),
          status: 'En espera',
          hasInvoice: false,
          date: new Date()
        };

        const docRef = await addDoc(orderCollection, newOrderData);

        // Procesar inventario
        if (orderItems.length > 0) {
          await this.inventoryService.processOrderInventory(docRef.id, orderItems);
        }

        Swal.close();
        Swal.fire({
          title: 'Pedido Confirmado',
          text: 'El pedido ha sido registrado correctamente',
          icon: 'success',
          confirmButtonText: 'OK'
        }).then(() => {
          // Guardar cliente solo si no es consumidor final
          if (!this.isConsumidorFinal) {
            getDoc(clientDocRef).then((docSnapshot) => {
              if (!docSnapshot.exists()) {
                setDoc(clientDocRef, this.customer)
                  .then(() => {
                    console.log('Cliente guardado');
                  })
                  .catch((error) =>
                    console.error('Error guardando cliente:', error)
                  );
              }
            });
          }
          this.resetForm();
        });
      }
    } catch (error) {
      console.error('Error al confirmar el pedido:', error);
      Swal.close();
      Swal.fire('Error', 'No se pudo confirmar el pedido', 'error');
    } finally {
      this.isProcessingOrder = false;
    }
  }

  // Método para identificar items nuevos o modificados en un pedido actualizado
  private getNewOrModifiedItems(currentItems: OrderItem[]): OrderItem[] {
    const result: OrderItem[] = [];

    // Filtrar items que no existían o que aumentaron su cantidad,
    // teniendo en cuenta las opciones seleccionadas
    currentItems.forEach(currentItem => {
      const originalItem = this.originalOrderItems.find(orig =>
        orig.id === currentItem.id &&
        orig.selectedOption === currentItem.selectedOption
      );

      if (!originalItem) {
        // Item completamente nuevo o con opción diferente
        result.push(currentItem);
      } else if (currentItem.quantity > originalItem.quantity) {
        // Item con cantidad aumentada, solo procesar la diferencia
        result.push({
          ...currentItem,
          quantity: currentItem.quantity - originalItem.quantity
        });
      }
    });

    return result;
  }

  // Método para calcular el total del pedido
  getTotal(): number {
    let total = 0;

    // Sumar los precios de los items actuales con sus opciones
    for (const item of this.orderItems) {
      const itemPrice = this.calculateItemPrice(item);
      total += itemPrice * item.quantity;
    }

    return total;
  }

  // Método para obtener el precio adicional de una opción específica
  getOptionPrice(optionName: string | undefined, item: OrderItem): number {
    if (!optionName) return 0; // Retornar 0 si optionName es undefined o vacío

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

  // Verificar si un ítem está en el carrito (para mostrar botones activados)
  isItemInCart(itemId: string, selectedOption?: string): boolean {
    return this.orderItems.some(item =>
      item.id === itemId && item.selectedOption === selectedOption
    );
  }

  // Obtener la cantidad de un ítem específico en el carrito
  getItemQuantity(itemId: string, selectedOption?: string): number {
    const item = this.orderItems.find((order) =>
      order.id === itemId &&
      order.selectedOption === selectedOption
    );
    return item ? item.quantity : 0;
  }

  // Generar una clave única para cada ítem basada en su ID y opción
  getItemKey(item: OrderItem): string {
    // Crear una clave única que combine el ID del ítem y la opción seleccionada
    return `${item.id}_${item.selectedOption || 'default'}`;
  }

  // Método para preparar los ítems para el resumen del carrito
  prepareItemsForSummary(): OrderItem[] {
    // Este método agrupa los ítems del pedido por ID y opción
    // para asegurar que se muestren correctamente en el resumen

    const groupedItems: Map<string, OrderItem> = new Map();

    this.orderItems.forEach(item => {
      const key = this.getItemKey(item);

      if (groupedItems.has(key)) {
        // Si ya existe este ítem con esta opción, actualizamos la cantidad
        const existingItem = groupedItems.get(key)!;
        existingItem.quantity += item.quantity;
      } else {
        // Si no existe, lo agregamos al mapa
        groupedItems.set(key, { ...item });
      }
    });

    // Convertir el mapa a un array para la vista
    return Array.from(groupedItems.values());
  }

  // Método para resetear el formulario
  private resetForm(): void {
    this.selectedTables = [];
    this.orderItems = [];
    this.isConsumidorFinal = false;
    this.customer = { name: '', idNumber: '' };
    this.isEditing = false;
    this.editOrderId = null;
    this.originalOrderItems = [];
  }

  // Navegar al inicio
  goToHome() {
    this.router.navigate(['/']);
  }

  // Calcular el precio de un ítem considerando sus opciones
  calculateItemPrice(item: OrderItem): number {
    let basePrice = item.price;

    // Añadir el costo adicional de la opción seleccionada si existe
    if (item.selectedOption && item.options && item.options.length > 0) {
      // Buscar la opción seleccionada
      const selectedOptionObj = item.options.find(opt =>
        this.isObject(opt) && opt.name === item.selectedOption
      );

      // Si la opción es un objeto y tiene un precio, sumarlo
      if (selectedOptionObj && this.isObject(selectedOptionObj) && selectedOptionObj.price) {
        basePrice += selectedOptionObj.price;
      }
    }

    return basePrice;
  }

  // Método para formatear el precio en términos monetarios
  formatCurrency(value: number): string {
    return value.toFixed(2);
  }

  // Crear un ítem con una opción específica
  createItemWithOption(item: OrderItem, optionValue: string): OrderItem {
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      description: item.description,
      options: item.options,
      selectedOption: optionValue,
      isTracked: item.isTracked,
      stockQuantity: item.stockQuantity,
      categoryId: item.categoryId,
      categoryName: item.categoryName
    };
  }

  // Método para mostrar el nombre del ítem con la opción
  getItemDisplayName(item: OrderItem): string {
    if (item.selectedOption) {
      return `${item.name} (${item.selectedOption})`;
    }
    return item.name;
  }
}