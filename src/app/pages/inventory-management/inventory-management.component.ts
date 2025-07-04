import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  getDocs,
  where
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { BalanceTransaction, Dish, InventoryBalance, InventoryItem, InventoryMovement } from '../../models/data.model';
import { BalanceService } from '../../services/balance.service';

@Component({
    selector: 'app-inventory-management',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './inventory-management.component.html',
    styleUrl: './inventory-management.component.scss'
})
export class InventoryManagementComponent implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private router = inject(Router);

  inventoryItems: InventoryItem[] = [];
  trackedDishes: Dish[] = [];
  movements: InventoryMovement[] = [];
  loading = true;
  error: string | null = null;
  currentUser: any = null;

  // Para el formulario
  isEditing = false;
  currentItem: InventoryItem = this.resetItemForm();

  // Control de la interfaz móvil
  activeTab: string = 'inventory'; // Controla la pestaña activa en móvil ('inventory', 'dishes', 'movements')
  showFilters: boolean = false; // Controla la visibilidad del panel de filtros colapsable

  // Estado adicional para el componente
  uniqueCategories: string[] = []; // Almacena las categorías únicas para el dropdown
  // Para movimiento de inventario
  showMovementForm = false;
  newMovement = {
    itemId: '',
    quantity: 0,
    type: 'entrada' as 'entrada' | 'salida' | 'ajuste',
    reason: '',
    monetaryValue: 0
  };

  // Filtros
  selectedCategory = 'all';
  showInactive = false;
  searchTerm = '';
  showLowStock = false;

  // Movimientos
  movementsLimit = 10;
  showAllMovements = false;

  balanceInfo: InventoryBalance | null = null;
  balanceTransactions: BalanceTransaction[] = [];
  newInitialBalance: number = 0;
  newBalanceTransaction = {
    type: 'entrada' as 'entrada' | 'salida',
    amount: 0,
    description: ''
  };
  transactionsLimit: number = 10;

  constructor(private balanceService: BalanceService) {
    // Verificar acceso de administrador
    this.authService.isAdmin$.subscribe(isAdmin => {
      if (!isAdmin) {
        this.router.navigate(['/login']);
      }
    });

    // Obtener datos del usuario actual
    this.authService.userData$.subscribe(user => {
      this.currentUser = user;
    });
  }

  ngOnInit(): void {
    this.loadInventory();
    this.loadTrackedDishes();
    this.loadRecentMovements();
    this.loadBalanceInfo();
    this.loadBalanceTransactions();
  }
  loadBalanceInfo(): void {
    this.balanceService.getBalance().subscribe({
      next: (data) => {
        this.balanceInfo = data;
        this.newInitialBalance = data.initialBalance;
      },
      error: (err) => {
        console.error('Error al cargar información de saldo:', err);
      }
    });
  }

  loadBalanceTransactions(): void {
    this.balanceService.getTransactions(this.transactionsLimit).subscribe({
      next: (data) => {
        this.balanceTransactions = data;
      },
      error: (err) => {
        console.error('Error al cargar transacciones:', err);
      }
    });
  }

  /**
 * Obtiene las categorías únicas del inventario
 * Debe llamarse cuando se carga el inventario
 */
  getUniqueCategories(): string[] {
    // Si ya tenemos las categorías calculadas, devolverlas
    if (this.uniqueCategories.length > 0) {
      return this.uniqueCategories;
    }

    // Extraer categorías únicas
    const categories = this.inventoryItems
      .map(item => item.category || 'Sin categoría')
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();

    this.uniqueCategories = categories;
    return categories;
  }
  updateInitialBalance(): void {
    if (this.newInitialBalance < 0) {
      Swal.fire('Error', 'El saldo inicial no puede ser negativo', 'error');
      return;
    }

    Swal.fire({
      title: '¿Actualizar saldo inicial?',
      text: `El saldo inicial se establecerá en $${this.newInitialBalance.toFixed(2)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, actualizar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.balanceService.setInitialBalance(
          this.newInitialBalance,
          this.currentUser?.name || 'Administrador'
        ).then(() => {
          Swal.fire('¡Éxito!', 'Saldo inicial actualizado correctamente', 'success');
          this.loadBalanceInfo();
          this.loadBalanceTransactions();
        }).catch(err => {
          console.error('Error al actualizar saldo inicial:', err);
          Swal.fire('Error', 'No se pudo actualizar el saldo inicial', 'error');
        });
      }
    });
  }

  addBalanceTransaction(): void {
    if (this.newBalanceTransaction.amount <= 0) {
      Swal.fire('Error', 'El monto debe ser mayor que cero', 'error');
      return;
    }

    if (!this.newBalanceTransaction.description.trim()) {
      Swal.fire('Error', 'Debe ingresar una descripción para la transacción', 'error');
      return;
    }

    Swal.fire({
      title: '¿Registrar transacción?',
      text: `Se ${this.newBalanceTransaction.type === 'entrada' ? 'añadirán' : 'restarán'} $${this.newBalanceTransaction.amount.toFixed(2)} al saldo`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, registrar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.balanceService.updateBalance(
          this.newBalanceTransaction.amount,
          this.newBalanceTransaction.type,
          this.newBalanceTransaction.description,
          this.currentUser?.name || 'Administrador'
        ).then((success) => {
          if (success) {
            Swal.fire('¡Éxito!', 'Transacción registrada correctamente', 'success');
            this.loadBalanceInfo();
            this.loadBalanceTransactions();
            this.newBalanceTransaction = {
              type: 'entrada',
              amount: 0,
              description: ''
            };
          } else {
            Swal.fire('Error', 'Saldo insuficiente para esta operación', 'error');
          }
        }).catch(err => {
          console.error('Error al registrar transacción:', err);
          Swal.fire('Error', 'No se pudo registrar la transacción', 'error');
        });
      }
    });
  }

  loadMoreTransactions(): void {
    this.transactionsLimit += 10;
    this.loadBalanceTransactions();
  }

  /**
   * Obtiene el número de elementos con stock bajo
   */
  getLowStockCount(): number {
    return this.inventoryItems.filter(item =>
      item.active &&
      item.minStock &&
      item.quantity <= item.minStock &&
      item.quantity > 0
    ).length;
  }

  /**
   * Obtiene el número de elementos agotados
   */
  getOutOfStockCount(): number {
    return this.inventoryItems.filter(item =>
      item.active && item.quantity <= 0
    ).length;
  }

  /**
   * Obtiene el número de elementos inactivos
   */
  getInactiveCount(): number {
    return this.inventoryItems.filter(item => !item.active).length;
  }

  /**
   * Devuelve la clase CSS según el estado del stock
   */
  getStockStatusClass(item: any): string {
    if (item.quantity <= 0) {
      return 'bg-red-100 text-red-800';
    } else if (item.minStock && item.quantity <= item.minStock) {
      return 'bg-yellow-100 text-yellow-800';
    } else {
      return 'bg-green-100 text-green-800';
    }
  }

  /**
   * Devuelve la clase CSS según el estado del stock del plato
   */
  getDishStockClass(dish: any): string {
    const quantity = dish.stockQuantity || 0;
    if (quantity <= 0) {
      return 'bg-red-100 text-red-800';
    } else if (quantity < 5) { // Puedes ajustar este umbral según tus necesidades
      return 'bg-yellow-100 text-yellow-800';
    } else {
      return 'bg-green-100 text-green-800';
    }
  }

  /**
   * Devuelve la clase CSS según el tipo de movimiento
   */
  getMovementTypeClass(type: string): string {
    switch (type) {
      case 'entrada':
        return 'bg-green-100 text-green-800';
      case 'salida':
        return 'bg-red-100 text-red-800';
      case 'ajuste':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  /**
   * Formatea una fecha para mostrarla
   */
  formatDate(date: any): string {
    if (!date) return '';

    // Si es un timestamp de Firestore
    if (date.toDate) {
      date = date.toDate();
    }

    // Convertir a objeto Date si es string
    if (typeof date === 'string') {
      date = new Date(date);
    }

    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  loadInventory(): void {
    this.loading = true;
    const inventoryCollection = collection(this.firestore, 'inventory');

    const inventoryQuery = query(
      inventoryCollection,
      orderBy('name', 'asc')
    );

    collectionData(inventoryQuery, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.inventoryItems = data.map(item => ({
          ...item,
          lastRestocked: item.lastRestocked?.toDate(),
          createdAt: item.createdAt?.toDate(),
          updatedAt: item.updatedAt?.toDate()
        }));
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar inventario:', err);
        this.error = 'Error al cargar inventario. Intente nuevamente.';
        this.loading = false;
      }
    });
  }

  async loadTrackedDishes(): Promise<void> {
    const dishesCollection = collection(this.firestore, 'menu');
    const dishesQuery = query(
      dishesCollection,
      where('isTracked', '==', true),
      where('active', '==', true)
    );

    try {
      const snapshot = await getDocs(dishesQuery);
      this.trackedDishes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Dish[];
    } catch (err) {
      console.error('Error al cargar platos rastreados:', err);
    }
  }

  loadRecentMovements(): void {
    const movementsCollection = collection(this.firestore, 'inventory_movements');

    const movementsQuery = query(
      movementsCollection,
      orderBy('createdAt', 'desc')
    );

    collectionData(movementsQuery, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.movements = data.map(movement => ({
          ...movement,
          createdAt: movement.createdAt?.toDate()
        }));
      },
      error: (err) => {
        console.error('Error al cargar movimientos:', err);
      }
    });
  }

  getFilteredInventory(): InventoryItem[] {
    return this.inventoryItems.filter(item => {
      // Filtrar por estado
      if (!this.showInactive && !item.active) return false;

      // Filtrar por categoría
      if (this.selectedCategory !== 'all' && item.category !== this.selectedCategory) return false;

      // Filtrar por término de búsqueda
      if (this.searchTerm && !item.name.toLowerCase().includes(this.searchTerm.toLowerCase())) return false;

      // Filtrar por stock bajo
      if (this.showLowStock && (!item.minStock || item.quantity > item.minStock)) return false;

      return true;
    });
  }

  getFilteredMovements(): InventoryMovement[] {
    let filtered = [...this.movements];

    if (!this.showAllMovements) {
      filtered = filtered.slice(0, this.movementsLimit);
    }

    return filtered;
  }

  createItem(): void {
    if (!this.validateForm()) return;

    const newItem: InventoryItem = {
      ...this.currentItem,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRestocked: new Date()
    };

    const inventoryCollection = collection(this.firestore, 'inventory');

    // Verificar si hay valor monetario asociado al crear el ítem
    const hasCost = newItem.cost && newItem.cost > 0 && newItem.quantity > 0;
    const initialCost = hasCost ? (newItem.cost ?? 0) * newItem.quantity : 0;

    // Si hay costo, verificar saldo
    if (hasCost) {
      this.balanceService.getBalance().subscribe(balance => {
        if (balance.currentBalance < initialCost) {
          Swal.fire({
            title: 'Saldo Insuficiente',
            text: `El costo inicial ($${initialCost.toFixed(2)}) excede el saldo disponible ($${balance.currentBalance.toFixed(2)})`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Continuar de todos modos',
            cancelButtonText: 'Cancelar'
          }).then((result) => {
            if (result.isConfirmed) {
              this.finalizeItemCreation(newItem, initialCost);
            }
          });
        } else {
          this.finalizeItemCreation(newItem, initialCost);
        }
      });
    } else {
      this.finalizeItemCreation(newItem, 0);
    }
  }

  // Nuevo método para finalizar la creación del ítem
  finalizeItemCreation(newItem: InventoryItem, initialCost: number): void {
    const inventoryCollection = collection(this.firestore, 'inventory');

    addDoc(inventoryCollection, newItem)
      .then((docRef) => {
        // Registrar movimiento de entrada inicial
        this.registerMovement({
          itemId: docRef.id,
          itemName: newItem.name,
          previousQuantity: 0,
          newQuantity: newItem.quantity,
          quantity: newItem.quantity,
          type: 'entrada',
          reason: 'Creación inicial de artículo',
          createdBy: this.currentUser?.name || 'Administrador',
          createdAt: new Date()
        });

        // Si hay un costo inicial, actualizar el saldo
        if (initialCost > 0) {
          this.balanceService.updateBalance(
            initialCost,
            'salida',
            `Inversión inicial en ${newItem.name} (${newItem.quantity} ${newItem.unit})`,
            this.currentUser?.name || 'Administrador',
            docRef.id,
            newItem.name
          );
        }

        Swal.fire('¡Éxito!', 'Artículo creado correctamente', 'success');
        this.resetForm();
        this.loadBalanceInfo();
        this.loadBalanceTransactions();
      })
      .catch(err => {
        console.error('Error al crear artículo:', err);
        Swal.fire('Error', 'No se pudo crear el artículo', 'error');
      });
  }
  editItem(item: InventoryItem): void {
    this.isEditing = true;
    this.currentItem = { ...item };

    // Desplazar al formulario
    setTimeout(() => {
      document.getElementById('inventoryForm')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  updateItem(): void {
    if (!this.validateForm() || !this.currentItem.id) return;

    // Guardar datos anteriores para registro
    const previousItem = this.inventoryItems.find(i => i.id === this.currentItem.id);
    if (!previousItem) {
      Swal.fire('Error', 'No se pudo encontrar la información original del artículo', 'error');
      return;
    }

    const previousQuantity = previousItem.quantity || 0;
    const quantityDifference = this.currentItem.quantity - previousQuantity;

    // Calcular si hay un cambio de costo que afecte al balance
    let costImpact = 0;
    if (quantityDifference > 0 && this.currentItem.cost) {
      // Si aumentó la cantidad, calcular el costo adicional
      costImpact = quantityDifference * this.currentItem.cost;
    }

    // Si hay impacto en costo, verificar saldo
    if (costImpact > 0) {
      this.balanceService.getBalance().subscribe(balance => {
        if (balance.currentBalance < costImpact) {
          Swal.fire({
            title: 'Saldo Insuficiente',
            text: `El aumento de inventario tiene un costo ($${costImpact.toFixed(2)}) que excede el saldo disponible ($${balance.currentBalance.toFixed(2)})`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Continuar de todos modos',
            cancelButtonText: 'Cancelar'
          }).then((result) => {
            if (result.isConfirmed) {
              this.finalizeItemUpdate(previousItem, costImpact);
            }
          });
        } else {
          this.finalizeItemUpdate(previousItem, costImpact);
        }
      });
    } else {
      this.finalizeItemUpdate(previousItem, costImpact);
    }
  }

  // Nuevo método para finalizar la actualización
  finalizeItemUpdate(previousItem: InventoryItem, costImpact: number): void {
    const itemRef = doc(this.firestore, `inventory/${this.currentItem.id}`);
    const updatedItem = {
      ...this.currentItem,
      updatedAt: new Date()
    };

    updateDoc(itemRef, updatedItem)
      .then(() => {
        // Si la cantidad ha cambiado, registrar un ajuste
        if (previousItem.quantity !== this.currentItem.quantity) {
          this.registerMovement({
            itemId: this.currentItem.id!,
            itemName: this.currentItem.name,
            previousQuantity: previousItem.quantity,
            newQuantity: this.currentItem.quantity,
            quantity: this.currentItem.quantity - previousItem.quantity,
            type: 'ajuste',
            reason: 'Actualización manual',
            createdBy: this.currentUser?.name || 'Administrador',
            createdAt: new Date()
          });

          // Si hay impacto en costo, actualizar el saldo
          if (costImpact > 0) {
            this.balanceService.updateBalance(
              costImpact,
              'salida',
              `Ajuste de inventario: ${this.currentItem.name} (+${this.currentItem.quantity - previousItem.quantity} ${this.currentItem.unit})`,
              this.currentUser?.name || 'Administrador',
              this.currentItem.id,
              this.currentItem.name
            );
          }
        }

        Swal.fire('¡Éxito!', 'Artículo actualizado correctamente', 'success');
        this.resetForm();
        this.loadBalanceInfo();
        this.loadBalanceTransactions();
      })
      .catch(err => {
        console.error('Error al actualizar artículo:', err);
        Swal.fire('Error', 'No se pudo actualizar el artículo', 'error');
      });
  }

  deleteItem(item: InventoryItem): void {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Quieres eliminar el artículo "${item.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed && item.id) {
        const itemRef = doc(this.firestore, `inventory/${item.id}`);

        // Verificar si el artículo tiene valor en inventario
        const itemValue = (item.cost || 0) * item.quantity;

        deleteDoc(itemRef)
          .then(() => {
            // Si el artículo tenía valor, registrar como pérdida en el balance
            if (itemValue > 0) {
              this.balanceService.updateBalance(
                itemValue,
                'salida',
                `Baja de inventario: ${item.name} (${item.quantity} ${item.unit})`,
                this.currentUser?.name || 'Administrador',
                item.id,
                item.name
              );
            }

            Swal.fire('¡Eliminado!', 'El artículo ha sido eliminado', 'success');
            this.loadBalanceInfo();
            this.loadBalanceTransactions();
          })
          .catch(err => {
            console.error('Error al eliminar artículo:', err);
            Swal.fire('Error', 'No se pudo eliminar el artículo', 'error');
          });
      }
    });
  }

  toggleItemStatus(item: InventoryItem): void {
    if (!item.id) return;

    const itemRef = doc(this.firestore, `inventory/${item.id}`);
    const newStatus = !item.active;

    updateDoc(itemRef, {
      active: newStatus,
      updatedAt: new Date()
    })
      .then(() => {
        const action = newStatus ? 'activado' : 'desactivado';
        Swal.fire('¡Actualizado!', `El artículo ha sido ${action}`, 'success');
      })
      .catch(err => {
        console.error('Error al cambiar estado del artículo:', err);
        Swal.fire('Error', 'No se pudo cambiar el estado del artículo', 'error');
      });
  }

  openMovementForm(item: InventoryItem | null = null): void {
    this.showMovementForm = true;
    this.newMovement = {
      itemId: item?.id || '',
      quantity: 0,
      type: 'entrada',
      reason: '',
      monetaryValue: 0
    };

    // Desplazar al formulario
    setTimeout(() => {
      document.getElementById('movementForm')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  updateDishStock(dish: Dish): void {
    if (!dish.id) return;

    Swal.fire({
      title: 'Actualizar Stock',
      text: `Stock actual: ${dish.stockQuantity || 0}`,
      input: 'number',
      inputAttributes: {
        min: '0',
        step: '1'
      },
      inputValue: dish.stockQuantity?.toString() || '0',
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      showLoaderOnConfirm: true,
      preConfirm: (newStock) => {
        if (newStock === '') {
          Swal.showValidationMessage('Debe ingresar un valor');
          return false;
        }

        const stockNumber = parseInt(newStock);

        if (isNaN(stockNumber) || stockNumber < 0) {
          Swal.showValidationMessage('Debe ingresar un número válido mayor o igual a 0');
          return false;
        }

        return stockNumber;
      }
    }).then((result) => {
      if (result.isConfirmed && dish.id) {
        const newStock = result.value;
        const dishRef = doc(this.firestore, `menu/${dish.id}`);

        updateDoc(dishRef, {
          stockQuantity: newStock,
          updatedAt: new Date()
        })
          .then(() => {
            // Registrar movimiento
            const movementsCollection = collection(this.firestore, 'dish_movements');
            addDoc(movementsCollection, {
              dishId: dish.id,
              dishName: dish.name,
              previousQuantity: dish.stockQuantity || 0,
              newQuantity: newStock,
              quantity: newStock - (dish.stockQuantity || 0),
              type: 'ajuste',
              reason: 'Actualización manual',
              createdBy: this.currentUser?.name || 'Administrador',
              createdAt: new Date()
            });

            Swal.fire('¡Actualizado!', `Stock actualizado correctamente`, 'success');
            this.loadTrackedDishes(); // Recargar platos
          })
          .catch(err => {
            console.error('Error al actualizar stock:', err);
            Swal.fire('Error', 'No se pudo actualizar el stock', 'error');
          });
      }
    });
  }

  registerMovement(movementData: InventoryMovement): Promise<void> {
    const movementsCollection = collection(this.firestore, 'inventory_movements');
    return addDoc(movementsCollection, movementData)
      .then(() => {
        // El movimiento se registró correctamente
        this.loadRecentMovements(); // Recargar movimientos
      })
      .catch(err => {
        console.error('Error al registrar movimiento:', err);
      });
  }
  // Añadir este método a la clase
  getCalculatedValue(): string {
    if (!this.newMovement.itemId || this.newMovement.quantity <= 0) {
      return "0.00";
    }

    const item = this.inventoryItems.find(i => i.id === this.newMovement.itemId);
    if (!item || !item.cost) {
      return "Sin costo unitario definido";
    }

    const calculatedValue = item.cost * this.newMovement.quantity;
    return calculatedValue.toFixed(2);
  }
  handleMovement(): void {
    if (!this.validateMovementForm()) return;

    // Obtener artículo seleccionado
    const item = this.inventoryItems.find(i => i.id === this.newMovement.itemId);
    if (!item) {
      Swal.fire('Error', 'Artículo no encontrado', 'error');
      return;
    }

    // Calcular nueva cantidad basada en el tipo de movimiento
    let newQuantity: number;
    if (this.newMovement.type === 'entrada') {
      newQuantity = item.quantity + this.newMovement.quantity;
    } else if (this.newMovement.type === 'salida') {
      newQuantity = item.quantity - this.newMovement.quantity;

      // Verificar si hay suficiente stock para la salida
      if (newQuantity < 0) {
        Swal.fire('Error', 'No hay suficiente stock para esta salida', 'error');
        return;
      }
    } else { // ajuste
      newQuantity = this.newMovement.quantity;
    }

    // Calcular automáticamente el valor monetario basado en el costo del ítem
    let monetaryValue = 0;
    if (item.cost && item.cost > 0) {
      monetaryValue = item.cost * this.newMovement.quantity;
      // Actualizar el valor en el formulario para que el usuario vea el monto
      this.newMovement.monetaryValue = monetaryValue;
    } else if (this.newMovement.monetaryValue > 0) {
      // Si el usuario ingresó un valor manualmente y el item no tiene costo unitario, usamos ese
      monetaryValue = this.newMovement.monetaryValue;
    }

    // Siempre verificar el saldo antes de proceder
    this.balanceService.getBalance().subscribe(balance => {
      // Si es entrada (compra) y tiene valor monetario, verificar saldo
      if (this.newMovement.type === 'entrada' && monetaryValue > 0 && balance.currentBalance < monetaryValue) {
        Swal.fire({
          title: 'Saldo Insuficiente',
          text: `No hay suficiente saldo para esta compra. Saldo actual: $${balance.currentBalance.toFixed(2)}`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Continuar de todos modos',
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            this.processInventoryMovementWithBalance(item, newQuantity, monetaryValue);
          }
        });
      } else {
        this.processInventoryMovementWithBalance(item, newQuantity, monetaryValue);
      }
    });
  }

  processInventoryMovementWithBalance(item: InventoryItem, newQuantity: number, monetaryValue: number): void {
    const itemRef = doc(this.firestore, `inventory/${item.id}`);
    const previousQuantity = item.quantity;

    // Actualizar cantidad en inventario
    updateDoc(itemRef, {
      quantity: newQuantity,
      updatedAt: new Date(),
      ...(this.newMovement.type === 'entrada' ? { lastRestocked: new Date() } : {})
    })
      .then(() => {
        // Registrar movimiento de inventario
        const quantity = this.newMovement.type === 'ajuste'
          ? newQuantity - item.quantity
          : this.newMovement.type === 'entrada'
            ? this.newMovement.quantity
            : -this.newMovement.quantity;

        this.registerMovement({
          itemId: item.id!,
          itemName: item.name,
          previousQuantity,
          newQuantity,
          quantity,
          type: this.newMovement.type,
          reason: this.newMovement.reason || 'Sin razón especificada',
          createdBy: this.currentUser?.name || 'Administrador',
          createdAt: new Date(),
          monetaryValue: monetaryValue, // Guardar el valor monetario en el movimiento
        })
          .then(() => {
            // Siempre actualizar el saldo si hay un valor monetario
            if (monetaryValue > 0) {
              // Para entradas, es un gasto (salida de dinero)
              // Para salidas, es un ingreso (entrada de dinero)
              const balanceType = this.newMovement.type === 'entrada' ? 'salida' : 'entrada';

              this.balanceService.updateBalance(
                monetaryValue,
                balanceType,
                `${this.newMovement.type === 'entrada' ? 'Compra' : 'Venta'} de ${item.name} (${this.newMovement.quantity} ${item.unit})`,
                this.currentUser?.name || 'Administrador',
                item.id,
                item.name
              ).then(() => {
                // Si es una entrada, actualizar el costo unitario si es necesario (para mantenerlo actualizado)
                if (this.newMovement.type === 'entrada' && this.newMovement.monetaryValue > 0 && (!item.cost || item.cost === 0)) {
                  const unitCost = this.newMovement.monetaryValue / this.newMovement.quantity;
                  updateDoc(itemRef, { cost: unitCost });
                }

                Swal.fire('¡Éxito!', 'Movimiento registrado correctamente', 'success');
                this.showMovementForm = false;
                this.newMovement = {
                  itemId: '',
                  quantity: 0,
                  type: 'entrada',
                  reason: '',
                  monetaryValue: 0
                };
                this.loadInventory();
                this.loadBalanceInfo();
                this.loadBalanceTransactions();
              });
            } else {
              Swal.fire('¡Éxito!', 'Movimiento registrado correctamente', 'success');
              this.showMovementForm = false;
              this.newMovement = {
                itemId: '',
                quantity: 0,
                type: 'entrada',
                reason: '',
                monetaryValue: 0
              };
              this.loadInventory();
            }
          });
      })
      .catch(err => {
        console.error('Error al actualizar inventario:', err);
        Swal.fire('Error', 'No se pudo registrar el movimiento', 'error');
      });
  }
  validateMovementForm(): boolean {
    if (!this.newMovement.itemId) {
      Swal.fire('Error', 'Debe seleccionar un artículo', 'error');
      return false;
    }

    if (this.newMovement.quantity <= 0) {
      Swal.fire('Error', 'La cantidad debe ser mayor que 0', 'error');
      return false;
    }

    return true;
  }

  resetForm(): void {
    this.isEditing = false;
    this.showMovementForm = false; // Asegúrate de cerrar el formulario de movimientos
    this.currentItem = this.resetItemForm();

    // Añade esta línea para asegurar que el formulario sea visible
    this.activeTab = 'newItem'; // Nueva pestaña para crear/editar artículos
  }
  validateForm(): boolean {
    if (!this.currentItem.name || this.currentItem.name.trim() === '') {
      Swal.fire('Error', 'El nombre del artículo es obligatorio', 'error');
      return false;
    }

    if (this.currentItem.quantity < 0) {
      Swal.fire('Error', 'La cantidad no puede ser negativa', 'error');
      return false;
    }

    if (!this.currentItem.unit || this.currentItem.unit.trim() === '') {
      Swal.fire('Error', 'La unidad de medida es obligatoria', 'error');
      return false;
    }

    return true;
  }

  private resetItemForm(): InventoryItem {
    return {
      name: '',
      description: '',
      quantity: 0,
      unit: 'unidad',
      minStock: 0,
      cost: 0,
      category: '',
      location: '',
      supplier: '',
      active: true
    };
  }

  getStockLevel(item: InventoryItem): 'normal' | 'bajo' | 'crítico' {
    if (!item.minStock) return 'normal';

    if (item.quantity <= 0) {
      return 'crítico';
    } else if (item.quantity <= item.minStock) {
      return 'bajo';
    } else {
      return 'normal';
    }
  }
  updateMonetaryValue(): void {
    if (!this.newMovement.itemId || this.newMovement.quantity <= 0) {
      this.newMovement.monetaryValue = 0;
      return;
    }

    const item = this.inventoryItems.find(i => i.id === this.newMovement.itemId);
    if (item && item.cost) {
      this.newMovement.monetaryValue = item.cost * this.newMovement.quantity;
    }
  }


}

