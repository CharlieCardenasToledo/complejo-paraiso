import { Component, inject, OnInit } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  description?: string;
  options?: string[];
  selectedOption?: string;
}

interface Category {
  category: string;
  items: OrderItem[];
}

@Component({
  standalone: true,
  imports: [FormsModule],
  selector: 'app-order',
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.scss'],
})
export class OrderComponent implements OnInit {
  step = 1;
  searchQuery = '';
  selectedTables: number[] = [];
  customer = {
    name: '',
    idNumber: '',
  };
  orderItems: OrderItem[] = [];
  menuCategories: Category[] = [];
  filteredCategories: Category[] = [];

  private firestore = inject(Firestore);
  private router = inject(Router);

  ngOnInit() {
    this.loadMenu();
  }

  private loadMenu(): void {
    const menuCollection = collection(this.firestore, 'menu');
    collectionData(menuCollection, { idField: 'id' }).subscribe(
      (data: any[]) => {
        const groupedCategories = data.reduce((acc, item) => {
          const category = item.category || 'Sin Categoría';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push({
            id: item.id,
            name: item.name,
            price: Number(item.price) || 0,
            quantity: 0,
            description: item.description || '',
            ...(item.option?.length > 0 ? { options: item.option } : {}),
          });
          return acc;
        }, {} as { [key: string]: OrderItem[] });

        this.menuCategories = Object.keys(groupedCategories).map(
          (category) => ({
            category,
            items: groupedCategories[category],
          })
        );
        this.filteredCategories = [...this.menuCategories];
      },
      (error) => {
        Swal.fire('Error', 'No se pudo cargar el menú', 'error');
        console.error('Error loading menu:', error);
      }
    );
  }

  filterMenu(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredCategories = this.menuCategories
      .map((category) => ({
        category: category.category,
        items: category.items.filter((item) =>
          item.name.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.items.length > 0);
  }

  toggleTableSelection(table: number): void {
    const index = this.selectedTables.indexOf(table);
    if (index === -1) {
      this.selectedTables.push(table);
    } else {
      this.selectedTables.splice(index, 1);
    }
  }

  addToOrder(item: OrderItem): void {
    const existingItem = this.orderItems.find((order) => order.id === item.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.orderItems.push({ ...item, quantity: 1 });
    }
  }

  removeFromOrder(item: OrderItem): void {
    const existingItem = this.orderItems.find((order) => order.id === item.id);
    if (existingItem) {
      existingItem.quantity -= 1;
      if (existingItem.quantity === 0) {
        this.orderItems = this.orderItems.filter(
          (order) => order.id !== item.id
        );
      }
    }
  }

  validateCustomer(): void {
    const idNumberRegex = /^[0-9]{10}$/;
    if (!idNumberRegex.test(this.customer.idNumber)) {
      /* Swal.fire(
        'Número de Cédula Inválido',
        'Por favor ingresa un número válido.',
        'warning'
      ); */
      this.customer.name = '';
      return;
    }

    const clientDocRef = doc(
      this.firestore,
      `client/${this.customer.idNumber}`
    );
    getDoc(clientDocRef)
      .then((docSnapshot) => {
        if (docSnapshot.exists()) {
          const clientData = docSnapshot.data() as { name: string };
          this.customer.name = clientData.name;
          Swal.fire(
            'Cliente Encontrado',
            `Bienvenido, ${clientData.name}`,
            'success'
          );
        } else {
          this.customer.name = '';
          Swal.fire(
            'Cliente No Encontrado',
            'Por favor registra un cliente.',
            'info'
          );
        }
      })
      .catch((error) => {
        Swal.fire('Error', 'No se pudo validar el cliente', 'error');
        console.error('Error validating customer:', error);
      });
  }

  confirmOrder(): void {
    const orderItems = this.orderItems.map(item => ({
      ...item,
      status: 'En espera'
    }));

    const orderData = {
      customer: this.customer,
      tables: this.selectedTables,
      items: orderItems,
      total: this.getTotal(),
      date: new Date(),
      status: 'En espera',
    };
    const orderCollection = collection(this.firestore, 'orders');
    const clientDocRef = doc(
      this.firestore,
      `client/${this.customer.idNumber}`
    );

    addDoc(orderCollection, orderData)
      .then(() => {
        Swal.fire(
          'Pedido Confirmado',
          '¡Tu pedido ha sido registrado exitosamente!',
          'success'
        );
        getDoc(clientDocRef).then((docSnapshot) => {
          if (!docSnapshot.exists()) {
            setDoc(clientDocRef, this.customer)
              .then(() => {
                console.log('Cliente guardado');
                this.customer = { name: '', idNumber: '' };
              })
              .catch((error) =>
                console.error('Error guardando cliente:', error)
              );
          }
        });
        this.resetForm();
      })
      .catch((error) => {
        Swal.fire('Error', 'No se pudo confirmar el pedido', 'error');
        console.error('Error confirming order:', error);
      });
  }

  nextStep(): void {
    if (this.step === 1 && this.selectedTables.length === 0) {
      Swal.fire(
        'Atención',
        '¡Debes seleccionar al menos una mesa antes de continuar!',
        'warning'
      );
      return;
    }

    if (this.step === 2 && this.orderItems.length === 0) {
      Swal.fire(
        'Atención',
        '¡Debes seleccionar al menos un plato antes de continuar!',
        'warning'
      );
      return;
    }

    if (this.step === 2 && !this.validateSelectedOptions()) {
      Swal.fire(
        'Atención',
        '¡Debes seleccionar una opción para todos los productos que tienen opciones y una cantidad mayor o igual a 1!',
        'warning'
      );
      return;
    }

    if (this.step < 3) {
      this.step++;
    }
  }

  previousStep(): void {
    if (this.step > 1) {
      this.step--;
    }
  }

  getItemQuantity(itemId: string): number {
    const item = this.orderItems.find((order) => order.id === itemId);
    return item ? item.quantity : 0;
  }

  updateSelectedOption(item: OrderItem, selectedOption: string): void {
    const existingItem = this.orderItems.find((order) => order.id === item.id);
    if (existingItem) {
      existingItem.selectedOption = selectedOption;
    }
  }

  private validateSelectedOptions(): boolean {
    return this.orderItems.every(
      (item) =>
        item.quantity === 0 ||
        !item.options ||
        (item.options.length > 0 && !!item.selectedOption)
    );
  }

  private resetForm(): void {
    this.step = 1;
    this.selectedTables = [];
    this.orderItems = [];
  }

  getTotal(): number {
    return this.orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  }
  goToHome() {
    this.router.navigate(['/']);
  }
}
