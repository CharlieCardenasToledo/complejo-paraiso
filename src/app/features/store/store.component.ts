import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  where,
  orderBy
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { CartItem, Category, StoreItem } from '../../models/data.model';
import { InventoryService } from '../../core/services/inventory.service';
import { CashRegisterService } from '../../core/services/cash-register.service';

@Component({
    selector: 'app-store',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './store.component.html',
    styleUrls: ['./store.component.scss']
})
export class StoreComponent implements OnInit {
  private firestore = inject(Firestore);
  private router = inject(Router);
  private inventoryService = inject(InventoryService);
  private cashRegisterService = inject(CashRegisterService);


  // Estado del componente
  searchQuery = '';
  storeCategories: Category[] = [];
  filteredCategories: Category[] = [];
  cart: CartItem[] = [];
  totalAmount = 0;
  isProcessingOrder = false;

  // Categorías específicas para la tienda (las que excluimos en cocina)
  storeCategoryIds: string[] = ['JWXmTEO143llfKM5PmkU', 'p4r4p8ofhtPIOrf4M14c', 'UmMtTqxhOZETuKr7tVMd']; // piscina, tienda, heladeria

  ngOnInit(): void {
    // Cargar las categorías específicas de tienda
    this.loadStoreCategories();
  }

  private loadStoreCategories(): void {
    // 1. Primero cargar las categorías activas (filtradas por categorías específicas de tienda)
    const categoriesCollection = collection(this.firestore, 'categories');
    const categoriesQuery = query(
      categoriesCollection,
      where('active', '==', true),
      orderBy('order', 'asc')
    );

    collectionData(categoriesQuery, { idField: 'id' }).subscribe(
      (categoriesData: any[]) => {
        const categoriesMap = new Map<string, Category>();

        // Filtrar solo para incluir las categorías específicas de la tienda
        const filteredCategories = categoriesData.filter(category =>
          this.storeCategoryIds.includes(category.id)
        );

        // Inicializar las categorías vacías
        filteredCategories.forEach(category => {
          categoriesMap.set(category.id, {
            id: category.id,
            name: category.name,
            items: []
          });
        });

        // 2. Luego cargar los productos y asignarlos a sus categorías
        const productsCollection = collection(this.firestore, 'menu');
        const productsQuery = query(
          productsCollection,
          where('active', '==', true)
        );

        collectionData(productsQuery, { idField: 'id' }).subscribe(
          (productsData: any[]) => {
            // Agregar cada producto a su categoría correspondiente
            productsData.forEach(product => {
              const categoryId = product.categoryId;

              // Si la categoría existe y está en las categorías de tienda
              if (categoryId && categoriesMap.has(categoryId)) {
                const storeItem: StoreItem = {
                  id: product.id,
                  name: product.name,
                  price: Number(product.price) || 0,
                  quantity: 0,
                  description: product.description || '',
                  isTracked: product.isTracked || false,
                  stockQuantity: product.stockQuantity || 0,
                  categoryId: categoryId,
                  categoryName: categoriesMap.get(categoryId)?.name || ''
                };

                categoriesMap.get(categoryId)?.items.push(storeItem);
              }
            });

            // Convertir el mapa a un array de categorías
            this.storeCategories = Array.from(categoriesMap.values())
              .filter(category => category.items.length > 0); // Filtrar categorías vacías

            this.filteredCategories = [...this.storeCategories];

            // Mostrar mensaje si no hay categorías configuradas
            if (this.storeCategories.length === 0) {
              Swal.fire('Tienda sin productos', 'No hay productos configurados para la tienda', 'info');
            }
          },
          (error) => {
            Swal.fire('Error', 'No se pudo cargar los productos', 'error');
            console.error('Error loading products:', error);
          }
        );
      },
      (error) => {
        Swal.fire('Error', 'No se pudo cargar las categorías', 'error');
        console.error('Error loading categories:', error);
      }
    );
  }

  filterProducts(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredCategories = this.storeCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          item.name.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.items.length > 0);
  }

  // Ya no necesitamos el método setActiveTab porque no estamos usando pestañas

  addToCart(item: StoreItem): void {
    // Verificar disponibilidad de stock para productos con seguimiento
    if (item.isTracked && typeof item.stockQuantity === 'number') {
      // Buscar si ya está en el carrito 
      const existingItem = this.cart.find((cartItem) => cartItem.id === item.id);
      const currentQuantityInCart = existingItem ? existingItem.quantity : 0;

      // Verificar si hay suficiente stock
      if (item.stockQuantity <= currentQuantityInCart) {
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

    // Buscar si ya existe el producto en el carrito
    const existingItemIndex = this.cart.findIndex((cartItem) => cartItem.id === item.id);

    if (existingItemIndex !== -1) {
      // Si existe, incrementar cantidad
      this.cart[existingItemIndex].quantity += 1;
      this.cart[existingItemIndex].subtotal = this.cart[existingItemIndex].price * this.cart[existingItemIndex].quantity;
    } else {
      // Si no existe, agregarlo como nuevo 
      const newCartItem: CartItem = {
        ...item,
        quantity: 1,
        subtotal: item.price
      };
      this.cart.push(newCartItem);
    }

    // Actualizar total
    this.updateCartTotal();

    // Mostrar notificación
    Swal.fire({
      icon: 'success',
      title: 'Agregado al carrito',
      text: `${item.name} agregado al carrito`,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000
    });
  }

  removeFromCart(item: CartItem): void {
    const existingItemIndex = this.cart.findIndex((cartItem) => cartItem.id === item.id);

    if (existingItemIndex !== -1) {
      this.cart[existingItemIndex].quantity -= 1;

      if (this.cart[existingItemIndex].quantity <= 0) {
        // Eliminar el item si la cantidad llega a cero
        this.cart.splice(existingItemIndex, 1);
      } else {
        // Actualizar subtotal
        this.cart[existingItemIndex].subtotal = this.cart[existingItemIndex].price * this.cart[existingItemIndex].quantity;
      }

      // Actualizar total
      this.updateCartTotal();
    }
  }

  updateCartItemQuantity(item: CartItem, newQuantity: number): void {
    // Verificar disponibilidad de stock
    if (item.isTracked && typeof item.stockQuantity === 'number' && newQuantity > item.stockQuantity) {
      Swal.fire({
        icon: 'error',
        title: 'Stock insuficiente',
        text: `Solo hay ${item.stockQuantity} unidades disponibles de "${item.name}"`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });

      // Ajustar al máximo disponible
      newQuantity = item.stockQuantity;
    }

    const existingItemIndex = this.cart.findIndex((cartItem) => cartItem.id === item.id);

    if (existingItemIndex !== -1) {
      if (newQuantity <= 0) {
        // Eliminar el item si la cantidad es cero o negativa
        this.cart.splice(existingItemIndex, 1);
      } else {
        // Actualizar cantidad y subtotal
        this.cart[existingItemIndex].quantity = newQuantity;
        this.cart[existingItemIndex].subtotal = this.cart[existingItemIndex].price * newQuantity;
      }

      // Actualizar total
      this.updateCartTotal();
    }
  }

  clearCart(): void {
    if (this.cart.length === 0) return;

    Swal.fire({
      title: '¿Limpiar carrito?',
      text: '¿Estás seguro de que deseas vaciar el carrito?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.cart = [];
        this.updateCartTotal();

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

  private updateCartTotal(): void {
    this.totalAmount = this.cart.reduce((total, item) => total + item.subtotal, 0);
  }

  // En store.component.ts, método processPayment()
  async processPayment(): Promise<void> {
    // Verificar si hay una caja abierta
    this.cashRegisterService.isCashRegisterOpenToday().subscribe(async isOpen => {
      if (!isOpen) {
        Swal.fire('Error', 'No se puede procesar la venta porque no hay una caja abierta.', 'error');
        return;
      }

      if (this.cart.length === 0) {
        Swal.fire('Carrito vacío', 'Agrega productos al carrito antes de continuar', 'warning');
        return;
      }

      if (this.isProcessingOrder) return;
      this.isProcessingOrder = true;

      try {
        // Crear objeto de venta
        const orderData = {
          items: this.cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            subtotal: item.subtotal,
            status: 'Listos para servir'
          })),
          total: this.totalAmount,
          date: new Date(),
          type: 'store',
          status: 'Listos para servir',
          customer: { name: 'Cliente de Tienda' },
          tables: ['Tienda']
        };

        // Guardar en la colección de órdenes
        const ordersCollection = collection(this.firestore, 'orders');
        const docRef = await addDoc(ordersCollection, orderData);

        // Redirigir a la pantalla de pago
        this.isProcessingOrder = false;
        this.router.navigate(['/cobrar', docRef.id]);

      } catch (error) {
        console.error('Error al procesar la venta:', error);
        Swal.fire('Error', 'No se pudo completar la venta', 'error');
        this.isProcessingOrder = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  getItemInCart(itemId: string): CartItem | undefined {
    return this.cart.find(item => item.id === itemId);
  }

  getItemQuantityInCart(itemId: string): number {
    const item = this.getItemInCart(itemId);
    return item ? item.quantity : 0;
  }
}