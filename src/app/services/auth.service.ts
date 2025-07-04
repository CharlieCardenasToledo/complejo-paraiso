import { Injectable, inject } from '@angular/core';
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
import { Observable, of, switchMap, catchError, map, BehaviorSubject, firstValueFrom } from 'rxjs';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

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

  // Guardar último email utilizado
  private readonly LAST_EMAIL_KEY = 'lastLoginEmail';

  // Error de autenticación
  private authErrorSubject = new BehaviorSubject<string | null>(null);
  authError$ = this.authErrorSubject.asObservable();

  // Observables principales
  readonly user$ = authState(this.auth);

  readonly userData$: Observable<any> = this.user$.pipe(
    switchMap((user) => {
      if (user) {
        return this.getUserData(user.uid);
      } else {
        return of(null);
      }
    }),
    catchError(error => {
      console.error('Error loading user data:', error);
      return of(null);
    })
  );

  // Observables específicos por rol
  readonly isAdmin$ = this.userData$.pipe(
    map(user => user?.role === UserRole.admin)
  );

  readonly isWaiter$ = this.userData$.pipe(
    map(user => user?.role === UserRole.mesero)
  );

  readonly isCook$ = this.userData$.pipe(
    map(user => user?.role === UserRole.cocinero)
  );

  readonly isCashier$ = this.userData$.pipe(
    map(user => user?.role === UserRole.cobrador)
  );

  readonly userRole$ = this.userData$.pipe(
    map(user => user?.role || null)
  );

  constructor() {
    // Inicializar estado
    this.authErrorSubject.next(null);
  }

  /**
   * Método para iniciar sesión
   * @param email Email del usuario
   * @param password Contraseña
   * @param persistenceType Tipo de persistencia ('local', 'session', 'none')
   * @returns Promise<User>
   */
  async login(email: string, password: string, persistenceType: PersistenceType = 'session'): Promise<User> {
    try {
      this.authErrorSubject.next(null);

      // Guardar email para "Recordarme" si es persistencia local
      if (persistenceType === 'local') {
        localStorage.setItem(this.LAST_EMAIL_KEY, email);
      }

      // Establecer la persistencia de la sesión
      let persistence: Persistence;
      switch (persistenceType) {
        case 'local':
          persistence = browserLocalPersistence;
          break;
        case 'session':
          persistence = browserSessionPersistence;
          break;
        case 'none':
          persistence = inMemoryPersistence;
          break;
      }
      await this.auth.setPersistence(persistence);

      const result = await signInWithEmailAndPassword(this.auth, email, password);

      // Verificar que los datos del usuario se puedan cargar
      try {
        await firstValueFrom(this.getUserData(result.user.uid));
      } catch (error) {
        console.warn('No se pudieron cargar los datos del usuario, pero el inicio de sesión fue exitoso');
      }

      return result.user;
    } catch (error: any) {
      console.error('Error de inicio de sesión:', error);
      this.authErrorSubject.next(error.message);
      throw error;
    }
  }

  /**
   * Método para cerrar sesión
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
  }

  /**
   * Recupera los datos del usuario desde Firestore
   * @param uid UID del usuario
   * @returns Observable con los datos del usuario
   */
  private getUserData(uid: string): Observable<any> {
    return new Observable(observer => {
      const userDoc = doc(this.firestore, `users/${uid}`);

      getDoc(userDoc)
        .then(docSnapshot => {
          if (docSnapshot.exists()) {
            observer.next(docSnapshot.data());
            observer.complete();
          } else {
            console.warn(`No data found for user ${uid}`);
            observer.next(null);
            observer.complete();
          }
        })
        .catch(error => {
          console.error('Error al obtener datos del usuario:', error);
          observer.error(error);
        });
    });
  }

  /**
   * Verifica si un usuario tiene alguno de los roles permitidos
   * @param allowedRoles Array de roles permitidos
   * @returns Observable<boolean>
   */
  hasRole(allowedRoles: UserRole[]): Observable<boolean> {
    return this.userRole$.pipe(
      map(role => {
        if (!role) return false;
        return allowedRoles.includes(role as UserRole);
      })
    );
  }

  /**
   * Obtiene el último email utilizado para iniciar sesión
   * @returns string | null
   */
  getLastLoginEmail(): string | null {
    return localStorage.getItem(this.LAST_EMAIL_KEY);
  }

  /**
   * Crea un nuevo perfil de usuario en Firestore
   * @param uid UID del usuario
   * @param userData Datos del usuario
   * @returns Promise<void>
   */
  async createUserProfile(uid: string, userData: any): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${uid}`);
      await setDoc(userDoc, {
        ...userData,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error al crear perfil de usuario:', error);
      throw new Error('No se pudo crear el perfil de usuario');
    }
  }

  /**
   * Actualiza los datos de un usuario existente
   * @param uid UID del usuario
   * @param userData Datos a actualizar
   * @returns Promise<void>
   */
  async updateUserProfile(uid: string, userData: Partial<any>): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${uid}`);
      await setDoc(userDoc, {
        ...userData,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error al actualizar perfil de usuario:', error);
      throw new Error('No se pudo actualizar el perfil de usuario');
    }
  }
}