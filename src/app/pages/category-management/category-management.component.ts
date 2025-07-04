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
  orderBy
} from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { Category } from '../../models/data.model';

@Component({
    selector: 'app-category-management',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './category-management.component.html',
    styleUrl: './category-management.component.scss'
})
export class CategoryManagementComponent implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private router = inject(Router);

  categories: Category[] = [];
  loading = true;
  error: string | null = null;

  // Para el formulario
  isEditing = false;
  currentCategory: Category = this.resetCategoryForm();

  // Ordenar y filtrar
  showInactive = false;

  constructor() {
    // Verificar acceso de administrador
    effect(() => {
      if (!this.authService.isAdmin()) {
        this.router.navigate(['/login']);
      }
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.loading = true;
    const categoriesCollection = collection(this.firestore, 'categories');

    // Ordenar por el campo "order" y luego por nombre
    const categoriesQuery = query(
      categoriesCollection,
      orderBy('order', 'asc'),
      orderBy('name', 'asc')
    );

    collectionData(categoriesQuery, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.categories = data.map(cat => ({
          ...cat,
          createdAt: cat.createdAt?.toDate(),
          updatedAt: cat.updatedAt?.toDate()
        }));
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar categorías:', err);
        this.error = 'Error al cargar categorías. Intente nuevamente.';
        this.loading = false;
      }
    });
  }

  getFilteredCategories(): Category[] {
    return this.categories.filter(cat => this.showInactive || cat.active);
  }

  createCategory(): void {
    if (!this.validateForm()) return;

    const newCategory: Category = {
      ...this.currentCategory,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: this.getNextOrder()
    };

    const categoriesCollection = collection(this.firestore, 'categories');

    addDoc(categoriesCollection, newCategory)
      .then(() => {
        Swal.fire('¡Éxito!', 'Categoría creada correctamente', 'success');
        this.resetForm();
      })
      .catch(err => {
        console.error('Error al crear categoría:', err);
        Swal.fire('Error', 'No se pudo crear la categoría', 'error');
      });
  }

  editCategory(category: Category): void {
    this.isEditing = true;
    this.currentCategory = { ...category };

    // Desplazar al formulario
    setTimeout(() => {
      document.getElementById('categoryForm')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  updateCategory(): void {
    if (!this.validateForm() || !this.currentCategory.id) return;

    const categoryRef = doc(this.firestore, `categories/${this.currentCategory.id}`);
    const updatedCategory = {
      ...this.currentCategory,
      updatedAt: new Date()
    };

    updateDoc(categoryRef, updatedCategory)
      .then(() => {
        Swal.fire('¡Éxito!', 'Categoría actualizada correctamente', 'success');
        this.resetForm();
      })
      .catch(err => {
        console.error('Error al actualizar categoría:', err);
        Swal.fire('Error', 'No se pudo actualizar la categoría', 'error');
      });
  }

  deleteCategory(category: Category): void {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Quieres eliminar la categoría "${category.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed && category.id) {
        const categoryRef = doc(this.firestore, `categories/${category.id}`);

        deleteDoc(categoryRef)
          .then(() => {
            Swal.fire('¡Eliminada!', 'La categoría ha sido eliminada', 'success');
          })
          .catch(err => {
            console.error('Error al eliminar categoría:', err);
            Swal.fire('Error', 'No se pudo eliminar la categoría', 'error');
          });
      }
    });
  }

  toggleCategoryStatus(category: Category): void {
    if (!category.id) return;

    const categoryRef = doc(this.firestore, `categories/${category.id}`);
    const newStatus = !category.active;

    updateDoc(categoryRef, {
      active: newStatus,
      updatedAt: new Date()
    })
      .then(() => {
        const action = newStatus ? 'activada' : 'desactivada';
        Swal.fire('¡Actualizada!', `La categoría ha sido ${action}`, 'success');
      })
      .catch(err => {
        console.error('Error al cambiar estado de categoría:', err);
        Swal.fire('Error', 'No se pudo cambiar el estado de la categoría', 'error');
      });
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentCategory = this.resetCategoryForm();
  }

  validateForm(): boolean {
    if (!this.currentCategory.name || this.currentCategory.name.trim() === '') {
      Swal.fire('Error', 'El nombre de la categoría es obligatorio', 'error');
      return false;
    }
    return true;
  }

  private resetCategoryForm(): Category {
    return {
      id: '',
      name: '',
      description: '',
      active: true,
      items: []
    };
  }

  private getNextOrder(): number {
    if (this.categories.length === 0) return 1;

    // Encontrar el orden máximo actual y añadir 1
    const maxOrder = Math.max(...this.categories.map(cat => cat.order || 0));
    return maxOrder + 1;
  }
}