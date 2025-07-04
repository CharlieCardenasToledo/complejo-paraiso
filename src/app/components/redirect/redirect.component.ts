import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { filter, take } from 'rxjs/operators';


@Component({
  selector: 'app-redirect',
  standalone: true,
  imports: [],
  templateUrl: './redirect.component.html',
  styleUrl: './redirect.component.scss'
})
export class RedirectComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  ngOnInit() {
    this.authService.userRole$
      .pipe(
        filter(role => role !== null),
        take(1)
      )
      .subscribe(role => {
        console.log('Rol detectado:', role);

        switch (role) {
          case 'admin':
          case 'mesero':
          case 'cobrador':
            this.router.navigate(['/home']);
            break;
          case 'cocinero':
            this.router.navigate(['/cocina']);
            break;
          default:
            this.router.navigate(['/login']);
        }
      });

    // Si después de 3 segundos no se ha detectado un rol, redirigir al login
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3000);
  }
}
