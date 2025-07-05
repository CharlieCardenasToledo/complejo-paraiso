# Guía de Buenas Prácticas para Angular 20 - 2025

## TL;DR - Lo Esencial
Angular 20, lanzado el 29 de mayo de 2025, introduce cambios significativos como Signals estables, detección de cambios sin Zone.js, y componentes standalone por defecto. Las mejores prácticas se centran en aprovechar estas nuevas características para crear aplicaciones más eficientes y mantenibles.

---

## 11. Integración de Firebase con AngularFire

### Instalación de AngularFire 20.0.1
AngularFire 20.0.1 es la versión más reciente y está completamente compatible con Angular 20.

#### 1. Instalación via Angular CLI (Recomendado)
```bash
# Instalar AngularFire usando Angular CLI
ng add @angular/fire

# O instalación manual
npm install @angular/fire firebase
```

#### 2. Configuración en app.config.ts
```typescript
import { ApplicationConfig } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    
    // Firebase providers
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    
    // otros providers
  ]
};
```

#### 3. Variables de Entorno
Crea archivos de entorno seguros:

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  firebase: {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  }
};

// environments/environment.prod.ts
export const environment = {
  production: true,
  firebase: {
    // configuración de producción
  }
};
```

### Servicios Firebase con Signals

#### Servicio de Autenticación
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  
  // Signal del usuario actual
  user$ = toSignal(user(this.auth), { initialValue: null });
  
  // Estados locales
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  
  async signIn(email: string, password: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error: any) {
      this.error.set(error.message);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }
  
  async signUp(email: string, password: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      await createUserWithEmailAndPassword(this.auth, email, password);
    } catch (error: any) {
      this.error.set(error.message);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }
  
  async logout(): Promise<void> {
    await signOut(this.auth);
  }
}
```

#### Servicio de Firestore
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { 
  Firestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy,
  where 
} from '@angular/fire/firestore';

export interface Task {
  id?: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: Date;
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);
  private tasksCollection = collection(this.firestore, 'tasks');
  
  // State management con signals
  tasks = signal<Task[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  
  async loadTasks(userId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const q = query(
        this.tasksCollection, 
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const tasks: Task[] = [];
      
      querySnapshot.forEach((doc) => {
        tasks.push({
          id: doc.id,
          ...doc.data()
        } as Task);
      });
      
      this.tasks.set(tasks);
    } catch (error: any) {
      this.error.set('Error loading tasks');
      console.error('Error loading tasks:', error);
    } finally {
      this.loading.set(false);
    }
  }
  
  async addTask(task: Omit<Task, 'id'>): Promise<void> {
    try {
      const docRef = await addDoc(this.tasksCollection, {
        ...task,
        createdAt: new Date()
      });
      
      // Actualizar el signal local
      this.tasks.update(tasks => [{
        id: docRef.id,
        ...task
      }, ...tasks]);
      
    } catch (error: any) {
      this.error.set('Error adding task');
      throw error;
    }
  }
  
  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    try {
      const taskDoc = doc(this.firestore, 'tasks', taskId);
      await updateDoc(taskDoc, updates);
      
      // Actualizar el signal local
      this.tasks.update(tasks => 
        tasks.map(task => 
          task.id === taskId ? { ...task, ...updates } : task
        )
      );
    } catch (error: any) {
      this.error.set('Error updating task');
      throw error;
    }
  }
  
  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskDoc = doc(this.firestore, 'tasks', taskId);
      await deleteDoc(taskDoc);
      
      // Actualizar el signal local
      this.tasks.update(tasks => 
        tasks.filter(task => task.id !== taskId)
      );
    } catch (error: any) {
      this.error.set('Error deleting task');
      throw error;
    }
  }
}
```

#### Componente con Firebase
```typescript
import { Component, inject, computed, effect } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { TaskService } from '../../core/services/task.service';

@Component({
  selector: 'app-task-list',
  template: `
    <div class="max-w-4xl mx-auto p-6">
      @if (authService.user$()) {
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900">
            Welcome, {{ authService.user$()?.email }}
          </h1>
          <button 
            (click)="logout()"
            class="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>
        
        <div class="mb-6">
          <h2 class="text-xl font-semibold mb-4">Tasks ({{ completedCount() }}/{{ totalCount() }})</h2>
          
          @if (taskService.loading()) {
            <div class="text-center py-4">Loading tasks...</div>
          } @else if (taskService.error()) {
            <div class="text-red-600 py-4">{{ taskService.error() }}</div>
          } @else {
            @for (task of taskService.tasks(); track task.id) {
              <div class="bg-white border rounded-lg p-4 mb-3 shadow-sm">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-3">
                    <input 
                      type="checkbox" 
                      [checked]="task.completed"
                      (change)="toggleTask(task)"
                      class="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <h3 class="font-medium" [class.line-through]="task.completed">
                        {{ task.title }}
                      </h3>
                      <p class="text-gray-600 text-sm">{{ task.description }}</p>
                    </div>
                  </div>
                  <button 
                    (click)="deleteTask(task.id!)"
                    class="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            }
          }
        </div>
      } @else {
        <div class="text-center py-8">
          <p class="mb-4">Please sign in to view your tasks</p>
          <button 
            (click)="signIn()"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Sign In
          </button>
        </div>
      }
    </div>
  `,
  standalone: true
})
export class TaskListComponent {
  authService = inject(AuthService);
  taskService = inject(TaskService);
  
  // Computed signals para estadísticas
  totalCount = computed(() => this.taskService.tasks().length);
  completedCount = computed(() => 
    this.taskService.tasks().filter(task => task.completed).length
  );
  
  constructor() {
    // Effect para cargar tareas cuando el usuario cambie
    effect(() => {
      const user = this.authService.user$();
      if (user) {
        this.taskService.loadTasks(user.uid);
      }
    });
  }
  
  async toggleTask(task: any): Promise<void> {
    await this.taskService.updateTask(task.id, {
      completed: !task.completed
    });
  }
  
  async deleteTask(taskId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this task?')) {
      await this.taskService.deleteTask(taskId);
    }
  }
  
  async signIn(): Promise<void> {
    try {
      await this.authService.signIn('demo@example.com', 'password123');
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  }
  
  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
```

---

## 12. Integración de TailwindCSS 4.0

### Instalación de TailwindCSS 4.0
TailwindCSS v4.0 es una reescritura completa del framework, optimizada para ser lo más rápida posible, con construcciones completas hasta 3.5x más rápidas e incrementales hasta 8x más rápidas.

#### 1. Instalación
```bash
# Instalar TailwindCSS y dependencias
npm install tailwindcss @tailwindcss/postcss postcss --save
```

#### 2. Configuración de PostCSS
Crea un archivo `.postcssrc.json` en la raíz de tu proyecto:

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

#### 3. Configuración con SCSS (Recomendado)
Si prefieres usar SCSS en lugar de CSS puro:

```scss
// src/styles.scss
@use "tailwindcss";

// Aquí puedes agregar tus estilos personalizados
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors;
  }
  
  .card {
    @apply bg-white shadow-lg rounded-lg p-6 border border-gray-200;
  }
}

@layer utilities {
  .text-shadow {
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
  }
}
```

#### 4. Configuración con CSS
Si prefieres usar CSS estándar:

```css
/* src/styles.css */
@import "tailwindcss";
```

### Configuración Avanzada

#### Variables CSS Personalizadas
TailwindCSS 4.0 expone todos tus tokens de diseño como variables CSS nativas:

```scss
// src/styles.scss
@use "tailwindcss";

:root {
  /* Colores personalizados */
  --color-primary: #3b82f6;
  --color-primary-dark: #1d4ed8;
  --color-secondary: #10b981;
  
  /* Espaciado personalizado */
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  
  /* Tipografía */
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-body: 'System UI', sans-serif;
}

@layer base {
  body {
    font-family: var(--font-body);
    @apply text-gray-900 bg-gray-50;
  }
  
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
    @apply font-semibold;
  }
}
```

#### Utilidades Dinámicas
TailwindCSS 4.0 permite valores dinámicos y variantes:

```html
<!-- Valores dinámicos -->
<div class="w-[350px] bg-[#ff6b6b] text-[14px]">
  Tamaños personalizados
</div>

<!-- Data attributes automáticos -->
<button data-active="true" class="data-[active=true]:bg-blue-500">
  Botón activo
</button>

<!-- Pseudo clases avanzadas -->
<input class="focus-within:ring-2 invalid:border-red-500">
```

### Componentes Tailwind Optimizados

#### Componente Button Reutilizable
```typescript
import { Component, input, output } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  template: `
    <button 
      [class]="buttonClasses()"
      [disabled]="disabled()"
      (click)="handleClick()"
    >
      @if (loading()) {
        <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      }
      <ng-content></ng-content>
    </button>
  `,
  standalone: true
})
export class ButtonComponent {
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  fullWidth = input<boolean>(false);
  
  clicked = output<void>();
  
  buttonClasses = computed(() => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variantClasses = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      outline: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500'
    };
    
    const sizeClasses = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base'
    };
    
    const widthClass = this.fullWidth() ? 'w-full' : '';
    
    return [
      baseClasses,
      variantClasses[this.variant()],
      sizeClasses[this.size()],
      widthClass
    ].filter(Boolean).join(' ');
  });
  
  handleClick(): void {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit();
    }
  }
}
```

#### Layout Component
```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-layout',
  template: `
    <div class="min-h-screen bg-gray-50">
      <!-- Header -->
      <header class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <div class="flex items-center">
              <h1 class="text-xl font-semibold text-gray-900">
                Angular 20 App
              </h1>
            </div>
            <nav class="hidden md:flex space-x-8">
              <a href="#" class="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                Dashboard
              </a>
              <a href="#" class="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                Users
              </a>
              <a href="#" class="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                Settings
              </a>
            </nav>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <ng-content></ng-content>
      </main>

      <!-- Footer -->
      <footer class="bg-white border-t border-gray-200 mt-auto">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p class="text-center text-sm text-gray-500">
            © 2025 Angular 20 App. Built with ❤️ and TailwindCSS 4.0
          </p>
        </div>
      </footer>
    </div>
  `,
  standalone: true
})
export class LayoutComponent {}
```

### Responsive Design con TailwindCSS

#### Breakpoints y Mobile-First
```html
<div class="
  /* Mobile (default) */
  p-4 text-sm
  
  /* Tablet (md: 768px) */
  md:p-6 md:text-base
  
  /* Desktop (lg: 1024px) */
  lg:p-8 lg:text-lg
  
  /* Large Desktop (xl: 1280px) */
  xl:p-12 xl:text-xl
">
  Contenido responsivo
</div>
```

#### Grid Responsivo
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  @for (item of items(); track item.id) {
    <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <h3 class="text-lg font-semibold mb-2">{{ item.title }}</h3>
      <p class="text-gray-600">{{ item.description }}</p>
    </div>
  }
</div>
```

### Dark Mode
```scss
// src/styles.scss
@use "tailwindcss";

@layer base {
  html {
    @apply h-full;
  }
  
  body {
    @apply h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white;
  }
}
```

```typescript
// Dark mode toggle service
import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDark = signal<boolean>(false);
  
  readonly isDarkMode = this.isDark.asReadonly();
  
  constructor() {
    // Detectar preferencia del sistema
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // O cargar desde localStorage
    const savedTheme = localStorage.getItem('theme');
    
    this.isDark.set(savedTheme === 'dark' || (!savedTheme && prefersDark));
    this.updateDOM();
  }
  
  toggleTheme(): void {
    this.isDark.update(current => !current);
    this.updateDOM();
    localStorage.setItem('theme', this.isDark() ? 'dark' : 'light');
  }
  
  private updateDOM(): void {
    if (this.isDark()) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}
```

---

## 1. Arquitectura de Proyecto

### Estructura de Carpetas Recomendada
Organiza tu aplicación por características y dominios de negocio. Migrar hacia componentes standalone ayuda a reducir la complejidad de los módulos excesivos.

```
src/
├── app/
│   ├── core/                          # Servicios centrales y configuración
│   │   ├── guards/                    # Route guards
│   │   ├── interceptors/              # HTTP interceptors
│   │   ├── services/                  # Servicios singleton
│   │   │   ├── auth.service.ts
│   │   │   ├── api.service.ts
│   │   │   └── error-handler.service.ts
│   │   ├── config/                    # Configuraciones de la app
│   │   └── models/                    # Interfaces y tipos globales
│   │
│   ├── features/                      # Módulos de características
│   │   ├── auth/                      # Característica de autenticación
│   │   │   ├── components/
│   │   │   │   ├── login/
│   │   │   │   │   ├── login.component.ts
│   │   │   │   │   ├── login.component.html
│   │   │   │   │   └── login.component.scss
│   │   │   │   └── register/
│   │   │   ├── services/
│   │   │   │   └── auth-feature.service.ts
│   │   │   ├── guards/
│   │   │   ├── models/
│   │   │   │   └── user.interface.ts
│   │   │   └── auth.routes.ts          # Rutas específicas de auth
│   │   │
│   │   ├── dashboard/                  # Característica de dashboard
│   │   │   ├── components/
│   │   │   │   ├── dashboard-home/
│   │   │   │   ├── stats-widget/
│   │   │   │   └── chart-widget/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── dashboard.routes.ts
│   │   │
│   │   ├── users/                      # Gestión de usuarios
│   │   │   ├── components/
│   │   │   │   ├── user-list/
│   │   │   │   ├── user-detail/
│   │   │   │   └── user-form/
│   │   │   ├── services/
│   │   │   │   └── user.service.ts
│   │   │   ├── models/
│   │   │   └── users.routes.ts
│   │   │
│   │   └── products/                   # Ejemplo de otra característica
│   │       ├── components/
│   │       ├── services/
│   │       ├── models/
│   │       └── products.routes.ts
│   │
│   ├── shared/                         # Componentes y utilidades compartidas
│   │   ├── components/                 # Componentes reutilizables
│   │   │   ├── ui/                     # Componentes de UI básicos
│   │   │   │   ├── button/
│   │   │   │   │   ├── button.component.ts
│   │   │   │   │   ├── button.component.html
│   │   │   │   │   └── button.component.scss
│   │   │   │   ├── modal/
│   │   │   │   ├── loading-spinner/
│   │   │   │   └── form-field/
│   │   │   ├── layout/                 # Componentes de layout
│   │   │   │   ├── header/
│   │   │   │   ├── sidebar/
│   │   │   │   └── footer/
│   │   │   └── business/               # Componentes de negocio compartidos
│   │   │       ├── user-avatar/
│   │   │       └── notification-card/
│   │   │
│   │   ├── directives/                 # Directivas personalizadas
│   │   │   ├── highlight.directive.ts
│   │   │   └── auto-focus.directive.ts
│   │   │
│   │   ├── pipes/                      # Pipes personalizados
│   │   │   ├── currency-format.pipe.ts
│   │   │   └── date-ago.pipe.ts
│   │   │
│   │   ├── validators/                 # Validadores personalizados
│   │   │   └── custom-validators.ts
│   │   │
│   │   ├── utils/                      # Utilidades y helpers
│   │   │   ├── date.utils.ts
│   │   │   ├── string.utils.ts
│   │   │   └── form.utils.ts
│   │   │
│   │   ├── constants/                  # Constantes de la aplicación
│   │   │   ├── api-endpoints.ts
│   │   │   └── app-constants.ts
│   │   │
│   │   └── types/                      # Tipos TypeScript compartidos
│   │       ├── api.types.ts
│   │       └── common.types.ts
│   │
│   ├── layouts/                        # Layouts principales de la app
│   │   ├── main-layout/
│   │   ├── auth-layout/
│   │   └── admin-layout/
│   │
│   ├── app.component.ts                # Componente raíz
│   ├── app.component.html
│   ├── app.component.scss
│   ├── app.config.ts                   # Configuración principal de la app
│   └── app.routes.ts                   # Rutas principales
│
├── assets/                             # Recursos estáticos
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   └── i18n/                          # Archivos de internacionalización
│       ├── en.json
│       └── es.json
│
├── environments/                       # Configuraciones de entorno
│   ├── environment.ts
│   └── environment.prod.ts
│
├── styles/                            # Estilos globales
│   ├── _variables.scss
│   ├── _mixins.scss
│   ├── _reset.scss
│   └── styles.scss
│
└── main.ts                           # Punto de entrada de la aplicación
```

### Principios de Organización

#### 1. **Por Características (Feature-based)**
Cada característica principal tiene su propia carpeta con todos sus recursos relacionados.

#### 2. **Separación de Responsabilidades**
- **Core**: Servicios singleton, guards, interceptors
- **Features**: Lógica específica de cada característica  
- **Shared**: Código reutilizable en toda la aplicación
- **Layouts**: Plantillas de página principales

#### 3. **Convenciones de Nomenclatura**
```typescript
// Archivos de componentes
user-list.component.ts
user-list.component.html
user-list.component.scss
user-list.component.spec.ts

// Servicios
user.service.ts
auth.service.ts

// Modelos/Interfaces
user.interface.ts
api-response.model.ts

// Guards
auth.guard.ts

// Pipes
currency-format.pipe.ts
```

### Ejemplo de Implementación con Estructura

#### Configuración Principal (app.config.ts)
```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // otros providers
  ]
};
```

#### Rutas Principales (app.routes.ts)
```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.authRoutes)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.dashboardRoutes),
    canActivate: [authGuard]
  },
  {
    path: 'users',
    loadChildren: () => import('./features/users/users.routes').then(m => m.userRoutes),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
```

#### Rutas de Característica (features/users/users.routes.ts)
```typescript
import { Routes } from '@angular/router';

export const userRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/user-list/user-list.component')
      .then(m => m.UserListComponent)
  },
  {
    path: 'create',
    loadComponent: () => import('./components/user-form/user-form.component')
      .then(m => m.UserFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./components/user-detail/user-detail.component')
      .then(m => m.UserDetailComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/user-form/user-form.component')
      .then(m => m.UserFormComponent)
  }
];
```

#### Servicio de Característica (features/users/services/user.service.ts)
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private http = inject(HttpClient);
  private readonly apiUrl = '/api/users';
  
  // State management con signals
  private users = signal<User[]>([]);
  private loading = signal<boolean>(false);
  private error = signal<string | null>(null);
  
  // Read-only accessors
  readonly users$ = this.users.asReadonly();
  readonly loading$ = this.loading.asReadonly();
  readonly error$ = this.error.asReadonly();
  
  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const users = await this.http.get<User[]>(this.apiUrl).toPromise();
      this.users.set(users || []);
    } catch (error) {
      this.error.set('Error loading users');
      console.error('Error loading users:', error);
    } finally {
      this.loading.set(false);
    }
  }
  
  async createUser(user: Omit<User, 'id'>): Promise<void> {
    try {
      const newUser = await this.http.post<User>(this.apiUrl, user).toPromise();
      if (newUser) {
        this.users.update(users => [...users, newUser]);
      }
    } catch (error) {
      this.error.set('Error creating user');
      throw error;
    }
  }
}
```

### Componentes Standalone
Los componentes standalone eliminan la necesidad de NgModules tradicionales en muchos escenarios, simplificando los proyectos de Angular.

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-hello-world',
  template: `<h1>Hello, Angular 2025!</h1>`,
  standalone: true,
})
export class HelloWorldComponent {}
```

**Ventajas:**
- Menos código repetitivo: No necesidad de declarar componentes en un módulo
- Mejor Tree Shaking: Solo se incluyen los componentes que utilizas
- Estructura de aplicación más simple: Más fácil para nuevos desarrolladores

---

## 2. Gestión de Estado con Signals

### Fundamentos de Signals
Los Signals son un sistema que rastrea granularmente cómo y dónde se usa tu estado en toda la aplicación, permitiendo al framework optimizar las actualizaciones de renderizado.

```typescript
import { Component, signal, computed, effect } from '@angular/core';

@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Count: {{ count() }}</p>
      <p>Double: {{ double() }}</p>
      <button (click)="increment()">+</button>
    </div>
  `,
  standalone: true
})
export class CounterComponent {
  // Signal básico
  count = signal(0);
  
  // Signal computado
  double = computed(() => this.count() * 2);
  
  constructor() {
    // Effect para reaccionar a cambios
    effect(() => {
      console.log(`Count changed to: ${this.count()}`);
    });
  }
  
  increment() {
    this.count.set(this.count() + 1);
  }
}
```

### Mejores Prácticas para Signals

#### 1. Usa computed() para estado derivado
computed() es lo mejor de Angular Signals, increíblemente útil y seguro de usar.

```typescript
// ✅ Correcto
readonly totalPrice = computed(() => 
  this.items().reduce((sum, item) => sum + item.price, 0)
);

// ❌ Evitar lógica compleja en templates
// En lugar de: {{ items().reduce(...) }}
```

#### 2. Reglas para computed()
No modifiques cosas en computed(). Debe computar un nuevo resultado, eso es todo.

```typescript
// ✅ Correcto
readonly filteredItems = computed(() => 
  this.items().filter(item => item.active)
);

// ❌ Incorrecto - No modifiques estado
readonly badComputed = computed(() => {
  this.someService.updateData(); // ❌ No hagas esto
  return this.data();
});
```

#### 3. Usa effect() con moderación
Raramente necesitas effect() y Angular te desaconseja usarlo. Úsalo lo menos posible.

```typescript
// ✅ Solo para efectos secundarios necesarios
effect(() => {
  // Logging, analytics, localStorage, etc.
  localStorage.setItem('userPrefs', JSON.stringify(this.preferences()));
});
```

---

## 3. Componentes Signal-Based

### Inputs y Outputs Modernos
Los componentes signal representan una forma completamente nueva de crear componentes, directivas y pipes.

```typescript
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-user-card',
  template: `
    <div class="user-card">
      <h3>{{ user()?.name }}</h3>
      <button (click)="handleEdit()">Edit</button>
    </div>
  `,
  standalone: true
})
export class UserCardComponent {
  // Signal input
  user = input<User>();
  
  // Signal input requerido
  userId = input.required<string>();
  
  // Signal output
  editClicked = output<User>();
  
  handleEdit() {
    const currentUser = this.user();
    if (currentUser) {
      this.editClicked.emit(currentUser);
    }
  }
}
```

### Two-Way Binding con model()
model() es un mecanismo de comunicación bidireccional implementado por un signal escribible compartido entre componentes padre e hijo.

```typescript
@Component({
  selector: 'app-input-field',
  template: `
    <input 
      [value]="value()" 
      (input)="onInput($event)"
      [placeholder]="placeholder()"
    />
  `,
  standalone: true
})
export class InputFieldComponent {
  value = model<string>('');
  placeholder = input<string>('Enter text...');
  
  onInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.value.set(target.value);
  }
}
```

---

## 4. Optimización de Rendimiento

### Detección de Cambios
Usa la estrategia OnPush donde sea posible. Esto mejora el rendimiento limitando el número de verificaciones que Angular realiza.

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-optimized',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<!-- template -->`,
  standalone: true
})
export class OptimizedComponent {}
```

### Detección de Cambios sin Zone.js
Ahora puedes inicializar tu aplicación sin Zone.js, lo que simplifica enormemente la depuración y la estabilidad de SSR.

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    // otros providers
  ]
});
```

### TrackBy en ngFor
Cuando trabajes con listas grandes en ngFor, siempre usa trackBy para evitar re-renderizados innecesarios.

```typescript
@Component({
  template: `
    <div *ngFor="let item of items; trackBy: trackByFn">
      {{ item.name }}
    </div>
  `,
  standalone: true
})
export class ListComponent {
  items = signal<Item[]>([]);
  
  trackByFn(index: number, item: Item): number {
    return item.id;
  }
}
```

---

## 5. TypeScript y Tipado Fuerte

### Configuración Estricta
Habilita el modo estricto de TypeScript ("strict": true en tu tsconfig.json).

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

### Tipos para Signals
```typescript
// ✅ Tipado explícito
const users = signal<User[]>([]);
const loading = signal<boolean>(false);
const selectedUser = signal<User | null>(null);

// ✅ Interfaces para datos complejos
interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

const apiData = signal<ApiResponse<User[]> | null>(null);
```

---

## 6. Gestión de Formularios

### Reactive Forms con Tipado
Los Reactive Forms siguen siendo la mejor opción para manejar formularios. Los Typed Forms, introducidos en Angular 16, añaden una capa de seguridad de tipos.

```typescript
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

interface UserForm {
  name: string;
  email: string;
  age: number;
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule]
})
export class UserFormComponent {
  private fb = inject(FormBuilder);
  
  userForm: FormGroup<{
    name: FormControl<string>;
    email: FormControl<string>;
    age: FormControl<number>;
  }> = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    age: [0, [Validators.required, Validators.min(18)]]
  });
}
```

---

## 7. Arquitectura de Servicios

### Separación de Responsabilidades
Es importante seguir las pautas de mejores prácticas de Angular y mantener la lógica separada de tus componentes.

```typescript
// ✅ Service para lógica de negocio
@Injectable({
  providedIn: 'root'
})
export class UserService {
  private users = signal<User[]>([]);
  
  readonly users$ = this.users.asReadonly();
  
  async loadUsers(): Promise<void> {
    const users = await this.http.get<User[]>('/api/users').toPromise();
    this.users.set(users);
  }
  
  addUser(user: User): void {
    this.users.update(users => [...users, user]);
  }
}

// ✅ Component solo para UI
@Component({
  template: `
    <div *ngFor="let user of userService.users$()">
      {{ user.name }}
    </div>
  `,
  standalone: true
})
export class UserListComponent {
  userService = inject(UserService);
  
  ngOnInit() {
    this.userService.loadUsers();
  }
}
```

---

## 8. Testing y Calidad de Código

### Configuración de Testing
Con la depreciación de Karma, Angular está explorando activamente e integrando nuevos test runners por defecto como Web Test Runner, Jest y Vitest.

```typescript
// Configuración para Vitest
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts']
  }
});
```

### Testing de Signals
```typescript
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

describe('CounterComponent', () => {
  it('should increment count', () => {
    const component = TestBed.createComponent(CounterComponent).componentInstance;
    
    expect(component.count()).toBe(0);
    
    component.increment();
    
    expect(component.count()).toBe(1);
    expect(component.double()).toBe(2);
  });
});
```

### Linting y Formateo
Para linting, ESLint via angular-eslint sigue siendo el estándar.

```json
{
  "extends": [
    "@angular-eslint/recommended",
    "@angular-eslint/template/process-inline-templates"
  ],
  "plugins": ["unused-imports"],
  "rules": {
    "unused-imports/no-unused-imports": "error"
  }
}
```

---

## 9. Nuevas Características de Angular 20

### Control Flow Syntax
*ngIf, *ngFor, y *ngSwitch están ahora deprecated. La nueva sintaxis de control flow @if, @for, @switch es preferida.

```typescript
@Component({
  template: `
    <!-- ✅ Nueva sintaxis -->
    @if (user()) {
      <div>{{ user()?.name }}</div>
    }
    
    @for (item of items(); track item.id) {
      <div>{{ item.name }}</div>
    }
    
    @switch (status()) {
      @case ('loading') {
        <div>Loading...</div>
      }
      @case ('error') {
        <div>Error occurred</div>
      }
      @default {
        <div>Content</div>
      }
    }
  `,
  standalone: true
})
export class ModernComponent {}
```

### Componentes Dinámicos Simplificados
Crear componentes dinámicos solía ser verboso. Ahora es completamente declarativo.

```typescript
createComponent(MyDialog, {
  bindings: [
    inputBinding('canClose', signal(true)),
    outputBinding('onClose', (result) => console.log(result)),
    twoWayBinding('title', signal('Dialog Title'))
  ]
});
```

---

## 10. Migración y Mejores Prácticas de Código

### Estándares de Código
Asegúrate de que el código no exceda el límite de 400 líneas por archivo y no exceda 75 líneas por cada función.

### Gestión de Memoria
Una fuga de memoria es la pérdida gradual del espacio disponible del equipo cuando una aplicación gestiona incorrectamente las asignaciones de memoria.

```typescript
@Component({
  standalone: true
})
export class CleanComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  
  ngOnInit() {
    this.dataService.getData()
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        // manejar datos
      });
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

---

## Conclusión

Angular 20 representa un gran salto adelante en el desarrollo web moderno. Con un modelo de reactividad refinado, mejor rendimiento bajo el capó y herramientas más inteligentes, esta versión está construida para agilizar tanto el desarrollo como el escalado.

Las mejores prácticas para 2025 se centran en:
- Adoptar componentes standalone y signals
- Implementar detección de cambios sin Zone.js
- Usar la nueva sintaxis de control flow
- Mantener separación clara entre lógica y presentación
- Priorizar el tipado fuerte y la seguridad de tipos

Siguiendo estas mejores prácticas de Angular, tu proyecto Angular alcanzará nuevas alturas en menos tiempo y te ayudará a reducir el dinero y recursos innecesarios gastados en el proyecto general.