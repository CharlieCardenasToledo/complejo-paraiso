import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc } from '@angular/fire/firestore';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import Swal from 'sweetalert2';
import { User } from '../../models/data.model';
import { UserRole } from '../../core/services/auth.service';


@Component({
    selector: 'app-user-management',
    standalone: true,
    imports: [NgClass, CommonModule, FormsModule],
    templateUrl: './user-management.component.html',
    styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  users: User[] = [];
  newUser = {
    displayName: '',
    email: '',
    password: '',
    role: UserRole.mesero // Usar el enum directamente
  };

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    const usersCollection = collection(this.firestore, 'users');
    collectionData(usersCollection, { idField: 'uid' }).subscribe((users: any[]) => {
      this.users = users;
    });
  }

  async createUser() {
    try {
      // Validar datos
      if (!this.newUser.displayName || !this.newUser.email || !this.newUser.password) {
        Swal.fire('Error', 'Todos los campos son obligatorios', 'error');
        return;
      }

      // Crear usuario en Authentication
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        this.newUser.email,
        this.newUser.password
      );

      // Guardar datos en Firestore
      await setDoc(doc(this.firestore, `users/${credential.user.uid}`), {
        uid: credential.user.uid,
        email: this.newUser.email,
        displayName: this.newUser.displayName,
        role: this.newUser.role,
        createdAt: new Date()
      });

      Swal.fire('Éxito', 'Usuario creado correctamente', 'success');

      // Limpiar formulario
      this.newUser = {
        displayName: '',
        email: '',
        password: '',
        role: UserRole.mesero
      };

    } catch (error: any) {
      console.error('Error al crear usuario:', error);
      Swal.fire('Error', error.message, 'error');
    }
  }

  editUser(user: User) {
    Swal.fire({
      title: 'Editar Usuario',
      html: `
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input id="swal-name" class="w-full px-3 py-2 border border-gray-300 rounded-md" 
                 value="${user.displayName}">
        </div>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Rol</label>
          <select id="swal-role" class="w-full px-3 py-2 border border-gray-300 rounded-md">
            <option value="${UserRole.admin}" ${user.role === UserRole.admin ? 'selected' : ''}>Administrador</option>
            <option value="${UserRole.mesero}" ${user.role === UserRole.mesero ? 'selected' : ''}>Mesero</option>
            <option value="${UserRole.cocinero}" ${user.role === UserRole.cocinero ? 'selected' : ''}>Cocinero</option>
            <option value="${UserRole.cobrador}" ${user.role === UserRole.cobrador ? 'selected' : ''}>Cobrador</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const nameInput = document.getElementById('swal-name') as HTMLInputElement;
        const roleInput = document.getElementById('swal-role') as HTMLSelectElement;

        return {
          displayName: nameInput.value,
          role: roleInput.value as UserRole
        };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const data = result.value!;

        try {
          await setDoc(doc(this.firestore, `users/${user.uid}`), {
            ...user,
            displayName: data.displayName,
            role: data.role,
            updatedAt: new Date()
          }, { merge: true });

          Swal.fire('Éxito', 'Usuario actualizado correctamente', 'success');
        } catch (error) {
          console.error('Error al actualizar usuario:', error);
          Swal.fire('Error', 'No se pudo actualizar el usuario', 'error');
        }
      }
    });
  }

  deleteUser(user: User) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar al usuario ${user.displayName}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteDoc(doc(this.firestore, `users/${user.uid}`));
          Swal.fire('Eliminado', 'El usuario ha sido eliminado', 'success');
        } catch (error) {
          console.error('Error al eliminar usuario:', error);
          Swal.fire('Error', 'No se pudo eliminar el usuario', 'error');
        }
      }
    });
  }

  getRoleName(role: UserRole): string {
    switch (role) {
      case UserRole.admin: return 'Administrador';
      case UserRole.mesero: return 'Mesero';
      case UserRole.cocinero: return 'Cocinero';
      case UserRole.cobrador: return 'Cobrador';
      default: return '';
    }
  }
}