import { Component, inject, OnInit, effect } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, PersistenceType, UserRole } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
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

  constructor() {
    // Effect para redirigir si el usuario ya está autenticado al cargar el componente.
    // Se destruye a sí mismo después de la primera ejecución para evitar reinicios.
    const authCheckEffect = effect(() => {
      if (!this.authService.isLoading()) { // Esperar a que la carga inicial termine
        if (this.authService.user()) {
          console.log('Usuario ya autenticado, redirigiendo...');
          this.redirectUser(this.authService.userRole());
        }
        authCheckEffect.destroy(); // Asegurar que solo se ejecute una vez
      }
    });

    // Reaccionar a errores de autenticación
    effect(() => {
      const error = this.authService.authError();
      if (error) {
        this.errorMessage = this.getErrorMessage(error);
        this.isLoading = false;
      }
    });
  }

  ngOnInit() {
    // Cargar el último email usado
    const lastEmail = this.authService.getLastLoginEmail();
    if (lastEmail) {
      this.loginForm.patchValue({ email: lastEmail });
    }
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
  get rememberMe() { return this.loginForm.get('rememberMe'); }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { email, password, rememberMe } = this.loginForm.value;
      const persistenceType: PersistenceType = rememberMe ? 'local' : 'session';
      await this.authService.login(email, password, persistenceType);
      
      // Redirección explícita después de un login exitoso.
      this.redirectUser(this.authService.userRole());

    } catch (error: any) {
      // El effect de error se encargará de mostrar el mensaje
      console.error('Fallo el proceso de login:', error);
    }
  }

  private redirectUser(role: UserRole | null) {
    const redirectUrl = this.authService.redirectUrl;
    if (redirectUrl) {
      this.authService.redirectUrl = null; // Limpiar la URL para futuros logins
      this.router.navigateByUrl(redirectUrl);
      return;
    }

    if (role === UserRole.cocinero) {
      this.router.navigate(['/cocina']);
    } else if (role === UserRole.admin) {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/home']);
    }
  }

  private getErrorMessage(errorCode: string): string {
    if (errorCode.includes('auth/user-not-found') || errorCode.includes('auth/wrong-password') || errorCode.includes('auth/invalid-credential')) {
      return 'Email o contraseña incorrectos';
    }
    if (errorCode.includes('auth/too-many-requests')) {
      return 'Demasiados intentos fallidos. Intente más tarde';
    }
    if (errorCode.includes('auth/network-request-failed')) {
      return 'Error de conexión. Verifique su conexión a internet';
    }
    return 'Error al iniciar sesión. Intente nuevamente';
  }
}
