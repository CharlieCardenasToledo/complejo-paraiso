import { Component, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CashRegisterService, CashRegister, DenominationDetail } from '../../services/cash-register.service';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';
import { Observable, Subscription } from 'rxjs';

@Component({
    selector: 'app-cash-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './cash-register.component.html',
    styleUrls: ['./cash-register.component.scss']
})
export class CashRegisterComponent implements OnInit, OnDestroy {
  openForm: FormGroup;
  transactionForm: FormGroup;

  currentRegister: CashRegister | null = null;
  isRegisterOpen = false;
  loading = true;

  // Control para expander de apertura de caja
  showOpenForm = false;

  // Historial
  loadingHistory = false;
  closedRegisters: CashRegister[] = [];
  selectedRegister: CashRegister | null = null;
  // Añade esto a tus definiciones de propiedades en la clase
  registerStats = {
    payments: 0,
    expenses: 0,
    incomes: 0,
    refunds: 0,
    paymentMethods: {
      efectivo: 0,
      transferencia: 0,
      ahorita: 0,
      deUna: 0,
      otros: 0
    }
  };

  // Referencia a Math para poder usarlo en la plantilla
  Math = Math;

  // Denominaciones en dólares de Ecuador
  denominaciones: { valor: number, tipo: 'bill' | 'coin', etiqueta: string }[] = [
    { valor: 100, tipo: 'bill', etiqueta: '$100' },
    { valor: 50, tipo: 'bill', etiqueta: '$50' },
    { valor: 20, tipo: 'bill', etiqueta: '$20' },
    { valor: 10, tipo: 'bill', etiqueta: '$10' },
    { valor: 5, tipo: 'bill', etiqueta: '$5' },
    { valor: 1, tipo: 'bill', etiqueta: '$1' },
    { valor: 0.50, tipo: 'coin', etiqueta: '50¢' },
    { valor: 0.25, tipo: 'coin', etiqueta: '25¢' },
    { valor: 0.10, tipo: 'coin', etiqueta: '10¢' },
    { valor: 0.05, tipo: 'coin', etiqueta: '5¢' },
    { valor: 0.01, tipo: 'coin', etiqueta: '1¢' }
  ];

  // Detalles para la apertura
  detallesApertura: DenominationDetail[] = [];
  totalApertura = 0;

  isSyncing = false;
  private syncSub: Subscription | null = null;

  constructor(
    private fb: FormBuilder,
    private cashRegisterService: CashRegisterService,
  ) {
    this.openForm = this.fb.group({
      initialAmount: [0, [Validators.required, Validators.min(0)]],
      notes: ['']
    });

    this.transactionForm = this.fb.group({
      type: ['income', Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
      description: ['', Validators.required]
    });

    // Inicializar detalles de apertura
    this.initializeDenominationDetails();

    // Crear un efecto que responda a cambios en el signal de transacciones
    effect(() => {
      // Leer el valor del signal para establecer la dependencia
      this.cashRegisterService.transactionOccurred();

      // Solo actualizar si la caja está abierta y no estamos en carga inicial
      if (this.isRegisterOpen && !this.loading) {
        this.refreshRegisterData();
      }
    });
  }

  ngOnInit() {
    this.checkRegisterStatus();
    this.loadHistoryData(); // Cargar historial al iniciar
  }

  // Método para alternar la visibilidad del formulario de apertura
  toggleOpenForm() {
    this.showOpenForm = !this.showOpenForm;
  }
  syncOrdersWithCashRegister(): void {
    if (this.isSyncing) return;

    // Confirmar antes de iniciar la sincronización
    Swal.fire({
      title: '¿Sincronizar órdenes?',
      text: 'Esta acción verificará las órdenes pagadas que no han sido registradas en caja y las añadirá como transacciones.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, sincronizar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.isSyncing = true;

        // Mostrar indicador de carga
        Swal.fire({
          title: 'Sincronizando',
          text: 'Procesando órdenes pendientes...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // Llamar al servicio para sincronizar
        this.syncSub = this.cashRegisterService.syncOrdersWithTransactions().subscribe({
          next: (success) => {
            this.isSyncing = false;
            Swal.close();

            if (success) {
              Swal.fire({
                icon: 'success',
                title: 'Sincronización completada',
                text: 'Las órdenes han sido sincronizadas correctamente con la caja.',
                confirmButtonText: 'Entendido'
              }).then(() => {
                // Actualizar datos después de la sincronización
                this.refreshRegisterData();
              });
            } else {
              Swal.fire({
                icon: 'warning',
                title: 'Sincronización parcial',
                text: 'Algunas órdenes no pudieron ser sincronizadas. Intente nuevamente más tarde.',
                confirmButtonText: 'Entendido'
              });
            }
          },
          error: (error) => {
            this.isSyncing = false;
            console.error('Error durante la sincronización:', error);
            Swal.fire({
              icon: 'error',
              title: 'Error de sincronización',
              text: 'No se pudieron sincronizar las órdenes con la caja.',
              confirmButtonText: 'Entendido'
            });
          }
        });
      }
    });
  }

  ngOnDestroy() {
    // Limpiar suscripciones
    if (this.syncSub) {
      this.syncSub.unsubscribe();
    }

    // Otras limpiezas existentes
    // ...
  }
  // Inicializa los detalles de denominaciones para la apertura de caja
  initializeDenominationDetails() {
    this.detallesApertura = this.denominaciones.map(denom => ({
      denomination: denom.valor,
      type: denom.tipo,
      count: 0,
      subtotal: 0
    }));
  }

  // Verifica si hay una caja abierta
  checkRegisterStatus() {
    this.loading = true;
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        this.currentRegister = register;
        this.isRegisterOpen = !!register;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error al verificar estado de caja:', error);
        this.loading = false;
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo verificar el estado de la caja. Por favor, verifica tus permisos o contacta al administrador.'
        });
      }
    });
  }

  // Método para refrescar los datos sin mostrar indicadores de carga
  refreshRegisterData() {
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        this.currentRegister = register;
        this.isRegisterOpen = !!register;
      },
      error: (error) => {
        console.error('Error al actualizar datos de caja:', error);
      }
    });
  }

  // Actualiza el detalle y total cuando cambia una cantidad
  updateDenominationDetail(index: number, count: number) {
    if (count < 0) count = 0;

    // Convertir a número entero para evitar problemas con la entrada
    count = parseInt(count.toString(), 10) || 0;

    this.detallesApertura[index].count = count;

    // Calcular el subtotal con precisión
    const subtotal = this.calculateSubtotal(
      this.detallesApertura[index].denomination,
      this.detallesApertura[index].count
    );

    this.detallesApertura[index].subtotal = subtotal;

    // Recalcular total
    this.calculateTotal();

    // Actualizar el formulario
    this.openForm.patchValue({ initialAmount: this.totalApertura });
  }

  // Calcula el subtotal para una denominación con precisión
  calculateSubtotal(denomination: number, count: number): number {
    // Usar toFixed(2) para manejar correctamente los centavos
    return parseFloat((denomination * count).toFixed(2));
  }

  // Calcula el total de apertura
  calculateTotal() {
    this.totalApertura = this.detallesApertura.reduce((sum, detail) => {
      return sum + detail.subtotal;
    }, 0);

    // Asegurar que el total tenga solo 2 decimales
    this.totalApertura = parseFloat(this.totalApertura.toFixed(2));
  }

  // Formatea montos para mostrar con 2 decimales
  formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  // Abre la caja registradora
  openCashRegister() {
    if (this.openForm.invalid || this.totalApertura <= 0) {
      return;
    }

    // Garantizar que los detalles de apertura están correctos
    this.detallesApertura.forEach(detail => {
      // Asegurar que los subtotales son correctos antes de enviar
      detail.subtotal = this.calculateSubtotal(detail.denomination, detail.count);
    });

    const registerData: Partial<CashRegister> = {
      initialAmount: this.totalApertura,
      details: this.detallesApertura,
      openedAt: new Date(),
      status: 'open',
      openedBy: this.cashRegisterService['getUserInfo'](), // Usar método interno del servicio
      notes: this.openForm.value.notes
    };

    this.loading = true;

    this.cashRegisterService.openCashRegister(registerData).subscribe({
      next: (registerId) => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: '¡Caja abierta!',
          text: `La caja ha sido abierta exitosamente. ID: ${registerId}`,
          confirmButtonText: 'Continuar'
        }).then(() => {
          this.checkRegisterStatus();
        });
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al abrir caja:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo abrir la caja. Verifica tus permisos o contacta al administrador.'
        });
      }
    });
  }

  // Registra una transacción
  registerTransaction() {
    if (this.transactionForm.invalid) {
      return;
    }

    const formData = this.transactionForm.value;
    const amount = parseFloat(formData.amount);

    // Verificar monto
    if (isNaN(amount) || amount <= 0) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Por favor ingresa un monto válido mayor a cero'
      });
      return;
    }

    // Preparar datos según el tipo de transacción
    let transactionData: any = {
      description: formData.description
    };

    switch (formData.type) {
      case 'income':
        transactionData.amount = parseFloat(amount.toFixed(2));
        break;
      case 'expense':
        transactionData.amount = parseFloat((-amount).toFixed(2)); // Monto negativo para gastos
        break;
      default:
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Tipo de transacción no válido'
        });
        return;
    }

    this.loading = true;

    // Registrar la transacción en el servicio
    this.cashRegisterService.registerTransaction(transactionData).subscribe({
      next: (success) => {
        this.loading = false;
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Transacción registrada',
            text: `La transacción se ha registrado exitosamente`
          });

          // Limpiar formulario y actualizar datos
          this.transactionForm.reset({
            type: 'income',
            amount: 0,
            description: ''
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo registrar la transacción'
          });
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al registrar transacción:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar la transacción'
        });
      }
    });
  }

  // Cierra la caja registradora
  closeCashRegister() {
    // Confirmación antes de cerrar
    Swal.fire({
      title: '¿Cerrar caja?',
      text: 'Una vez cerrada la caja no podrás hacer más transacciones',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar caja',
      cancelButtonText: 'No, cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.showClosingFormDialog();
      }
    });
  }

  // Muestra el formulario para el cierre de caja
  // Muestra el formulario simplificado para el cierre de caja
  showClosingFormDialog() {
    if (!this.currentRegister) return;

    // Asegurarse de tener los datos más recientes antes de mostrar el diálogo de cierre
    this.refreshRegisterData();

    // Construir HTML para el formulario simplificado
    let formHTML = `
  <div class="text-left">
    <h3 class="text-lg font-medium mb-3">Cierre de Caja</h3>
    <p class="text-sm text-gray-500 mb-4">Ingresa el monto final contado en caja</p>
    
    <div class="mb-4">
      <label class="block text-sm font-medium mb-2">Monto Final ($)</label>
      <input type="number" id="final-amount" class="w-full border rounded p-2" min="0" step="0.01" value="${this.currentRegister.currentAmount.toFixed(2)}">
    </div>
    
    <div class="mt-4 mb-2">
      <label class="block text-sm font-medium">Notas (opcional)</label>
      <textarea id="closing-notes" class="w-full border rounded p-2 text-sm" rows="2"></textarea>
    </div>
  </div>
  `;

    // Mostrar el diálogo
    Swal.fire({
      title: 'Cerrar Caja',
      html: formHTML,
      showCancelButton: true,
      confirmButtonText: 'Cerrar Caja',
      cancelButtonText: 'Cancelar',
      showLoaderOnConfirm: true,
      preConfirm: () => {
        // Recolectar datos del formulario simplificado
        const finalAmount = parseFloat((document.getElementById('final-amount') as HTMLInputElement).value) || 0;
        const notes = (document.getElementById('closing-notes') as HTMLTextAreaElement).value;

        // Como ya no recolectamos detalles de denominaciones, creamos un array vacío
        const details: DenominationDetail[] = [];

        // Datos para el cierre
        return {
          finalAmount: finalAmount,
          details: details,
          notes: notes
        };
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        const closeData = result.value;

        // Actualizar diferencia y mostrar
        const expectedAmount = this.currentRegister!.currentAmount;
        const difference = closeData.finalAmount - expectedAmount;

        // Confirmar el cierre con la diferencia calculada
        Swal.fire({
          title: 'Confirmar Cierre',
          html: `
        <div class="text-left">
          <p><strong>Monto esperado:</strong> $${expectedAmount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p><strong>Monto contado:</strong> $${closeData.finalAmount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p><strong>Diferencia:</strong> $${difference.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      `,
          icon: difference === 0 ? 'success' : (difference < 0 ? 'error' : 'warning'),
          showCancelButton: true,
          confirmButtonText: 'Confirmar Cierre',
          cancelButtonText: 'Cancelar'
        }).then((confirmResult) => {
          if (confirmResult.isConfirmed) {
            this.loading = true;

            // Realizar cierre en el servicio
            this.cashRegisterService.closeCashRegister(closeData).subscribe({
              next: (success) => {
                this.loading = false;
                if (success) {
                  Swal.fire({
                    icon: 'success',
                    title: 'Caja Cerrada',
                    text: 'La caja ha sido cerrada exitosamente'
                  }).then(() => {
                    this.checkRegisterStatus();
                    this.loadHistoryData(); // Actualizar historial después del cierre
                  });
                } else {
                  Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo cerrar la caja'
                  });
                }
              },
              error: (error) => {
                this.loading = false;
                console.error('Error al cerrar caja:', error);
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text: 'Ocurrió un error al cerrar la caja'
                });
              }
            });
          }
        });
      }
    });
  }
  // Método para cargar los datos del historial
  loadHistoryData() {
    this.loadingHistory = true;
    this.selectedRegister = null;

    // Obtener historial de cajas
    this.cashRegisterService.getCashRegisterHistory(20).subscribe({
      next: (registers) => {
        this.loadingHistory = false;

        // Filtrar solo las cajas cerradas
        this.closedRegisters = registers.filter(reg => reg.status === 'closed');

        // Ordenar por fecha de cierre (más reciente primero)
        this.closedRegisters.sort((a, b) => {
          const dateA = a.closedAt ? new Date(a.closedAt).getTime() : 0;
          const dateB = b.closedAt ? new Date(b.closedAt).getTime() : 0;
          return dateB - dateA;
        });

        if (this.closedRegisters.length === 0) {
          console.log('No se encontraron registros de cierres de caja');
        } else {
          console.log(`Se cargaron ${this.closedRegisters.length} registros de cierres de caja`);
        }
      },
      error: (error) => {
        this.loadingHistory = false;
        console.error('Error al obtener historial de cierres:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo cargar el historial de cierres de caja'
        });
      }
    });
  }

  // Muestra el historial de transacciones
  showTransactions() {
    // Asegurarse de tener los datos más recientes antes de mostrar las transacciones
    this.loading = true;

    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        this.loading = false;
        this.currentRegister = register;

        if (!this.currentRegister || !this.currentRegister.transactions) {
          Swal.fire({
            icon: 'info',
            title: 'Sin transacciones',
            text: 'No hay transacciones para mostrar'
          });
          return;
        }

        const transactions = this.currentRegister.transactions;

        // Construir tabla HTML para las transacciones
        let tableHTML = `
          <div class="max-h-96 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-100">
                  <th class="p-2 text-left">Tipo</th>
                  <th class="p-2 text-right">Monto</th>
                  <th class="p-2 text-left">Descripción</th>
                  <th class="p-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
        `;

        // Si no hay transacciones
        if (transactions.length === 0) {
          tableHTML += `
            <tr>
              <td colspan="4" class="p-2 text-center">No hay transacciones registradas</td>
            </tr>
          `;
        }

        // Agregar cada transacción
        // Agregar cada transacción
        transactions.forEach(trans => {
          // Determinar color según tipo
          let typeClass = '';
          let typeLabel = '';

          switch (trans.type) {
            case 'income':
              typeClass = 'text-green-600';
              typeLabel = 'Ingreso';
              break;
            case 'expense':
              typeClass = 'text-red-600';
              typeLabel = 'Gasto';
              break;
            case 'payment':
              typeClass = 'text-blue-600';
              typeLabel = 'Pago';
              break;
            case 'refund':
              typeClass = 'text-orange-600';
              typeLabel = 'Reembolso';
              break;
          }

          // Formatear fecha usando la función existente para manejar correctamente los Timestamps
          const fecha = this.getFormattedDateTime(trans.timestamp);

          tableHTML += `
    <tr class="border-b">
      <td class="p-2 ${typeClass}">${typeLabel}</td>
      <td class="p-2 text-right ${trans.amount >= 0 ? 'text-green-600' : 'text-red-600'}">
        $${Math.abs(trans.amount).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td class="p-2">${trans.description}</td>
      <td class="p-2 text-xs">${fecha}</td>
    </tr>
  `;
        });
        tableHTML += `
              </tbody>
            </table>
          </div>
        `;

        // Mostrar el diálogo con las transacciones
        Swal.fire({
          title: 'Transacciones',
          html: tableHTML,
          width: '800px',
          confirmButtonText: 'Cerrar'
        });
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al obtener transacciones:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudieron cargar las transacciones'
        });
      }
    });
  }

  // Verifica si todas las cantidades son válidas
  validateAllDenominations(): boolean {
    return this.detallesApertura.every(detail => {
      return detail.count >= 0 && Number.isInteger(detail.count);
    });
  }

  // Muestra diálogo para registrar ingreso o gasto
  showTransactionDialog() {
    // Asegurarse de tener los datos más recientes
    this.refreshRegisterData();

    // Definir opciones de tipo de transacción
    const options = [
      { value: 'income', label: 'Ingreso' },
      { value: 'expense', label: 'Gasto' }
    ];

    // Construir HTML del formulario
    let formHTML = `
    <form id="transaction-form" class="text-left">
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">Tipo de transacción</label>
        <select id="transaction-type" class="w-full border rounded p-2">
          ${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
        </select>
      </div>
      
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">Monto ($)</label>
        <input type="number" id="transaction-amount" class="w-full border rounded p-2" min="0" step="0.01" placeholder="0">
      </div>
      
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">Descripción</label>
        <textarea id="transaction-description" class="w-full border rounded p-2" rows="2" placeholder="Motivo de la transacción"></textarea>
      </div>
    </form>
  `;

    // Mostrar el diálogo
    Swal.fire({
      title: 'Registrar Movimiento',
      html: formHTML,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        // Obtener valores del formulario
        const type = (document.getElementById('transaction-type') as HTMLSelectElement).value;
        const amountStr = (document.getElementById('transaction-amount') as HTMLInputElement).value;
        const description = (document.getElementById('transaction-description') as HTMLTextAreaElement).value;

        // Validar datos
        if (!description.trim()) {
          Swal.showValidationMessage('Debe ingresar una descripción');
          return false;
        }

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          Swal.showValidationMessage('Debe ingresar un monto válido mayor a cero');
          return false;
        }

        // Devolver datos validados
        return { type, amount, description };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const formData = result.value as any;

        // Llamar al método según el tipo de transacción
        if (formData.type === 'income') {
          this.registerIncome(formData.amount, formData.description);
        } else if (formData.type === 'expense') {
          this.registerExpense(formData.amount, formData.description);
        }
      }
    });
  }
  // Registrar gasto en caja
  registerExpense(amount: number, description: string) {
    this.loading = true;

    this.cashRegisterService.registerExpense({ amount, description }).subscribe({
      next: (success) => {
        this.loading = false;
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Gasto registrado',
            text: 'El gasto se ha registrado exitosamente'
          }).then(() => {
            this.checkRegisterStatus();
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo registrar el gasto'
          });
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al registrar gasto:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar el gasto'
        });
      }
    });
  }

  // Método para ver detalles de un registro específico
  viewRegisterDetails(registerId: string) {
    this.loadingHistory = true;

    this.cashRegisterService.getCashRegisterById(registerId).subscribe({
      next: (register) => {
        this.loadingHistory = false;

        if (!register) {
          Swal.fire({
            icon: 'error',
            title: 'No encontrado',
            text: 'No se pudo encontrar la información de este cierre de caja'
          });
          return;
        }

        console.log('Tipo de closedAt:', typeof register.closedAt);
        console.log('Valor de closedAt:', register.closedAt);

        this.selectedRegister = register;
        // Calcular estadísticas de transacciones
        this.registerStats = this.calculateRegisterStats(register);
      },
      error: (error) => {
        this.loadingHistory = false;
        console.error('Error al obtener detalles del cierre:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudieron cargar los detalles de este cierre de caja'
        });
      }
    });
  }
  // Registrar ingreso en caja
  registerIncome(amount: number, description: string) {
    this.loading = true;

    this.cashRegisterService.registerIncome({ amount, description }).subscribe({
      next: (success) => {
        this.loading = false;
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Ingreso registrado',
            text: 'El ingreso se ha registrado exitosamente'
          }).then(() => {
            this.checkRegisterStatus();
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo registrar el ingreso'
          });
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al registrar ingreso:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar el ingreso'
        });
      }
    });
  }

  // Método auxiliar para calcular estadísticas de un registro de caja
  private calculateRegisterStats(register: CashRegister) {
    let payments = 0;
    let expenses = 0;
    let incomes = 0;
    let refunds = 0;

    // Contadores por método de pago
    let efectivo = 0;
    let transferencia = 0;
    let ahorita = 0;
    let deUna = 0;
    let otros = 0;

    (register.transactions || []).forEach(trans => {
      switch (trans.type) {
        case 'payment':
          payments += trans.amount;

          // Sumar según el método de pago (case insensitive)
          const method = (trans.paymentMethod || '').toLowerCase();
          if (method === 'efectivo') {
            efectivo += trans.amount;
          } else if (method === 'transferencia') {
            transferencia += trans.amount;
          } else if (method === 'ahorita') {
            ahorita += trans.amount;
          } else if (method === 'de una') {
            deUna += trans.amount;
          } else {
            otros += trans.amount;
          }
          break;
        case 'expense':
          expenses += Math.abs(trans.amount);
          break;
        case 'income':
          incomes += trans.amount;
          break;
        case 'refund':
          refunds += Math.abs(trans.amount);
          break;
      }
    });

    return {
      payments,
      expenses,
      incomes,
      refunds,
      paymentMethods: {
        efectivo,
        transferencia,
        ahorita,
        deUna,
        otros
      }
    };
  }

  // Método para volver a la lista de cierres
  backToHistoryList() {
    this.selectedRegister = null;
  }

  // Helpers para formatear fechas
  getFormattedDate(dateInput: any): string {
    if (!dateInput) return '-';

    try {
      let date: Date;

      // Verificar si es un objeto Timestamp de Firestore
      if (dateInput && dateInput.toDate && typeof dateInput.toDate === 'function') {
        // Es un Timestamp de Firestore
        date = dateInput.toDate();
      } else if (dateInput.seconds !== undefined && dateInput.nanoseconds !== undefined) {
        // Es un objeto que parece un Timestamp
        date = new Date(dateInput.seconds * 1000);
      } else {
        // Intentar con un objeto Date o string normal
        date = new Date(dateInput);
      }

      // Verificar si la fecha es válida
      if (isNaN(date.getTime())) {
        console.log('Fecha inválida detectada:', dateInput);
        return '-';
      }

      // Formatear la fecha
      return date.toLocaleDateString('es-EC');
    } catch (error) {
      console.error('Error al formatear fecha:', error, dateInput);
      return '-';
    }
  }
  getFormattedDateTime(dateInput: any): string {
    if (!dateInput) return '-';

    try {
      let date: Date;

      // Verificar si es un objeto Timestamp de Firestore
      if (dateInput && dateInput.toDate && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
      } else if (dateInput.seconds !== undefined && dateInput.nanoseconds !== undefined) {
        date = new Date(dateInput.seconds * 1000);
      } else {
        date = new Date(dateInput);
      }

      if (isNaN(date.getTime())) {
        console.log('Fecha inválida detectada:', dateInput);
        return '-';
      }

      return date.toLocaleString('es-EC');
    } catch (error) {
      console.error('Error al formatear fecha y hora:', error, dateInput);
      return '-';
    }
  }

  getFormattedTime(dateInput: any): string {
    if (!dateInput) return '-';

    try {
      let date: Date;

      // Verificar si es un objeto Timestamp de Firestore
      if (dateInput && dateInput.toDate && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
      } else if (dateInput.seconds !== undefined && dateInput.nanoseconds !== undefined) {
        date = new Date(dateInput.seconds * 1000);
      } else {
        date = new Date(dateInput);
      }

      if (isNaN(date.getTime())) {
        console.log('Fecha inválida detectada:', dateInput);
        return '-';
      }

      return date.toLocaleTimeString('es-EC');
    } catch (error) {
      console.error('Error al formatear hora:', error, dateInput);
      return '-';
    }
  }
  // Helpers para estilos y etiquetas de transacciones
  getTransactionTypeClass(type: string): string {
    switch (type) {
      case 'income': return 'text-green-600';
      case 'expense': return 'text-red-600';
      case 'payment': return 'text-blue-600';
      case 'refund': return 'text-orange-600';
      default: return '';
    }
  }

  getTransactionTypeLabel(type: string): string {
    switch (type) {
      case 'income': return 'Ingreso';
      case 'expense': return 'Gasto';
      case 'payment': return 'Pago';
      case 'refund': return 'Reembolso';
      default: return type;
    }
  }  // Mostrar el resumen de caja actual
  showSummary() {
    // Asegurarse de tener los datos más recientes antes de mostrar el resumen
    this.loading = true;

    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        this.currentRegister = register;

        // Ahora obtener el resumen
        this.cashRegisterService.getCurrentSummary().subscribe({
          next: (summary) => {
            this.loading = false;

            // Construir HTML del resumen
            const summaryHTML = `
            <div class="text-left">
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="bg-gray-50 p-3 rounded">
                  <p class="text-sm text-gray-500">Monto Inicial</p>
                  <p class="text-xl font-semibold">$${summary.initialAmount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded">
                  <p class="text-sm text-gray-500">Monto Actual</p>
                  <p class="text-xl font-semibold">$${summary.currentAmount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              
              <div class="mb-4">
                <h3 class="font-medium mb-2">Detalle de Transacciones</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Pagos Recibidos</p>
                    <p class="text-lg font-medium text-green-600">$${summary.totalPayments.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Ingresos Adicionales</p>
                    <p class="text-lg font-medium text-green-600">$${summary.totalIncomes.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Gastos</p>
                    <p class="text-lg font-medium text-red-600">$${summary.totalExpenses.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Reembolsos</p>
                    <p class="text-lg font-medium text-orange-600">$${summary.totalRefunds.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
              
              <div class="mb-4">
                <h3 class="font-medium mb-2">Métodos de Pago</h3>
                <div class="grid grid-cols-2 gap-3">
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Efectivo</p>
                    <p class="text-lg font-medium text-blue-600">$${summary.paymentMethods.efectivo.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Transferencia</p>
                    <p class="text-lg font-medium text-blue-600">$${summary.paymentMethods.transferencia.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">Ahorita</p>
                    <p class="text-lg font-medium text-blue-600">$${summary.paymentMethods.ahorita.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div class="border p-2 rounded">
                    <p class="text-sm text-gray-500">De Una</p>
                    <p class="text-lg font-medium text-blue-600">$${summary.paymentMethods.deUna.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-3">
                <div class="flex justify-between">
                  <span class="font-medium">Balance Total:</span>
                  <span class="text-xl font-bold">$${summary.currentAmount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          `;

            Swal.fire({
              title: 'Resumen de Caja',
              html: summaryHTML,
              width: '800px',
              confirmButtonText: 'Cerrar'
            });
          },
          error: (error) => {
            this.loading = false;
            console.error('Error al obtener resumen:', error);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'No se pudo cargar el resumen de caja'
            });
          }
        });
      },
      error: (error) => {
        this.loading = false;
        console.error('Error al obtener datos de caja:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo acceder a los datos de la caja'
        });
      }
    });
  }
}
