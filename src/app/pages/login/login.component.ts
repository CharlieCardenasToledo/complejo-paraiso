import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, PersistenceType, UserRole } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [true]
  });

  isLoading = false;
  errorMessage = '';

  ngOnInit() {
    // Cargar el último email usado para iniciar sesión
    const lastEmail = this.authService.getLastLoginEmail();
    if (lastEmail) {
      this.loginForm.patchValue({ email: lastEmail });
    }

    // Verificar si ya hay una sesión activa
    this.authService.user$.pipe(take(1)).subscribe(user => {
      if (user) {
        console.log('Usuario ya autenticado, redirigiendo...');
        this.router.navigate(['/home']);
      }
    });
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
  get rememberMe() { return this.loginForm.get('rememberMe'); }

  // En login.component.ts, modifica el método onSubmit() para incluir redirecciones basadas en roles

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { email, password, rememberMe } = this.loginForm.value;
      console.log('Intentando iniciar sesión con:', email);

      // Determinar el tipo de persistencia basado en la opción "Recordarme"
      const persistenceType: PersistenceType = rememberMe ? 'local' : 'session';

      const result = await this.authService.login(email, password, persistenceType);
      console.log('Login exitoso:', result);

      // Esperar a que los datos del usuario se carguen
      this.authService.userData$.pipe(take(1)).subscribe({
        next: (userData) => {
          console.log('Datos de usuario cargados:', userData);

          // Redirigir según el rol del usuario
          if (userData && userData.role) {
            if (userData.role === UserRole.cocinero) {
              this.router.navigate(['/cocina']);
            } else if (userData.role === UserRole.admin) {
              this.router.navigate(['/admin']);
            } else {
              this.router.navigate(['/home']);
            }
          } else {
            // Si no hay rol definido, ir a home como fallback
            this.router.navigate(['/home']);
          }
        },
        error: (error) => {
          console.error('Error al cargar datos del usuario:', error);
          this.errorMessage = this.getErrorMessage(error.message || error);
          this.isLoading = false;
        }
      });
    } catch (error: any) {
      console.error('Error de inicio de sesión:', error);
      this.errorMessage = this.getErrorMessage(error.code || error.message);
      this.isLoading = false;
    }
  }

  private getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Email o contraseña incorrectos';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Intente más tarde';
      case 'auth/network-request-failed':
        return 'Error de conexión. Verifique su conexión a internet';
      case 'No user data found':
      case 'No se pudo crear el perfil de usuario':
        return 'Error al acceder a su perfil. Contacte al administrador';
      default:
        return 'Error al iniciar sesión. Intente nuevamente';
    }
  }
}