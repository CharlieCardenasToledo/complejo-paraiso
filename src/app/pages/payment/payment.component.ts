// payment.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, addDoc, collection, doc, getDoc, getDocs, updateDoc } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { Order, OrderItem, Payment } from '../../models/data.model';
import { CashRegisterService } from '../../services/cash-register.service';

@Component({
    selector: 'app-payment',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './payment.component.html'
})
export class PaymentComponent implements OnInit {
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cashRegisterService = inject(CashRegisterService);

  // Exponer Math para usarlo en el template
  Math = Math;

  order: Order | null = null;
  loading: boolean = true;
  error: string | null = null;

  // Para dividir cuenta
  isSplittingBill: boolean = false;
  splitMode: 'items' | 'equal' = 'items';
  numberOfParts: number = 2;
  splitParts: { name: string; items: OrderItem[]; total: number; amountReceived?: number; change?: number }[] = [];
  unassignedItems: OrderItem[] = [];

  // Para cálculo de vuelto
  amountReceived: number = 0;
  change: number = 0;
  showChangeCalculator: boolean = false;

  // Para método de pago
  paymentMethod: string = 'Efectivo'; // Por defecto
  paymentMethods: string[] = ['Efectivo', 'Transferencia', 'Ahorita', 'De una'];
  // Nuevos campos para métodos de pago electrónicos
  bankName: string = '';
  transactionCode: string = '';

  // Para controlar el menú desplegable
  selectedItemForAssignment: OrderItem | null = null;
  showAssignmentMenu: boolean = false;

  ngOnInit() {
    this.route.params.subscribe(params => {
      const orderId = params['id'];
      if (orderId) {
        this.loadOrder(orderId);
      } else {
        this.error = 'No se proporcionó un ID de pedido válido';
        this.loading = false;
      }
    });
  }

  processSplitPayment(partIndex: number) {
    if (!this.order) return;

    const part = this.splitParts[partIndex];

    if (part.items.length === 0) {
      Swal.fire('Error', 'No hay items asignados a esta parte', 'error');
      return;
    }

    // Crear un HTML para el modal
    let htmlContent = `
      <div class="text-left mb-4">
        <p class="mb-2"><strong>Total a pagar:</strong> $${part.total.toFixed(2)}</p>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Método de pago:</label>
          <select id="swal-payment-method" class="w-full px-3 py-2 border border-gray-300 rounded-md">
            ${this.paymentMethods.map(method => `<option value="${method}">${method}</option>`).join('')}
          </select>
        </div>
        
        <!-- Contenedor para campos dinámicos -->
        <div id="payment-fields-container" class="mb-3">
          <!-- Por defecto mostramos el campo de efectivo -->
          <div id="efectivo-fields">
            <label class="block text-sm font-medium text-gray-700 mb-1">Monto recibido:</label>
            <input id="swal-amount" type="number" step="0.01" min="${part.total}" value="${part.total}" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
          </div>
          
          <!-- Campos para transferencia (inicialmente ocultos) -->
          <div id="transferencia-fields" style="display:none;">
            <div class="mb-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Banco:</label>
              <input id="swal-bank" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Nombre del banco">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Código de transacción:</label>
              <input id="swal-transfer-code" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Código de la transferencia">
            </div>
          </div>
          
          <!-- Campos para Ahorita y De una (inicialmente ocultos) -->
          <div id="code-fields" style="display:none;">
            <label class="block text-sm font-medium text-gray-700 mb-1">Código de transacción:</label>
            <input id="swal-code" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Código de transacción">
          </div>
        </div>
      </div>
    `;

    Swal.fire({
      title: `Cobrar a ${part.name}`,
      html: htmlContent,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Cobrar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        // Agregar listener para cambiar los campos mostrados según el método seleccionado
        const methodSelect = document.getElementById('swal-payment-method') as HTMLSelectElement;
        const efectivoFields = document.getElementById('efectivo-fields');
        const transferenciaFields = document.getElementById('transferencia-fields');
        const codeFields = document.getElementById('code-fields');

        methodSelect.addEventListener('change', function () {
          const selectedMethod = this.value;

          // Ocultar todos los campos
          if (efectivoFields) efectivoFields.style.display = 'none';
          if (transferenciaFields) transferenciaFields.style.display = 'none';
          if (codeFields) codeFields.style.display = 'none';

          // Mostrar los campos según el método seleccionado
          if (selectedMethod === 'Efectivo' && efectivoFields) {
            efectivoFields.style.display = 'block';
          } else if (selectedMethod === 'Transferencia' && transferenciaFields) {
            transferenciaFields.style.display = 'block';
          } else if ((selectedMethod === 'Ahorita' || selectedMethod === 'De una') && codeFields) {
            codeFields.style.display = 'block';
          }
        });
      },
      preConfirm: () => {
        const methodSelect = document.getElementById('swal-payment-method') as HTMLSelectElement;
        const selectedMethod = methodSelect.value;

        // Validar según el método seleccionado
        if (selectedMethod === 'Efectivo') {
          const amountInput = document.getElementById('swal-amount') as HTMLInputElement;
          const amount = parseFloat(amountInput.value);

          if (isNaN(amount) || amount < part.total) {
            Swal.showValidationMessage('El monto recibido debe ser mayor o igual al total');
            return false;
          }

          return {
            method: selectedMethod,
            amountReceived: amount,
            change: amount - part.total
          };
        }
        else if (selectedMethod === 'Transferencia') {
          const bankInput = document.getElementById('swal-bank') as HTMLInputElement;
          const codeInput = document.getElementById('swal-transfer-code') as HTMLInputElement;

          if (!bankInput.value.trim()) {
            Swal.showValidationMessage('Debe ingresar el nombre del banco');
            return false;
          }

          if (!codeInput.value.trim()) {
            Swal.showValidationMessage('Debe ingresar el código de transacción');
            return false;
          }

          return {
            method: selectedMethod,
            bankName: bankInput.value.trim(),
            transactionCode: codeInput.value.trim()
          };
        }
        else if (selectedMethod === 'Ahorita' || selectedMethod === 'De una') {
          const codeInput = document.getElementById('swal-code') as HTMLInputElement;

          if (!codeInput.value.trim()) {
            Swal.showValidationMessage('Debe ingresar el código de transacción');
            return false;
          }

          return {
            method: selectedMethod,
            transactionCode: codeInput.value.trim()
          };
        }

        return false;
      }
    }).then(result => {
      if (result.isConfirmed && result.value) {
        const paymentData = result.value;

        // Si es efectivo, mostrar mensaje de cambio
        if (paymentData.method === 'Efectivo' && paymentData.change > 0) {
          Swal.fire({
            title: 'Cambio',
            html: `
              <p>Entregar cambio de:</p>
              <p class="text-2xl font-bold">$${paymentData.change.toFixed(2)}</p>
            `,
            icon: 'success',
            confirmButtonText: 'Completar'
          }).then(() => this.completeSplitPayment(partIndex, paymentData));
        } else {
          this.completeSplitPayment(partIndex, paymentData);
        }
      }
    });
  }

  // Método para completar el pago dividido después de confirmar
  private completeSplitPayment(partIndex: number, paymentData: any) {
    if (!this.order) return;

    const part = this.splitParts[partIndex];

    // Marcar los items de esta parte como pagados
    if (this.order) {
      // Obtener items de esta parte y combinarlos para actualizar los originales
      const paidItems = [...part.items];

      // Encontrar los items correspondientes en el pedido original
      const orderItemMap = new Map<string, OrderItem>();
      this.order?.items?.forEach(item => {
        orderItemMap.set(item.id, item);
      });

      // Marcar como servidos los items en el pedido original
      paidItems.forEach(paidItem => {
        const originalId = paidItem.originalId ? paidItem.originalId.split('-split-')[0] : paidItem.id;
        const originalItem = orderItemMap.get(originalId);

        if (originalItem) {
          // Si la cantidad del original es igual a la cantidad pagada, marcar como Servido
          if (this.countSplitItemsInPaidParts(originalId) >= originalItem.quantity) {
            originalItem.status = 'Servido';
          }
        }
      });

      // Registrar este pago en la colección de pagos
      this.registerSplitPayment(part, paymentData);

      // Registrar el pago en la caja registradora
      this.registerSplitPaymentInCashRegister(part, paymentData);
    }
  }

  private registerSplitPaymentInCashRegister(part: any, paymentData: any): void {
    if (!this.order) return;

    // Verificar primero si hay una caja abierta
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register) {
          Swal.fire({
            icon: 'error',
            title: 'Caja Cerrada',
            text: 'No se puede procesar el pago porque no hay una caja abierta.',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        // Asegurarnos de que los ítems de esta parte estén marcados como "Servido"
        if (part.items && part.items.length > 0) {
          interface SplitItem extends OrderItem {
            originalId?: string;
          }

          part.items.forEach((paidItem: SplitItem) => {
            const originalId: string = paidItem.originalId ? paidItem.originalId.split('-split-')[0] : paidItem.id;
            const originalItem: OrderItem | undefined = this.order!.items.find(item => item.id === originalId);

            if (originalItem) {
              originalItem.status = 'Servido';
            }
          });

          // Actualizar el estado en Firestore
          if (!this.order) return;
          const orderRef = doc(this.firestore, `orders/${this.order.id}`);
          updateDoc(orderRef, { items: this.order.items }).catch(error => {
            console.error('Error al actualizar estado de ítems a servido:', error);
          });
        }

        // Preparar la descripción del pago
        const description = this.order ? `Pago parcial (${part.name}) - Pedido #${this.order.id} - Cliente: ${this.order.customer.name}` : 'Pago parcial';

        // Registrar el pago en la caja
        this.cashRegisterService.registerPayment({
          orderId: this.order?.id ?? '',
          amount: part.total,
          paymentMethod: paymentData.method,
          description: description
        }).subscribe({
          next: (success) => {
            if (!success) {
              console.warn('El pago parcial se registró en el sistema pero no se pudo actualizar la caja');
            }
          },
          error: (error) => {
            console.error('Error al registrar pago parcial en caja:', error);
          }
        });
      },
      error: (error) => {
        console.error('Error al verificar el estado de la caja:', error);
      }
    });
  }

  // Método para registrar el pago dividido en Firestore
  private async registerSplitPayment(part: any, paymentData: any) {
    if (!this.order) return;

    try {
      // Crear una colección de pagos dentro del documento del pedido
      const paymentsCollection = collection(this.firestore, `orders/${this.order.id}/payments`);

      // Crear objeto de pago
      const paymentDoc = {
        amount: part.total,
        partName: part.name,
        items: part.items,
        timestamp: new Date(),
        splitMode: this.splitMode,
        isEqualSplit: this.splitMode === 'equal',
        totalParts: this.numberOfParts,
        ...paymentData
      };

      // Guardar el pago
      await addDoc(paymentsCollection, paymentDoc);

      // Remover los items pagados de la lista de partes
      part.items = [];
      part.total = 0;

      // Actualizar en Firestore
      this.updateOrderItems();

      // Verificar si todos los ítems están asignados y pagados
      this.checkSplitStatus();

      // Mostrar mensaje de éxito
      let successMessage = `Se ha cobrado a ${part.name}`;

      // Mensaje personalizado según el método
      if (paymentData.method === 'Transferencia') {
        successMessage += ` (Banco: ${paymentData.bankName}, Código: ${paymentData.transactionCode})`;
      } else if (paymentData.method === 'Ahorita' || paymentData.method === 'De una') {
        successMessage += ` (Código: ${paymentData.transactionCode})`;
      }

      Swal.fire({
        title: 'Cobrado',
        text: successMessage,
        icon: 'success',
        confirmButtonText: 'Continuar'
      });
    } catch (error) {
      console.error('Error al registrar el pago dividido:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo registrar el pago',
        icon: 'error'
      });
    }
  }

  isPaymentFormValid(): boolean {
    switch (this.paymentMethod) {
      case 'Efectivo':
        return this.amountReceived >= (this.order?.total || 0);
      case 'Transferencia':
        return !!this.bankName && !!this.transactionCode;
      case 'Ahorita':
      case 'De una':
        return !!this.transactionCode;
      default:
        return false;
    }
  }

  private loadOrder(orderId: string) {
    const orderRef = doc(this.firestore, 'orders', orderId);
    getDoc(orderRef)
      .then(docSnapshot => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data() as any;
          this.order = {
            id: orderId,
            customer: data.customer,
            date: data.date.toDate(),
            status: data.status,
            total: data.total,
            items: data.items.map((item: any) => ({
              ...item,
              splitAssigned: false
            })),
            tables: data.tables
          };
          this.loading = false;
        } else {
          this.error = 'El pedido no existe';
          this.loading = false;
        }
      })
      .catch(error => {
        console.error('Error al cargar el pedido:', error);
        this.error = 'Error al cargar el pedido';
        this.loading = false;
      });
  }

  // Método para procesar el pago completo
  processFullPayment() {
    if (!this.order) {
      Swal.fire('Error', 'No hay un pedido para cobrar', 'error');
      return;
    }

    // Verificar que haya una caja abierta
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register) {
          Swal.fire({
            icon: 'error',
            title: 'Caja Cerrada',
            text: 'No se puede procesar el pago porque no hay una caja abierta.',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        // Continuar con el proceso de pago normal
        this.showChangeCalculator = true;
        this.amountReceived = this.order?.total ?? 0; // Por defecto, el monto exacto
      },
      error: (error) => {
        console.error('Error al verificar estado de caja:', error);
        Swal.fire('Error', 'No se pudo verificar el estado de la caja', 'error');
      }
    });
  }

  // Método para confirmar el pago después de calcular el vuelto
  confirmPayment() {
    if (!this.order) return;

    if (!this.isPaymentFormValid()) {
      let errorMessage = '';

      switch (this.paymentMethod) {
        case 'Efectivo':
          errorMessage = 'El monto recibido es menor que el total a pagar';
          break;
        case 'Transferencia':
          errorMessage = 'Debe ingresar el banco y el código de transacción';
          break;
        case 'Ahorita':
        case 'De una':
          errorMessage = 'Debe ingresar el código de transacción';
          break;
      }

      Swal.fire('Error', errorMessage, 'error');
      return;
    }

    this.change = this.paymentMethod === 'Efectivo' ? this.amountReceived - this.order.total : 0;

    // Mensaje adaptado según método de pago
    let messageHtml = `
      <div class="text-left">
        <p><strong>Total a pagar:</strong> $${this.order.total.toFixed(2)}</p>
        <p><strong>Método de pago:</strong> ${this.paymentMethod}</p>
    `;

    if (this.paymentMethod === 'Efectivo') {
      messageHtml += `
        <p><strong>Monto recibido:</strong> $${this.amountReceived.toFixed(2)}</p>
        <p><strong>Cambio a entregar:</strong> $${this.change.toFixed(2)}</p>
      `;
    } else if (this.paymentMethod === 'Transferencia') {
      messageHtml += `
        <p><strong>Banco:</strong> ${this.bankName}</p>
        <p><strong>Código de transacción:</strong> ${this.transactionCode}</p>
      `;
    } else if (this.paymentMethod === 'Ahorita' || this.paymentMethod === 'De una') {
      messageHtml += `
        <p><strong>Código de transacción:</strong> ${this.transactionCode}</p>
      `;
    }

    messageHtml += '</div>';

    Swal.fire({
      title: 'Confirmar pago',
      html: messageHtml,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar pago',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed && this.order) {
        // Marcar todos los ítems como "Servido" en lugar de "Listos para servir"
        this.order?.items?.forEach(item => {
          item.status = 'Servido';
        });

        // Guardar el método de pago y datos adicionales
        this.order.paymentMethod = this.paymentMethod;

        // Guardar información adicional según el método de pago
        const paymentDetails: any = {
          method: this.paymentMethod
        };

        if (this.paymentMethod === 'Efectivo') {
          paymentDetails.amountReceived = this.amountReceived;
          paymentDetails.change = this.change;
        } else if (this.paymentMethod === 'Transferencia') {
          paymentDetails.bankName = this.bankName;
          paymentDetails.transactionCode = this.transactionCode;
        } else if (this.paymentMethod === 'Ahorita' || this.paymentMethod === 'De una') {
          paymentDetails.transactionCode = this.transactionCode;
        }

        this.order.paymentDetails = paymentDetails;

        // Registrar el pago en la colección de pagos
        this.registerPayment(this.order.id, paymentDetails);

        // Actualizar en Firestore y finalizar
        this.finalizeOrder(this.order.id);
      }
    });
  }

  // Registrar pago en la colección de pagos
  async registerPayment(orderId: string, paymentDetails: any) {
    if (!this.order) return;

    try {
      const paymentsCollection = collection(this.firestore, `orders/${orderId}/payments`);

      await addDoc(paymentsCollection, {
        amount: this.order?.total ?? 0,
        ...paymentDetails,
        timestamp: new Date(),
        partName: 'Pago completo',
        splitMode: 'complete'
      });
    } catch (error) {
      console.error('Error al registrar el pago:', error);
    }
  }

  // Método para reiniciar campos de pago al cambiar método
  resetPaymentFields() {
    this.bankName = '';
    this.transactionCode = '';
  }

  // Cancelar calculadora de vuelto
  cancelChangeCalculator() {
    this.showChangeCalculator = false;
    this.amountReceived = 0;
    this.change = 0;
    this.resetPaymentFields();
  }

  // Calcular el vuelto en tiempo real
  calculateChange() {
    if (!this.order) return;

    if (this.amountReceived >= this.order.total) {
      this.change = this.amountReceived - this.order.total;
    } else {
      this.change = 0;
    }
  }

  finalizeOrder(orderId: string) {
    const orderRef = doc(this.firestore, 'orders', orderId);

    // Datos a actualizar en Firestore
    const updateData: any = {
      status: 'Cobrado',
      paidAt: new Date(),
      paymentMethod: this.paymentMethod
    };

    // Agregar detalles adicionales según método de pago
    if (this.paymentMethod === 'Transferencia') {
      updateData.bankName = this.bankName;
      updateData.transactionCode = this.transactionCode;
    } else if (this.paymentMethod === 'Ahorita' || this.paymentMethod === 'De una') {
      updateData.transactionCode = this.transactionCode;
    }

    // Verificar si la caja está abierta antes de finalizar el pedido
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register) {
          Swal.fire({
            icon: 'error',
            title: 'Caja Cerrada',
            text: 'No se puede finalizar el pedido porque la caja está cerrada.',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        updateDoc(orderRef, updateData)
          .then(() => {
            // Registrar el pago en la caja registradora
            this.registerPaymentInCashRegister(orderId);

            let successMessage = `El pedido ha sido cobrado correctamente con ${this.paymentMethod}`;

            // Mensaje personalizado según el método
            if (this.paymentMethod === 'Transferencia') {
              successMessage += ` (Banco: ${this.bankName}, Código: ${this.transactionCode})`;
            } else if (this.paymentMethod === 'Ahorita' || this.paymentMethod === 'De una') {
              successMessage += ` (Código: ${this.transactionCode})`;
            }

            Swal.fire({
              title: '¡Cobrado!',
              text: successMessage,
              icon: 'success',
              confirmButtonText: 'Volver al inicio'
            }).then(() => {
              this.router.navigate(['/']);
            });
          })
          .catch(error => {
            console.error('Error al cobrar el pedido:', error);
            Swal.fire('Error', 'No se pudo cobrar el pedido', 'error');
          });
      },
      error: (error) => {
        console.error('Error al verificar el estado de la caja:', error);
        Swal.fire('Error', 'No se pudo verificar el estado de la caja', 'error');
      }
    });
  }

  private registerPaymentInCashRegister(orderId: string): void {
    if (!this.order) return;

    // Verificar primero si hay una caja abierta
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register) {
          console.warn('No hay una caja abierta. El pago se registró pero no se actualizó la caja');
          Swal.fire({
            icon: 'warning',
            title: 'Pago registrado',
            text: 'El pago se ha registrado correctamente, pero no se pudo actualizar la caja porque está cerrada.',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        // Verificar si todos los ítems están en estado "Servido"
        const allItemsServed = this.order?.items?.every(item => item.status === 'Servido') ?? false;

        if (!allItemsServed) {
          console.warn('Algunos ítems no han sido servidos antes del cobro');
          // Actualizar el estado de todos los ítems a "Servido"
          this.order?.items?.forEach(item => {
            item.status = 'Servido';
          });

          // Actualizar en Firestore
          if (!this.order) return;
          const orderRef = doc(this.firestore, 'orders', this.order.id);
          updateDoc(orderRef, { items: this.order.items }).catch(error => {
            console.error('Error al actualizar estado de ítems a servido:', error);
          });
        }

        // Preparar la descripción del pago
        const description = `Pago de pedido #${orderId} - Cliente: ${this.order?.customer?.name || 'Desconocido'}`;

        // Registrar el pago en la caja
        this.cashRegisterService.registerPayment({
          orderId: orderId,
          amount: this.order?.total ?? 0,
          paymentMethod: this.paymentMethod,
          description: description
        }).subscribe({
          next: (success) => {
            if (!success) {
              console.warn('El pago se registró en el sistema pero no se pudo actualizar la caja');
            }
          },
          error: (error) => {
            console.error('Error al registrar pago en caja:', error);
          }
        });
      },
      error: (error) => {
        console.error('Error al verificar el estado de la caja:', error);
      }
    });
  }

  // Método para iniciar la división de cuenta
  startSplitBill() {
    this.isSplittingBill = true;
    this.splitMode = 'items'; // Por defecto, dividir por items
    this.initializeSplitParts();
  }

  // Cambiar el modo de división
  changeSplitMode(mode: 'items' | 'equal') {
    this.splitMode = mode;
    // Reiniciar las partes
    this.initializeSplitParts();
  }

  initializeSplitParts() {
    this.splitParts = [];
    for (let i = 0; i < this.numberOfParts; i++) {
      this.splitParts.push({
        name: `Persona ${i + 1}`,
        items: [],
        total: 0
      });
    }

    // Inicializar items sin asignar
    if (this.order) {
      this.unassignedItems = [];

      // Dividir los items con cantidad > 1 en items individuales
      this.order.items.forEach(item => {
        // Si la cantidad es mayor a 1, dividir en items individuales
        if (item.quantity > 1) {
          for (let i = 0; i < item.quantity; i++) {
            // Crear un item individual con cantidad 1
            this.unassignedItems.push({
              ...item,
              quantity: 1,
              splitAssigned: false,
              originalId: item.id, // Guardar el ID original para referencia
              id: `${item.id}-split-${i}` // Crear un ID único para cada item dividido
            });
          }
        } else {
          // Si la cantidad es 1, simplemente agregar el item
          this.unassignedItems.push({
            ...item,
            splitAssigned: false
          });
        }
      });
    } else {
      this.unassignedItems = [];
    }
  }

  // Mostrar menú de asignación para un ítem específico
  showAssignMenu(item: OrderItem) {
    this.selectedItemForAssignment = item;
    this.showAssignmentMenu = true;
  }

  // Ocultar menú de asignación
  hideAssignMenu() {
    setTimeout(() => {
      this.showAssignmentMenu = false;
      this.selectedItemForAssignment = null;
    }, 200);
  }

  // Modifica el método assignItemToPart para trabajar con los items divididos
  assignItemToPart(item: OrderItem, partIndex: number) {
    // Marcar el item como asignado
    item.splitAssigned = true;

    // Añadir a la parte seleccionada
    this.splitParts[partIndex].items.push(item);

    // Actualizar el total de esa parte
    this.splitParts[partIndex].total += item.price * item.quantity;

    // Remover de los items sin asignar
    this.unassignedItems = this.unassignedItems.filter(i => i.id !== item.id);

    // Ocultar el menú
    this.hideAssignMenu();
  }

  removeItemFromPart(partIndex: number, itemIndex: number) {
    const item = this.splitParts[partIndex].items[itemIndex];

    // Actualizar el total
    this.splitParts[partIndex].total -= item.price * item.quantity;

    // Remover el item
    this.splitParts[partIndex].items.splice(itemIndex, 1);

    // Devolver a items sin asignar
    item.splitAssigned = false;
    this.unassignedItems.push(item);
  }

  // Nuevo método para contar cuántos items divididos de un ID original han sido pagados
  private countSplitItemsInPaidParts(originalId: string): number {
    let count = 0;

    // Contar los items ya pagados (que ya no están en ninguna parte)
    const paidItems = this.order!.items.filter(item => item.id === originalId && item.status === 'Listos para servir');
    if (paidItems.length > 0) {
      count = paidItems.reduce((sum, item) => sum + item.quantity, 0);
    }

    // Contar los items en la cuenta actual que ya han sido asignados y pagados
    this.splitParts.forEach(part => {
      if (part.items.length === 0) { // Parte ya pagada
        const matchingItems = part.items.filter(item =>
          (item.originalId && item.originalId.split('-split-')[0] === originalId) || item.id === originalId
        );
        count += matchingItems.length;
      }
    });

    return count;
  }

  // Función auxiliar para ver los pagos de un pedido (opcional)
  async viewPayments() {
    if (!this.order) return;

    try {
      const paymentsCollection = collection(this.firestore, `orders/${this.order.id}/payments`);
      const paymentsSnapshot = await getDocs(paymentsCollection);

      if (paymentsSnapshot.empty) {
        Swal.fire('Sin pagos', 'Este pedido aún no tiene pagos registrados', 'info');
        return;
      }

      // Convertir a array de datos con el tipo Payment adecuado
      const payments: Payment[] = paymentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          partName: data['partName'] || 'Desconocido',
          amount: data['amount'] || 0,
          amountReceived: data['amountReceived'],
          change: data['change'],
          paymentMethod: data['paymentMethod'] || 'Desconocido',
          timestamp: data['timestamp']?.toDate() || new Date(),
          splitMode: data['splitMode'] || 'complete',
          items: data['items'] || [],
          isEqualSplit: data['isEqualSplit'],
          totalParts: data['totalParts']
        };
      });

      // Mostrar un resumen de los pagos
      let html = '<div class="space-y-4">';

      payments.forEach(payment => {
        html += `
          <div class="border rounded p-3">
            <div class="font-bold">${payment.partName}</div>
            <div>Monto: ${payment.amount.toFixed(2)}</div>
            <div>Método: ${payment.paymentMethod}</div>
            <div>Fecha: ${payment.timestamp.toLocaleString()}</div>
          </div>
        `;
      });

      html += '</div>';

      Swal.fire({
        title: 'Historial de Pagos',
        html,
        width: '600px'
      });
    } catch (error) {
      console.error('Error al obtener pagos:', error);
      Swal.fire('Error', 'No se pudieron cargar los pagos', 'error');
    }
  }

  // Actualizar los items del pedido en Firestore
  private updateOrderItems() {
    if (!this.order) return;

    const orderRef = doc(this.firestore, 'orders', this.order.id);
    updateDoc(orderRef, {
      items: this.order.items
    }).catch(error => {
      console.error('Error al actualizar los items:', error);
      Swal.fire('Error', 'No se pudieron actualizar los items del pedido', 'error');
    });
  }

  // Verificar el estado de la división de cuenta
  private checkSplitStatus() {
    if (!this.order) return;

    if (this.splitMode === 'equal') {
      // Verificar si todos los totales están en cero (pagados)
      const allPaid = this.splitParts.every(part => part.total === 0);

      if (allPaid) {
        Swal.fire({
          title: 'Pedido completado',
          text: 'Todas las partes han sido pagadas. ¿Desea finalizar el pedido?',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, finalizar',
          cancelButtonText: 'No, continuar'
        }).then((result) => {
          if (result.isConfirmed && this.order) {
            // Marcar todos los ítems como pagados
            this.order.items.forEach(item => {
              item.status = 'Listos para servir';
            });

            this.finalizeOrder(this.order.id);
          }
        });
      }
    } else {
      // Modo por items
      // Si no hay ítems sin asignar y todos los ítems asignados están pagados
      const allAssigned = this.unassignedItems.length === 0;

      if (allAssigned) {
        // Verificar si todos los ítems están pagados
        const allPaid = this.order.items.every(item => item.status === 'Listos para servir');

        if (allPaid) {
          // Preguntar si desea finalizar el pedido
          Swal.fire({
            title: 'Pedido completado',
            text: 'Todos los ítems han sido pagados. ¿Desea finalizar el pedido?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, finalizar',
            cancelButtonText: 'No, continuar'
          }).then((result) => {
            if (result.isConfirmed && this.order) {
              this.finalizeOrder(this.order.id);
            }
          });
        }
      }
    }
  }

  finalizeSplitBill() {
    if (!this.order) return;

    // Verificar si hay ítems sin asignar
    if (this.unassignedItems.length > 0) {
      Swal.fire({
        title: 'Ítems sin asignar',
        text: 'Hay ítems que no han sido asignados a ninguna persona. ¿Desea continuar y cobrarlos todos juntos?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cobrar todo',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (result.isConfirmed) {
          // Marcar todos los ítems como pagados
          this.markAllItemsAsPaid();
        }
      });
    } else {
      // Verificar si todos los ítems están pagados
      const allPaid = this.isAllItemsPaid();

      if (allPaid) {
        this.finalizeOrder(this.order.id);
      } else {
        Swal.fire({
          title: 'Ítems sin pagar',
          text: 'Hay ítems que han sido asignados pero no han sido pagados. ¿Desea continuar y marcarlos como pagados?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, marcar como pagados',
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            // Marcar todos los ítems como pagados
            this.markAllItemsAsPaid();
          }
        });
      }
    }
  }

  // Nuevo método para verificar si todos los ítems han sido pagados
  private isAllItemsPaid(): boolean {
    // Verificar si hay ítems en alguna parte sin pagar
    const hasUnpaidItems = this.splitParts.some(part => part.items.length > 0);

    // Si no hay items sin pagar en las partes y no hay items sin asignar, todos están pagados
    return !hasUnpaidItems && this.unassignedItems.length === 0;
  }

  // Nuevo método para marcar todos los ítems restantes como pagados
  private markAllItemsAsPaid(): void {
    if (!this.order) return;

    // Marcar todos los ítems como "Servido" (pagados)
    this.order.items.forEach(item => {
      item.status = 'Servido';
    });

    // Actualizar en Firestore
    this.updateOrderItems();

    // Finalizar el pedido
    this.finalizeOrder(this.order.id);
  }

  // Cancelar la división de cuenta
  cancelSplitBill() {
    this.isSplittingBill = false;
    this.splitParts = [];
    this.unassignedItems = [];
  }

  // Volver a la página anterior
  goBack() {
    this.router.navigate(['/']);
  }

  // Métodos para atajos de monto recibido
  setQuickAmount(amount: number) {
    if (!this.order) return;
    this.amountReceived = amount;
    this.calculateChange();
  }
}