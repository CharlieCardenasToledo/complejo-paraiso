import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import Swal from 'sweetalert2';
import { OrderItem } from '../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private currentUser: any = null;

  constructor() {
    // Obtener datos del usuario actual
    this.authService.userData$.subscribe(user => {
      this.currentUser = user;
    });
  }

  /**
   * Procesa el inventario al crear un nuevo pedido
   * @param orderId ID del pedido
   * @param items Items del pedido
   * @returns Promise<boolean> indica si fue exitoso
   */
  async processOrderInventory(orderId: string, items: OrderItem[]): Promise<boolean> {
    try {
      // 1. Procesar platos completos rastreados
      await this.processDishesInventory(orderId, items);

      // 2. Procesar ingredientes de cada plato
      await this.processIngredientsInventory(orderId, items);

      return true;
    } catch (error) {
      console.error('Error al procesar inventario:', error);
      Swal.fire({
        icon: 'warning',
        title: 'Advertencia de Inventario',
        text: 'Se ha registrado el pedido, pero hubo un problema al actualizar el inventario',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000
      });
      return false;
    }
  }

  /**
   * Procesa el inventario para platos completos rastreados
   */
  private async processDishesInventory(orderId: string, items: OrderItem[]): Promise<void> {
    for (const item of items) {
      // Obtener información del plato para verificar si es rastreado
      const dishRef = doc(this.firestore, `menu/${item.id}`);
      const dishSnapshot = await getDoc(dishRef);

      if (dishSnapshot.exists()) {
        const dishData = dishSnapshot.data() as any;

        // Si el plato se rastrea como unidad completa
        if (dishData.isTracked) {
          const currentStock = dishData.stockQuantity || 0;
          const newStock = Math.max(0, currentStock - item.quantity);

          // Actualizar stock
          await updateDoc(dishRef, {
            stockQuantity: newStock,
            updatedAt: new Date()
          });

          // Registrar movimiento
          await this.registerDishMovement({
            dishId: item.id,
            dishName: item.name,
            previousQuantity: currentStock,
            newQuantity: newStock,
            quantity: -item.quantity,
            type: 'salida',
            reason: `Pedido #${orderId}`,
            orderId: orderId,
            createdBy: this.currentUser?.name || 'Sistema',
            createdAt: new Date()
          });

          // Mostrar alerta si el stock llega a cero
          if (newStock === 0) {
            Swal.fire({
              icon: 'warning',
              title: 'Stock Agotado',
              text: `El plato "${item.name}" se ha agotado`,
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 5000
            });
          } else if (newStock < 5) { // Alerta de stock bajo
            Swal.fire({
              icon: 'info',
              title: 'Stock Bajo',
              text: `Quedan ${newStock} unidades del plato "${item.name}"`,
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 5000
            });
          }
        }
      }
    }
  }

  /**
   * Procesa el inventario para ingredientes de los platos
   */
  private async processIngredientsInventory(orderId: string, items: OrderItem[]): Promise<void> {
    // Crear un mapa para rastrear los ingredientes que ya se han procesado
    const processedIngredients = new Map<string, number>();

    for (const item of items) {
      console.log(`Procesando ingredientes para: ${item.name}`);

      // Obtener información del plato para sus ingredientes
      const dishRef = doc(this.firestore, `menu/${item.id}`);
      const dishSnapshot = await getDoc(dishRef);

      if (dishSnapshot.exists()) {
        const dishData = dishSnapshot.data() as any;
        const ingredients = dishData.ingredients || [];
        console.log('Ingredientes encontrados:', ingredients);

        // Procesar cada ingrediente
        for (const ingredient of ingredients) {
          console.log(`Verificando ingrediente: ${ingredient.name}, isTracked: ${ingredient.isTracked}`);
          if (ingredient.isTracked) {
            const totalQuantity = ingredient.quantity * item.quantity;
            console.log(`Cantidad a reducir: ${totalQuantity}`);

            // Acumular cantidad para este ingrediente
            const currentTotal = processedIngredients.get(ingredient.id) || 0;
            processedIngredients.set(ingredient.id, currentTotal + totalQuantity);
          }
        }
      }
    }

    console.log('Ingredientes a procesar:', processedIngredients);

    // ESTA ES LA PARTE QUE FALTA - Procesar todos los ingredientes acumulados
    for (const [ingredientId, totalQuantity] of processedIngredients.entries()) {
      const inventoryRef = doc(this.firestore, `inventory/${ingredientId}`);
      const inventorySnapshot = await getDoc(inventoryRef);

      if (inventorySnapshot.exists()) {
        const inventoryData = inventorySnapshot.data() as any;
        const currentStock = inventoryData.quantity || 0;
        const newStock = Math.max(0, currentStock - totalQuantity);
        console.log(`Actualizando stock de ${inventoryData.name}: ${currentStock} -> ${newStock}`);

        // Actualizar stock
        await updateDoc(inventoryRef, {
          quantity: newStock,
          updatedAt: new Date()
        });

        // Registrar movimiento
        await this.registerInventoryMovement({
          itemId: ingredientId,
          itemName: inventoryData.name,
          previousQuantity: currentStock,
          newQuantity: newStock,
          quantity: -totalQuantity,
          type: 'salida',
          reason: `Pedido #${orderId}`,
          orderId: orderId,
          createdBy: this.currentUser?.name || 'Sistema',
          createdAt: new Date()
        });

        // Alertas de stock
        if (newStock === 0) {
          Swal.fire({
            icon: 'warning',
            title: 'Ingrediente Agotado',
            text: `El ingrediente "${inventoryData.name}" se ha agotado`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000
          });
        } else if (inventoryData.minStock && newStock <= inventoryData.minStock) {
          Swal.fire({
            icon: 'info',
            title: 'Stock Bajo',
            text: `El ingrediente "${inventoryData.name}" está por debajo del mínimo`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000
          });
        }
      }
    }
  }

  /**
   * Restaura el inventario al cancelar o eliminar un pedido
   */
  async restoreOrderInventory(orderId: string): Promise<boolean> {
    try {
      // 1. Restaurar platos completos
      await this.restoreDishesFromMovements(orderId);

      // 2. Restaurar ingredientes
      await this.restoreIngredientsFromMovements(orderId);

      return true;
    } catch (error) {
      console.error('Error al restaurar inventario:', error);
      return false;
    }
  }

  /**
   * Restaura platos desde los movimientos registrados
   */
  private async restoreDishesFromMovements(orderId: string): Promise<void> {
    const dishMovementsCollection = collection(this.firestore, 'dish_movements');
    const q = query(dishMovementsCollection, where('orderId', '==', orderId));

    const querySnapshot = await getDocs(q);

    for (const docSnapshot of querySnapshot.docs) {
      const movement = docSnapshot.data() as any;

      // Solo procesar salidas (evitar duplicados)
      if (movement.type === 'salida') {
        const dishRef = doc(this.firestore, `menu/${movement.dishId}`);
        const dishSnapshot = await getDoc(dishRef);

        if (dishSnapshot.exists()) {
          const dishData = dishSnapshot.data() as any;
          const currentStock = dishData.stockQuantity || 0;
          const restoredQuantity = Math.abs(movement.quantity);
          const newStock = currentStock + restoredQuantity;

          // Actualizar stock
          await updateDoc(dishRef, {
            stockQuantity: newStock,
            updatedAt: new Date()
          });

          // Registrar movimiento de restauración
          await this.registerDishMovement({
            dishId: movement.dishId,
            dishName: movement.dishName,
            previousQuantity: currentStock,
            newQuantity: newStock,
            quantity: restoredQuantity,
            type: 'entrada',
            reason: `Cancelación de Pedido #${orderId}`,
            orderId: orderId,
            createdBy: this.currentUser?.name || 'Sistema',
            createdAt: new Date()
          });
        }
      }
    }
  }

  /**
   * Restaura ingredientes desde los movimientos registrados
   */
  private async restoreIngredientsFromMovements(orderId: string): Promise<void> {
    const inventoryMovementsCollection = collection(this.firestore, 'inventory_movements');
    const q = query(inventoryMovementsCollection, where('orderId', '==', orderId));

    const querySnapshot = await getDocs(q);

    for (const docSnapshot of querySnapshot.docs) {
      const movement = docSnapshot.data() as any;

      // Solo procesar salidas (evitar duplicados)
      if (movement.type === 'salida') {
        const inventoryRef = doc(this.firestore, `inventory/${movement.itemId}`);
        const inventorySnapshot = await getDoc(inventoryRef);

        if (inventorySnapshot.exists()) {
          const inventoryData = inventorySnapshot.data() as any;
          const currentStock = inventoryData.quantity || 0;
          const restoredQuantity = Math.abs(movement.quantity);
          const newStock = currentStock + restoredQuantity;

          // Actualizar stock
          await updateDoc(inventoryRef, {
            quantity: newStock,
            updatedAt: new Date()
          });

          // Registrar movimiento de restauración
          await this.registerInventoryMovement({
            itemId: movement.itemId,
            itemName: movement.itemName,
            previousQuantity: currentStock,
            newQuantity: newStock,
            quantity: restoredQuantity,
            type: 'entrada',
            reason: `Cancelación de Pedido #${orderId}`,
            orderId: orderId,
            createdBy: this.currentUser?.name || 'Sistema',
            createdAt: new Date()
          });
        }
      }
    }
  }

  /**
   * Verifica disponibilidad en inventario antes de confirmar un pedido
   * @returns Promise con mensaje de error o null si todo está disponible
   */
  async checkInventoryAvailability(items: OrderItem[]): Promise<string | null> {
    try {
      // 1. Verificar platos completos rastreados
      const dishError = await this.checkDishesAvailability(items);
      if (dishError) return dishError;

      // 2. Verificar ingredientes
      const ingredientError = await this.checkIngredientsAvailability(items);
      if (ingredientError) return ingredientError;

      return null; // Todo disponible
    } catch (error) {
      console.error('Error al verificar inventario:', error);
      return 'Error al verificar disponibilidad de inventario';
    }
  }

  /**
   * Verifica disponibilidad de platos rastreados
   */
  private async checkDishesAvailability(items: OrderItem[]): Promise<string | null> {
    for (const item of items) {
      const dishRef = doc(this.firestore, `menu/${item.id}`);
      const dishSnapshot = await getDoc(dishRef);

      if (dishSnapshot.exists()) {
        const dishData = dishSnapshot.data() as any;

        if (dishData.isTracked) {
          const currentStock = dishData.stockQuantity || 0;

          if (currentStock < item.quantity) {
            return `No hay suficiente stock del plato "${item.name}". Disponible: ${currentStock}, Solicitado: ${item.quantity}`;
          }
        }
      }
    }

    return null; // Todos los platos están disponibles
  }

  /**
   * Verifica disponibilidad de ingredientes
   */
  private async checkIngredientsAvailability(items: OrderItem[]): Promise<string | null> {
    // Crear un mapa para rastrear la cantidad total necesaria de cada ingrediente
    const requiredIngredients = new Map<string, { name: string, quantity: number }>();

    // Calcular cantidad total necesaria de cada ingrediente
    for (const item of items) {
      const dishRef = doc(this.firestore, `menu/${item.id}`);
      const dishSnapshot = await getDoc(dishRef);

      if (dishSnapshot.exists()) {
        const dishData = dishSnapshot.data() as any;
        const ingredients = dishData.ingredients || [];

        for (const ingredient of ingredients) {
          if (ingredient.isTracked) {
            const totalRequired = ingredient.quantity * item.quantity;

            // Acumular cantidad para este ingrediente
            const current = requiredIngredients.get(ingredient.id);
            if (current) {
              requiredIngredients.set(ingredient.id, {
                name: ingredient.name,
                quantity: current.quantity + totalRequired
              });
            } else {
              requiredIngredients.set(ingredient.id, {
                name: ingredient.name,
                quantity: totalRequired
              });
            }
          }
        }
      }
    }

    // Verificar disponibilidad de cada ingrediente
    for (const [ingredientId, required] of requiredIngredients.entries()) {
      const inventoryRef = doc(this.firestore, `inventory/${ingredientId}`);
      const inventorySnapshot = await getDoc(inventoryRef);

      if (inventorySnapshot.exists()) {
        const inventoryData = inventorySnapshot.data() as any;
        const currentStock = inventoryData.quantity || 0;

        if (currentStock < required.quantity) {
          return `No hay suficiente stock del ingrediente "${required.name}". Disponible: ${currentStock} ${inventoryData.unit}, Necesario: ${required.quantity} ${inventoryData.unit}`;
        }
      } else {
        return `El ingrediente "${required.name}" no se encuentra en el inventario`;
      }
    }

    return null; // Todos los ingredientes están disponibles
  }

  /**
   * Registra un movimiento de plato en el historial
   */
  private async registerDishMovement(movementData: any): Promise<void> {
    const movementsCollection = collection(this.firestore, 'dish_movements');
    await addDoc(movementsCollection, movementData);
  }

  /**
   * Registra un movimiento de inventario en el historial
   */
  private async registerInventoryMovement(movementData: any): Promise<void> {
    const movementsCollection = collection(this.firestore, 'inventory_movements');
    await addDoc(movementsCollection, movementData);
  }
}