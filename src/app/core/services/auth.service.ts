import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Auth,
  User,
  signInWithEmailAndPassword,
  signOut,
  authState,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  Persistence
} from '@angular/fire/auth';
import { Observable, of, switchMap, catchError, map } from 'rxjs';
import { Firestore, doc, setDoc, docData } from '@angular/fire/firestore';
import { toObservable } from '@angular/core/rxjs-interop';
import { UserData } from '../models/data.model';

export enum UserRole {
  admin = 'admin',
  mesero = 'mesero',
  cocinero = 'cocinero',
  cobrador = 'cobrador'
}

export type PersistenceType = 'local' | 'session' | 'none';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  // Clave para el último email
  private readonly LAST_EMAIL_KEY = 'lastLoginEmail';

  // URL a la que redirigir después del login
  redirectUrl: string | null = null;

  // Estado de autenticación con Signals
  private authState = signal<{ user: User | null, userData: UserData | null, error: string | null, isLoading: boolean }>({
    user: null,
    userData: null,
    error: null,
    isLoading: true
  });

  // Selectores públicos (computed signals)
  readonly user = computed(() => this.authState().user);
  readonly userData = computed(() => this.authState().userData);
  readonly authError = computed(() => this.authState().error);
  readonly isLoading = computed(() => this.authState().isLoading);
  readonly userRole = computed(() => this.userData()?.role || null);

  // Selectores de rol específicos
  readonly isAdmin = computed(() => this.userRole() === UserRole.admin);
  readonly isWaiter = computed(() => this.userRole() === UserRole.mesero);
  readonly isCook = computed(() => this.userRole() === UserRole.cocinero);
  readonly isCashier = computed(() => this.userRole() === UserRole.cobrador);

  // Observables para compatibilidad (si es necesario)
  readonly user$ = toObservable(this.user);
  readonly userData$ = toObservable(this.userData);
  readonly authError$ = toObservable(this.authError);
  readonly userRole$ = toObservable(this.userRole);

  constructor() {
    // Suscribirse a los cambios de estado de autenticación de Firebase
    authState(this.auth).pipe(
      switchMap(user => {
        if (user) {
          return this.getUserData(user.uid).pipe(
            map(userData => ({ user, userData })),
            catchError(error => {
              console.error('Error loading user data:', error);
              return of({ user, userData: null });
            })
          );
        } else {
          return of({ user: null, userData: null });
        }
      })
    ).subscribe(({ user, userData }) => {
      this.authState.set({ user, userData, error: null, isLoading: false });
    });
  }

  /**
   * Inicia sesión
   */
  async login(email: string, password: string, persistenceType: PersistenceType = 'session'): Promise<User> {
    try {
      this.authState.update(state => ({ ...state, error: null }));

      if (persistenceType === 'local') {
        localStorage.setItem(this.LAST_EMAIL_KEY, email);
      }

      const persistence = this.getPersistence(persistenceType);
      await this.auth.setPersistence(persistence);

      const result = await signInWithEmailAndPassword(this.auth, email, password);
      
      // La suscripción a authState se encargará de actualizar el estado
      return result.user;

    } catch (error: any) {
      console.error('Error de inicio de sesión:', error);
      this.authState.update(state => ({ ...state, error: error.message }));
      throw error;
    }
  }

  /**
   * Cierra la sesión
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      // El observer de authState se encargará de limpiar el estado
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
  }

  /**
   * Recupera los datos del usuario desde Firestore
   */
  private getUserData(uid: string): Observable<UserData> {
    const userDoc = doc(this.firestore, `users/${uid}`);
    return docData(userDoc, { idField: 'id' }).pipe(
      map(data => {
        if (!data) {
          throw new Error('User data not found');
        }
        return data as UserData;
      })
    );
  }

  /**
   * Verifica si el usuario actual tiene uno de los roles permitidos
   */
  hasRole(allowedRoles: UserRole[]): boolean {
    const currentRole = this.userRole();
    return currentRole ? allowedRoles.includes(currentRole) : false;
  }

  /**
   * Obtiene el último email de inicio de sesión
   */
  getLastLoginEmail(): string | null {
    return localStorage.getItem(this.LAST_EMAIL_KEY);
  }

  /**
   * Crea un nuevo perfil de usuario en Firestore
   */
  async createUserProfile(uid: string, userData: UserData): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${uid}`);
      await setDoc(userDoc, { ...userData, createdAt: new Date() });
    } catch (error) {
      console.error('Error al crear perfil de usuario:', error);
      throw new Error('No se pudo crear el perfil de usuario');
    }
  }

  /**
   * Actualiza el perfil de un usuario
   */
  async updateUserProfile(uid: string, userData: Partial<any>): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${uid}`);
      await setDoc(userDoc, { ...userData, updatedAt: new Date() }, { merge: true });
    } catch (error) {
      console.error('Error al actualizar perfil de usuario:', error);
      throw new Error('No se pudo actualizar el perfil de usuario');
    }
  }

  /**
   * Devuelve el tipo de persistencia de Firebase
   */
  private getPersistence(type: PersistenceType): Persistence {
    switch (type) {
      case 'local': return browserLocalPersistence;
      case 'session': return browserSessionPersistence;
      case 'none': return inMemoryPersistence;
    }
  }
}
