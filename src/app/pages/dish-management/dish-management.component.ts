import { Component, inject, OnInit, effect } from '@angular/core';

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
  where,
  getDocs
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { Category, Dish, DishIngredient, DishOption } from '../../models/data.model';


@Component({
  selector: 'app-dish-management',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dish-management.component.html',
  styleUrl: './dish-management.component.scss'
})
export class DishManagementComponent implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private router = inject(Router);


  // Paginación
  currentPage = 1;
  itemsPerPage = 10;
  pageSizeOptions = [5, 10, 25, 50];
  dishes: Dish[] = [];
  categories: Category[] = [];
  ingredients: any[] = []; // Ingredientes disponibles
  loading = true;
  error: string | null = null;

  // Para el formulario
  isEditing = false;
  currentDish: Dish = this.resetDishForm();

  // Nueva opción temporal
  newOption: DishOption = { name: '', price: 0 };

  // Nuevo ingrediente temporal
  newIngredient: DishIngredient = { id: '', name: '', quantity: 0, unit: 'unidad', isTracked: false };

  // Filtros
  selectedCategory = 'all';
  showInactive = false;
  searchTerm = '';

  constructor() {
    // Verificar acceso de administrador
    effect(() => {
      if (!this.authService.isAdmin()) {
        this.router.navigate(['/login']);
      }
    });
  }
  // Método para limpiar todos los filtros
  clearFilters(): void {
    this.selectedCategory = 'all';
    this.searchTerm = '';
    this.currentPage = 1;
  }
  ngOnInit(): void {
    this.loadCategories().then(() => {
      this.loadDishes();
    });
    this.loadInventoryItems();
  }

  async loadCategories(): Promise<void> {
    const categoriesCollection = collection(this.firestore, 'categories');
    const categoriesQuery = query(
      categoriesCollection,
      where('active', '==', true),
      orderBy('order', 'asc')
    );

    return new Promise((resolve) => {
      collectionData(categoriesQuery, { idField: 'id' }).subscribe({
        next: (data: any[]) => {
          this.categories = data;
          resolve();
        },
        error: (err) => {
          console.error('Error al cargar categorías:', err);
          this.error = 'Error al cargar categorías';
          resolve();
        }
      });
    });
  }
  getFilteredDishes(): Dish[] {
    // Filtrar primero
    const filtered = this.dishes.filter(dish => {
      // Filtrar por estado
      if (!this.showInactive && !dish.active) return false;

      // Filtrar por categoría
      if (this.selectedCategory !== 'all' && dish.categoryId !== this.selectedCategory) return false;

      // Filtrar por término de búsqueda
      if (this.searchTerm && !dish.name.toLowerCase().includes(this.searchTerm.toLowerCase())) return false;

      return true;
    });

    // Luego calcular los datos paginados
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return filtered.slice(startIndex, startIndex + this.itemsPerPage);
  }

  // Método para obtener el conteo total de elementos filtrados
  getTotalFilteredCount(): number {
    return this.dishes.filter(dish => {
      if (!this.showInactive && !dish.active) return false;
      if (this.selectedCategory !== 'all' && dish.categoryId !== this.selectedCategory) return false;
      if (this.searchTerm && !dish.name.toLowerCase().includes(this.searchTerm.toLowerCase())) return false;
      return true;
    }).length;
  }

  // Método para manejar el cambio de página
  onPageChange(page: number): void {
    const totalPages = Math.ceil(this.getTotalFilteredCount() / this.itemsPerPage);

    // Validar que la página esté en el rango válido
    if (page < 1) {
      this.currentPage = 1;
    } else if (page > totalPages) {
      this.currentPage = totalPages > 0 ? totalPages : 1;
    } else {
      this.currentPage = page;
    }
  }

  // Método para cambiar items por página
  onItemsPerPageChange(size: number): void {
    this.itemsPerPage = size;
    this.currentPage = 1; // Resetear a la primera página cuando cambia el tamaño
  }
  loadDishes(): void {
    this.loading = true;
    this.currentPage = 1; // Resetear paginación

    const dishesCollection = collection(this.firestore, 'menu');
    const dishesQuery = query(
      dishesCollection,
      orderBy('name', 'asc')
    );

    collectionData(dishesQuery, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.dishes = data.map(dish => {
          // Agregar nombre de categoría para mostrar en la interfaz
          const category = this.categories.find(c => c.id === dish.categoryId);
          return {
            ...dish,
            categoryName: category?.name || 'Sin categoría',
            createdAt: dish.createdAt?.toDate(),
            updatedAt: dish.updatedAt?.toDate(),
            // Asegurar que estos campos existan
            options: dish.options || [],
            ingredients: dish.ingredients || [],
            isTracked: dish.isTracked || false
          };
        });
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar productos:', err);
        this.error = 'Error al cargar productos. Intente nuevamente.';
        this.loading = false;
      }
    });
  }

  async loadInventoryItems(): Promise<void> {
    const inventoryCollection = collection(this.firestore, 'inventory');
    const inventoryQuery = query(
      inventoryCollection,
      where('active', '==', true),
      orderBy('name', 'asc')
    );

    try {
      const snapshot = await getDocs(inventoryQuery);
      this.ingredients = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      console.error('Error al cargar ingredientes:', err);
    }
  }
  // Para exponer Math en la plantilla
  Math = Math;

  // Método para obtener los números de página para la paginación
  // Método para obtener los números de página para la paginación
  getPaginationNumbers(): (number | string)[] {
    const totalPages = Math.ceil(this.getTotalFilteredCount() / this.itemsPerPage);
    if (totalPages <= 7) {
      // Si hay 7 o menos páginas, mostrar todas
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      // Si hay más de 7 páginas, mostrar un patrón con puntos suspensivos
      const pages: (number | string)[] = [];

      // Siempre mostrar la primera página
      pages.push(1);

      // Si la página actual está cerca del principio
      if (this.currentPage <= 3) {
        pages.push(2, 3, 4, '...', totalPages);
      }
      // Si la página actual está cerca del final
      else if (this.currentPage >= totalPages - 2) {
        pages.push('...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      }
      // Si la página actual está en el medio
      else {
        pages.push('...', this.currentPage - 1, this.currentPage, this.currentPage + 1, '...', totalPages);
      }

      return pages;
    }
  }
  // Para la categoría seleccionada
  onCategoryChange(): void {
    this.currentPage = 1;
  }

  // Para el término de búsqueda
  onSearchChange(): void {
    this.currentPage = 1;
  }

  // Para mostrar/ocultar inactivos
  onShowInactiveChange(): void {
    this.currentPage = 1;
  }
  addOption(): void {
    if (!this.newOption.name) {
      Swal.fire('Error', 'El nombre de la opción es obligatorio', 'error');
      return;
    }

    if (!this.currentDish.options) {
      this.currentDish.options = [];
    }

    this.currentDish.options.push({ ...this.newOption });
    this.newOption = { name: '', price: 0 };
  }

  removeOption(index: number): void {
    if (this.currentDish.options) {
      this.currentDish.options.splice(index, 1);
    }
  }

  addIngredient(): void {
    if (!this.newIngredient.id || this.newIngredient.quantity <= 0) {
      Swal.fire('Error', 'Debe seleccionar un ingrediente y una cantidad válida', 'error');
      return;
    }

    if (!this.currentDish.ingredients) {
      this.currentDish.ingredients = [];
    }

    // Buscar el ingrediente seleccionado para obtener su nombre
    const selectedIngredient = this.ingredients.find(i => i.id === this.newIngredient.id);
    if (selectedIngredient) {
      // MODIFICACIÓN: Asegúrate que isTracked sea true
      this.newIngredient.name = selectedIngredient.name;
      this.newIngredient.unit = selectedIngredient.unit || 'unidad';
      // Esta es la línea crucial - establecer isTracked en true
      this.newIngredient.isTracked = true;

      // Verificar si el ingrediente ya existe en la lista
      const existingIndex = this.currentDish.ingredients.findIndex(i => i.id === this.newIngredient.id);

      if (existingIndex >= 0) {
        // Actualizar la cantidad si ya existe
        this.currentDish.ingredients[existingIndex].quantity += this.newIngredient.quantity;
      } else {
        // Añadir nuevo ingrediente
        this.currentDish.ingredients.push({ ...this.newIngredient });
      }

      // Resetear el formulario de ingrediente
      this.newIngredient = { id: '', name: '', quantity: 0, unit: 'unidad', isTracked: false };
    }
  }

  removeIngredient(index: number): void {
    if (this.currentDish.ingredients) {
      this.currentDish.ingredients.splice(index, 1);
    }
  }

  createDish(): void {
    if (!this.validateForm()) return;

    // Asegúrate de que options es un array simple, no una colección de referencias
    const options = this.currentDish.options ?
      this.currentDish.options.map(opt => ({
        name: opt.name,
        price: opt.price || 0
      })) : [];

    const newDish: Dish = {
      ...this.currentDish,
      options: options, // Usar el array de opciones procesado
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('Saving dish with options:', newDish.options); // Para depuración

    // Si el plato no se rastrea como unidad, eliminar stockQuantity
    if (!newDish.isTracked) {
      delete newDish.stockQuantity;
    }

    const dishesCollection = collection(this.firestore, 'menu');

    addDoc(dishesCollection, newDish)
      .then((docRef) => {
        console.log('Dish saved with ID:', docRef.id);
        Swal.fire('¡Éxito!', 'Plato creado correctamente', 'success');
        this.resetForm();
      })
      .catch(err => {
        console.error('Error al crear plato:', err);
        Swal.fire('Error', 'No se pudo crear el plato', 'error');
      });
  }

  editDish(dish: Dish): void {
    this.isEditing = true;
    this.currentDish = { ...dish };

    // Asegurar que estos campos existan
    if (!this.currentDish.options) this.currentDish.options = [];
    if (!this.currentDish.ingredients) this.currentDish.ingredients = [];

    // Desplazar al formulario
    setTimeout(() => {
      document.getElementById('dishForm')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  updateDish(): void {
    if (!this.validateForm() || !this.currentDish.id) return;

    // Asegúrate de que options es un array simple
    const options = this.currentDish.options ?
      this.currentDish.options.map(opt => ({
        name: opt.name,
        price: opt.price || 0
      })) : [];

    const dishRef = doc(this.firestore, `menu/${this.currentDish.id}`);
    const updatedDish = {
      ...this.currentDish,
      options: options, // Usar el array de opciones procesado
      updatedAt: new Date()
    };

    console.log('Updating dish with options:', updatedDish.options); // Para depuración

    // Si el plato no se rastrea como unidad, eliminar stockQuantity
    if (!updatedDish.isTracked) {
      delete updatedDish.stockQuantity;
    }

    updateDoc(dishRef, updatedDish)
      .then(() => {
        Swal.fire('¡Éxito!', 'Plato actualizado correctamente', 'success');
        this.resetForm();
      })
      .catch(err => {
        console.error('Error al actualizar plato:', err);
        Swal.fire('Error', 'No se pudo actualizar el plato', 'error');
      });
  }

  deleteDish(dish: Dish): void {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Quieres eliminar el plato "${dish.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed && dish.id) {
        const dishRef = doc(this.firestore, `menu/${dish.id}`);

        deleteDoc(dishRef)
          .then(() => {
            Swal.fire('¡Eliminado!', 'El plato ha sido eliminado', 'success');
          })
          .catch(err => {
            console.error('Error al eliminar plato:', err);
            Swal.fire('Error', 'No se pudo eliminar el plato', 'error');
          });
      }
    });
  }

  toggleDishStatus(dish: Dish): void {
    if (!dish.id) return;

    const dishRef = doc(this.firestore, `menu/${dish.id}`);
    const newStatus = !dish.active;

    updateDoc(dishRef, {
      active: newStatus,
      updatedAt: new Date()
    })
      .then(() => {
        const action = newStatus ? 'activado' : 'desactivado';
        Swal.fire('¡Actualizado!', `El plato ha sido ${action}`, 'success');
      })
      .catch(err => {
        console.error('Error al cambiar estado del plato:', err);
        Swal.fire('Error', 'No se pudo cambiar el estado del plato', 'error');
      });
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentDish = this.resetDishForm();
    this.newOption = { name: '', price: 0 };
    this.newIngredient = { id: '', name: '', quantity: 0, unit: 'unidad', isTracked: false };
  }

  validateForm(): boolean {
    if (!this.currentDish.name || this.currentDish.name.trim() === '') {
      Swal.fire('Error', 'El nombre del plato es obligatorio', 'error');
      return false;
    }

    if (!this.currentDish.price || this.currentDish.price <= 0) {
      Swal.fire('Error', 'El precio debe ser mayor que 0', 'error');
      return false;
    }

    if (!this.currentDish.categoryId) {
      Swal.fire('Error', 'Debe seleccionar una categoría', 'error');
      return false;
    }

    if (this.currentDish.isTracked && (!this.currentDish.stockQuantity || this.currentDish.stockQuantity < 0)) {
      Swal.fire('Error', 'Para productos rastreados, debe especificar la cantidad en stock', 'error');
      return false;
    }

    return true;
  }

  private resetDishForm(): Dish {
    return {
      name: '',
      description: '',
      price: 0,
      categoryId: '',
      options: [],
      ingredients: [],
      isTracked: false,
      active: true,
      featured: false
    };
  }

  getIngredientName(id: string): string {
    const ingredient = this.ingredients.find(i => i.id === id);
    return ingredient ? ingredient.name : 'Desconocido';
  }
}