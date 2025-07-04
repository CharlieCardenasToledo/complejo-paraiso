# Guía Completa: Angular 20 - Mejores Prácticas y Arquitectura

## 🚀 Principales Novedades de Angular 20 (Mayo 2025)

### Signals Estables y Zoneless
- **Signals completamente estables**: `signal()`, `effect()`, `computed()`, `linkedSignal()`
- **Zoneless Change Detection**: Promovido a Developer Preview
- **Eliminación de Zone.js**: Modelo de reactividad más eficiente y explícito
- **httpResource**: Nueva API reactiva basada en signals para HTTP

### Requisitos Técnicos Actualizados
- **TypeScript**: 5.8+ (obligatorio)
- **Node.js**: 20+ (ya no soporta Node.js 18)
- **Nuevo Build System**: `@angular/build` reemplaza `@angular-devkit/build-angular`
- **Test Runner**: Vitest experimental reemplaza Karma

---

## 🏗️ Patrones de Diseño Esenciales

### 1. Patrón Singleton con Inyección de Dependencias

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private isAuthenticated = signal(false);
  private currentUser = signal<User | null>(null);
  
  login(credentials: LoginCredentials) {
    // Lógica de autenticación
    this.isAuthenticated.set(true);
    this.currentUser.set(user);
  }
  
  logout() {
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
  }
  
  // Getters reactivos
  get isLoggedIn() { return this.isAuthenticated.asReadonly(); }
  get user() { return this.currentUser.asReadonly(); }
}
```

### 2. Patrón Observer con Signals

```typescript
export class ShoppingCartService {
  private items = signal<CartItem[]>([]);
  
  // Computed signals para valores derivados
  readonly totalItems = computed(() => 
    this.items().reduce((sum, item) => sum + item.quantity, 0)
  );
  
  readonly totalPrice = computed(() =>
    this.items().reduce((sum, item) => sum + (item.price * item.quantity), 0)
  );
  
  // Effects para reaccionar a cambios
  constructor() {
    effect(() => {
      // Se ejecuta cuando items() cambia
      console.log(`Carrito actualizado: ${this.totalItems()} items`);
      this.saveToLocalStorage();
    });
  }
  
  addItem(item: CartItem) {
    this.items.update(current => [...current, item]);
  }
  
  private saveToLocalStorage() {
    // No usar localStorage en effects - mejor usar untracked()
    untracked(() => {
      localStorage.setItem('cart', JSON.stringify(this.items()));
    });
  }
}
```

### 3. Patrón Factory con Resource APIs

```typescript
// Nuevo httpResource para manejo de HTTP reactivo
export class UserService {
  private userId = signal<string>('');
  
  // Resource que se actualiza automáticamente cuando userId cambia
  userProfile = httpResource({
    request: () => ({ url: `/api/users/${this.userId()}` }),
    loader: ({ request }) => 
      this.http.get<User>(request.url).pipe(
        catchError(() => of(null))
      )
  });
  
  // Para WebSockets
  notifications = streamingResource({
    request: () => ({ userId: this.userId() }),
    loader: ({ request }) => 
      new WebSocketSubject(`ws://api/notifications/${request.userId}`)
  });
  
  setCurrentUser(id: string) {
    this.userId.set(id); // Automáticamente triggerea las resources
  }
}
```

---

## 🏛️ Arquitectura Component-First

### Estructura de Proyecto Recomendada

```
src/
├── app/
│   ├── core/                    # Servicios singleton y configuración
│   │   ├── services/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── config/
│   ├── shared/                  # Componentes y utilidades reutilizables
│   │   ├── components/
│   │   ├── pipes/
│   │   ├── directives/
│   │   └── utils/
│   ├── features/                # Features como standalone components
│   │   ├── user-management/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── models/
│   │   ├── dashboard/
│   │   └── reports/
│   ├── layout/                  # Componentes de layout
│   │   ├── header/
│   │   ├── sidebar/
│   │   └── footer/
│   └── main.ts
```

### Standalone Components Modernos

```typescript
@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    // Otros componentes standalone
    UserAvatarComponent,
    EditableFieldComponent
  ],
  template: `
    <mat-card class="user-profile">
      <mat-card-header>
        <app-user-avatar [user]="user()" [size]="'large'"/>
        <mat-card-title>{{ user()?.name }}</mat-card-title>
        <mat-card-subtitle>{{ user()?.email }}</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        @if (isEditing()) {
          <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
            <app-editable-field 
              label="Nombre" 
              [control]="profileForm.controls.name"/>
            <app-editable-field 
              label="Email" 
              [control]="profileForm.controls.email"/>
          </form>
        } @else {
          <div class="profile-display">
            <p><strong>Nombre:</strong> {{ user()?.name }}</p>
            <p><strong>Email:</strong> {{ user()?.email }}</p>
            <p><strong>Rol:</strong> {{ user()?.role }}</p>
          </div>
        }
      </mat-card-content>
      
      <mat-card-actions>
        @if (isEditing()) {
          <button mat-button (click)="cancelEdit()">Cancelar</button>
          <button mat-raised-button color="primary" (click)="saveProfile()">
            Guardar
          </button>
        } @else {
          <button mat-raised-button (click)="startEdit()">Editar</button>
        }
      </mat-card-actions>
    </mat-card>
  `,
  // Nuevas capacidades de host binding con signals
  host: {
    '[class.editing]': 'isEditing()',
    '[class.loading]': 'isLoading()',
    '(keydown.escape)': 'cancelEdit()'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserProfileComponent {
  // Inputs como signals (Angular 20)
  user = input.required<User>();
  readonly = input(false);
  
  // Outputs modernos
  userUpdated = output<User>();
  editModeChanged = output<boolean>();
  
  // Estado interno con signals
  private isEditing = signal(false);
  private isLoading = signal(false);
  
  // Form reactivo
  profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });
  
  constructor(
    private fb: FormBuilder,
    private userService: UserService
  ) {
    // Effect para sincronizar form con user input
    effect(() => {
      const currentUser = this.user();
      if (currentUser && !this.isEditing()) {
        this.profileForm.patchValue({
          name: currentUser.name,
          email: currentUser.email
        });
      }
    });
  }
  
  startEdit() {
    if (this.readonly()) return;
    
    this.isEditing.set(true);
    this.editModeChanged.emit(true);
  }
  
  cancelEdit() {
    this.isEditing.set(false);
    this.profileForm.reset();
    this.editModeChanged.emit(false);
  }
  
  async saveProfile() {
    if (this.profileForm.invalid) return;
    
    this.isLoading.set(true);
    
    try {
      const updatedUser = await this.userService.updateUser(
        this.user().id,
        this.profileForm.value
      );
      
      this.userUpdated.emit(updatedUser);
      this.isEditing.set(false);
      this.editModeChanged.emit(false);
    } catch (error) {
      console.error('Error updating user:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

---

## ⚡ Optimizaciones de Rendimiento

### 1. Migración a Zoneless

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    // otros providers
  ]
});
```

**Configuración angular.json para Zoneless:**
```json
{
  "build": {
    "options": {
      "polyfills": [
        // Remover "zone.js" de aquí
      ]
    }
  },
  "test": {
    "options": {
      "polyfills": [
        // Remover "zone.js/testing" de aquí
      ]
    }
  }
}
```

### 2. OnPush Strategy con Signals

```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Component code
})
export class OptimizedComponent {
  // Todas las propiedades como signals para máximo rendimiento
  data = input.required<DataType>();
  isLoading = signal(false);
  
  // Computed values se recalculan solo cuando dependencies cambian
  processedData = computed(() => {
    return this.data().map(item => ({
      ...item,
      computed: this.expensiveCalculation(item)
    }));
  });
  
  private expensiveCalculation(item: any) {
    // Lógica costosa que solo se ejecuta cuando es necesario
    return item.value * Math.random();
  }
}
```

### 3. Lazy Loading Moderno

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component')
      .then(m => m.DashboardComponent),
    title: 'Dashboard'
  },
  {
    path: 'users',
    loadChildren: () => import('./features/users/users.routes')
      .then(m => m.userRoutes)
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.component')
      .then(m => m.ReportsComponent),
    canActivate: [AuthGuard]
  }
];

// features/users/users.routes.ts
export const userRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-list/user-list.component')
      .then(m => m.UserListComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./user-detail/user-detail.component')
      .then(m => m.UserDetailComponent)
  }
];
```

---

## 🛠️ Testing con Angular 20

### Configuración de Tests sin Zone.js

```typescript
// test setup
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('UserComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // otros providers
      ]
    }).compileComponents();
  });
  
  it('should update user signal', async () => {
    const fixture = TestBed.createComponent(UserComponent);
    const component = fixture.componentInstance;
    
    // En lugar de fixture.detectChanges(), usar:
    await fixture.whenStable();
    
    component.user.set({ name: 'John', email: 'john@example.com' });
    await fixture.whenStable();
    
    expect(fixture.nativeElement.textContent).toContain('John');
  });
});
```

### Testing de Signals

```typescript
describe('ShoppingCartService', () => {
  let service: ShoppingCartService;
  
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShoppingCartService]
    });
    service = TestBed.inject(ShoppingCartService);
  });
  
  it('should calculate total correctly', () => {
    // Signals son síncronos, fáciles de testear
    service.addItem({ id: 1, name: 'Item 1', price: 10, quantity: 2 });
    service.addItem({ id: 2, name: 'Item 2', price: 15, quantity: 1 });
    
    expect(service.totalItems()).toBe(3);
    expect(service.totalPrice()).toBe(35);
  });
  
  it('should react to changes with effects', fakeAsync(() => {
    const consoleSpy = spyOn(console, 'log');
    
    service.addItem({ id: 1, name: 'Item', price: 10, quantity: 1 });
    tick(); // Para effects
    
    expect(consoleSpy).toHaveBeenCalledWith('Carrito actualizado: 1 items');
  }));
});
```

---

## 📋 Migración y Herramientas

### Schematic Migrations Automáticas

```bash
# Migrar a standalone components
ng generate @angular/core:standalone

# Migrar inputs a signals
ng generate @angular/core:signal-input-migration

# Migrar queries a signals
ng generate @angular/core:signal-queries-migration

# Migrar a control flow syntax
ng generate @angular/core:control-flow

# Migrar outputs
ng generate @angular/core:output-migration
```

### Actualización a Angular 20

```bash
# Actualizar Angular CLI
npm install -g @angular/cli@20

# Actualizar proyecto
ng update @angular/core@20 @angular/cli@20

# Verificar compatibilidad
ng update
```

---

## 🎯 Mejores Prácticas Generales

### 1. Gestión de Estado con Signals

```typescript
// Estado global con service
@Injectable({ providedIn: 'root' })
export class AppStateService {
  // Estado privado
  private _user = signal<User | null>(null);
  private _theme = signal<'light' | 'dark'>('light');
  private _notifications = signal<Notification[]>([]);
  
  // Exposición readonly
  readonly user = this._user.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly notifications = this._notifications.asReadonly();
  
  // Computed values
  readonly unreadCount = computed(() => 
    this._notifications().filter(n => !n.read).length
  );
  
  // Actions
  setUser(user: User | null) {
    this._user.set(user);
  }
  
  toggleTheme() {
    this._theme.update(current => current === 'light' ? 'dark' : 'light');
  }
  
  addNotification(notification: Notification) {
    this._notifications.update(current => [...current, notification]);
  }
}
```

### 2. Comunicación Entre Componentes

```typescript
// Parent Component
@Component({
  template: `
    <app-user-list 
      [users]="users()"
      [loading]="isLoading()"
      (userSelected)="onUserSelected($event)"
      (userDeleted)="onUserDeleted($event)">
    </app-user-list>
  `
})
export class UserManagementComponent {
  users = signal<User[]>([]);
  isLoading = signal(false);
  
  onUserSelected(user: User) {
    // Manejar selección
    this.router.navigate(['/users', user.id]);
  }
  
  onUserDeleted(userId: string) {
    this.users.update(current => 
      current.filter(user => user.id !== userId)
    );
  }
}
```

### 3. Manejo de Errores

```typescript
@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {
  private errors = signal<AppError[]>([]);
  
  readonly currentErrors = this.errors.asReadonly();
  
  handleError(error: any, context?: string) {
    const appError: AppError = {
      id: crypto.randomUUID(),
      message: error.message || 'Error desconocido',
      context,
      timestamp: new Date(),
      type: this.getErrorType(error)
    };
    
    this.errors.update(current => [...current, appError]);
    
    // Auto-remove después de 5 segundos
    setTimeout(() => {
      this.removeError(appError.id);
    }, 5000);
  }
  
  removeError(id: string) {
    this.errors.update(current => 
      current.filter(error => error.id !== id)
    );
  }
  
  private getErrorType(error: any): 'network' | 'validation' | 'unknown' {
    if (error.status) return 'network';
    if (error.validation) return 'validation';
    return 'unknown';
  }
}
```

---

## 🔄 Actualizaciones Continuadas

### Mantente Actualizado
- Sigue el [Angular Blog](https://blog.angular.dev)
- Revisa el [Roadmap oficial](https://angular.dev/roadmap)
- Participa en la comunidad Angular
- Experimenta con las features en Developer Preview

### Próximas Features (Angular 21+)
- **Signal-based Forms**: API experimental para formularios reactivos
- **Selectorless Components**: Eliminación de doble importación
- **Mejoras en Zoneless**: Estabilización completa
- **Nueva sintaxis de templates**: Más alineada con TypeScript

---

## 📚 Recursos Adicionales

- [Documentación Oficial Angular 20](https://angular.dev)
- [Angular Style Guide](https://angular.dev/style-guide)
- [Guía de Migración](https://angular.dev/update-guide)
- [Angular DevTools](https://angular.dev/tools/devtools)

---

**Versión de la guía**: Angular 20.0 (Mayo 2025)  
**Última actualización**: Julio 2025