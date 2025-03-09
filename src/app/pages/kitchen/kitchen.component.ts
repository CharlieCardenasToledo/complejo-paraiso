import { Component, inject, OnInit } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  doc,
  updateDoc
} from '@angular/fire/firestore';
import { map, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormatDateSpanishPipe } from '../../pipes/format-date-spanish.pipe';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOption?: string;
  status?: 'En espera' | 'En preparación' | 'Realizado'; // Nuevo campo
}
interface Order {
  id: string;
  customer: {
    idNumber: string;
    name: string;
  };
  date: Date;
  status: 'En espera' | 'En preparación' | 'Realizado';
  total: number;
  items: OrderItem[];
  tables?: number[];
}

@Component({
  selector: 'app-kitchen',
  standalone: true,
  imports: [CommonModule, FormatDateSpanishPipe],
  templateUrl: './kitchen.component.html',
  styleUrls: ['./kitchen.component.scss'],
})
export class KitchenComponent implements OnInit {
  private firestore = inject(Firestore);
  private router = inject(Router);

  orders$: Observable<Order[]> = of([]);
  groupedOrders: Map<string, Order[]> = new Map();
  visibleDates: string[] = [];
  allDates: string[] = [];

  readonly INITIAL_DATES_TO_SHOW = 3;
  readonly DATES_TO_LOAD_MORE = 3;

  ngOnInit() {
    this.loadOrders();
  }
  updateItemStatus(order: Order, itemIndex: number, newStatus: 'En espera' | 'En preparación' | 'Realizado') {
    const orderRef = doc(this.firestore, `orders/${order.id}`);

    // Clonar la matriz de items para no modificar la original directamente
    const updatedItems = [...order.items];

    // Actualizar el estado del ítem específico
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      status: newStatus
    };

    // Actualizar el documento en Firestore
    updateDoc(orderRef, { items: updatedItems })
      .then(() => {
        // Actualizar el estado localmente
        order.items[itemIndex].status = newStatus;

        // Verificar si todos los ítems tienen el mismo estado para actualizar el estado general del pedido
        this.updateOrderStatusBasedOnItems(order);

        let statusMessage = '';
        let statusIcon = '';

        switch(newStatus) {
          case 'En preparación':
            statusMessage = `${order.items[itemIndex].name} ha pasado a preparación`;
            statusIcon = 'info';
            break;
          case 'Realizado':
            statusMessage = `${order.items[itemIndex].name} está listo`;
            statusIcon = 'success';
            break;
          case 'En espera':
            statusMessage = `${order.items[itemIndex].name} ha vuelto a la lista de espera`;
            statusIcon = 'warning';
            break;
        }

        Swal.fire({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          icon: statusIcon as any,
          title: statusMessage
        });
      })
      .catch((error) => {
        console.error('Error al actualizar el estado del ítem:', error);
        Swal.fire(
          'Error',
          'No se pudo actualizar el estado del ítem',
          'error'
        );
      });
  }

  // Método para actualizar el estado general del pedido basado en los ítems
  private updateOrderStatusBasedOnItems(order: Order) {
    // Verificar si todos los ítems tienen el mismo estado
    const allItemsStatuses = order.items.map(item => item.status || 'En espera');
    const uniqueStatuses = new Set(allItemsStatuses);

    if (uniqueStatuses.size === 1) {
      // Si todos los ítems tienen el mismo estado, actualizar el estado del pedido
      const newOrderStatus = allItemsStatuses[0] as 'En espera' | 'En preparación' | 'Realizado';

      // Si el estado del pedido es diferente, actualizarlo
      if (order.status !== newOrderStatus) {
        const orderRef = doc(this.firestore, `orders/${order.id}`);
        updateDoc(orderRef, { status: newOrderStatus })
          .then(() => {
            order.status = newOrderStatus;
          })
          .catch(error => {
            console.error('Error al actualizar el estado general del pedido:', error);
          });
      }
    } else if (allItemsStatuses.every(status => status === 'Realizado' || status === 'En preparación')) {
      // Si todos los ítems están en preparación o realizados, el pedido está en preparación
      if (order.status !== 'En preparación') {
        const orderRef = doc(this.firestore, `orders/${order.id}`);
        updateDoc(orderRef, { status: 'En preparación' })
          .then(() => {
            order.status = 'En preparación';
          })
          .catch(error => {
            console.error('Error al actualizar el estado general del pedido:', error);
          });
      }
    }
  }
  getItemStatusClass(status: string): string {
    switch(status) {
      case 'En espera':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'En preparación':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Realizado':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }
  private loadOrders() {
    const ordersCollection = collection(this.firestore, 'orders');
    // Crear una consulta ordenada por fecha descendente (más reciente primero)
    const ordersQuery = query(ordersCollection, orderBy('date', 'desc'));

    collectionData(ordersQuery, { idField: 'id' })
      .pipe(
        map((docs) =>
          docs.map((doc) => {
            const data = doc as any;
            // Si no hay un status definido, asignar "En espera" por defecto
            if (!data.status) {
              data.status = 'En espera';
            }

            // Asegurarse de que cada ítem tenga un estado
            if (data.items && Array.isArray(data.items)) {
              data.items = data.items.map((item:any) => ({
                ...item,
                status: item.status || 'En espera'
              }));
            }

            return {
              ...data,
              date: data.date?.toDate(),
            } as Order;
          })
        )
      )
      .subscribe((orders: Order[]) => {
        this.groupedOrders = this.groupOrdersByDate(orders);
        this.allDates = this.getSortedDates(this.groupedOrders);
        this.visibleDates = this.allDates.slice(0, this.INITIAL_DATES_TO_SHOW);
      });
  }

  private groupOrdersByDate(orders: Order[]): Map<string, Order[]> {
    const grouped = new Map<string, Order[]>();

    orders.forEach((order) => {
      const date = order.date.toLocaleDateString();
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(order);
    });

    // Ordenar los pedidos dentro de cada fecha por hora (más recientes primero)
    grouped.forEach((ordersForDate) => {
      ordersForDate.sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    return grouped;
  }

  private getSortedDates(groupedOrders: Map<string, Order[]>): string[] {
    return Array.from(groupedOrders.keys()).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime(); // Orden descendente
    });
  }

  loadMoreDates() {
    const currentLength = this.visibleDates.length;
    const nextDates = this.allDates.slice(
      currentLength,
      currentLength + this.DATES_TO_LOAD_MORE
    );
    this.visibleDates.push(...nextDates);
  }

  updateOrderStatus(order: Order, newStatus: 'En espera' | 'En preparación' | 'Realizado') {
    const orderRef = doc(this.firestore, `orders/${order.id}`);

    // Actualizar todos los ítems al mismo estado
    const updatedItems = order.items.map(item => ({
      ...item,
      status: newStatus
    }));

    updateDoc(orderRef, {
      status: newStatus,
      items: updatedItems
    })
      .then(() => {
        // Actualizar el estado localmente
        order.status = newStatus;
        order.items.forEach(item => item.status = newStatus);

        let statusMessage = '';
        let statusIcon = '';

        switch(newStatus) {
          case 'En preparación':
            statusMessage = 'El pedido completo ha pasado a preparación';
            statusIcon = 'info';
            break;
          case 'Realizado':
            statusMessage = 'El pedido completo está listo para ser entregado';
            statusIcon = 'success';
            break;
          case 'En espera':
            statusMessage = 'El pedido completo ha vuelto a la lista de espera';
            statusIcon = 'warning';
            break;
        }

        Swal.fire(
          'Estado actualizado',
          statusMessage,
          statusIcon as any
        );
      })
      .catch((error) => {
        console.error('Error al actualizar el estado del pedido:', error);
        Swal.fire(
          'Error',
          'No se pudo actualizar el estado del pedido',
          'error'
        );
      });
  }

  getStatusClass(status: string): string {
    switch(status) {
      case 'En espera':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'En preparación':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Realizado':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  navigateToHome() {
    this.router.navigate(['/']);
  }
}
