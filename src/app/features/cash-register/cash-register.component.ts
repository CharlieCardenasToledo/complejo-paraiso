import { Component, OnInit, OnDestroy, effect, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { Observable, Subscription } from 'rxjs';
import { FormatDateSpanishPipe } from '../../core/shared/pipes/format-date-spanish.pipe';
import { CashRegister, CashRegisterService, DenominationDetail } from '../../core/services/cash-register.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-cash-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './cash-register.component.html',
    styleUrls: ['./cash-register.component.scss']
})
export class CashRegisterComponent implements OnInit, OnDestroy {
  // Inyección moderna con inject()
  private fb = inject(FormBuilder);
  public cashRegisterService = inject(CashRegisterService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Formularios
  openForm: FormGroup;
  transactionForm: FormGroup;

  // Estados reactivos con signals
  private _showOpenForm = signal(false);
  private _loadingHistory = signal(false);
  private _selectedRegister = signal<CashRegister | null>(null);
  private _isSyncing = signal(false);
  private _openRegisters = signal<CashRegister[]>([]);
  private _closedRegisters = signal<CashRegister[]>([]);

  // Estados computados
  readonly showOpenForm = this._showOpenForm.asReadonly();
  readonly loadingHistory = this._loadingHistory.asReadonly();
  readonly selectedRegister = this._selectedRegister.asReadonly();
  readonly isSyncing = this._isSyncing.asReadonly();
  readonly openRegisters = this._openRegisters.asReadonly();
  readonly closedRegisters = this._closedRegisters.asReadonly();

  // Estados derivados del servicio con lógica de loading inteligente
  readonly currentRegister = computed(() => {
    try {
      return this.cashRegisterService.currentRegister();
    } catch (error) {
      console.error('❌ Error getting currentRegister:', error);
      return null;
    }
  });
  
  readonly isRegisterOpen = computed(() => {
    try {
      return this.cashRegisterService.isRegisterOpen();
    } catch (error) {
      console.error('❌ Error getting isRegisterOpen:', error);
      return false;
    }
  });
  
  // Estado de loading forzado (para casos donde el servicio se queda en loading infinito)
  private _forceNoLoading = signal(false);
  
  // Loading inteligente: si ya hay datos, no mostrar loading
  readonly loading = computed(() => {
    try {
      // Si forzamos no loading, respetar eso
      if (this._forceNoLoading()) {
        return false;
      }
      
      const serviceLoading = this.cashRegisterService.isLoading();
      const hasRegisterData = !!this.currentRegister();
      
      // Si el servicio está cargando pero ya tenemos datos, no mostrar loading
      if (serviceLoading && hasRegisterData) {
        console.log('⚡ Service loading but we have data, not showing loading screen');
        return false;
      }
      
      return serviceLoading;
    } catch (error) {
      console.error('❌ Error getting loading state:', error);
      return false;
    }
  });

  // Estadísticas computadas
  readonly registerStats = computed(() => {
    const register = this._selectedRegister();
    if (!register) {
      return {
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
    }
    return this.calculateRegisterStats(register);
  });

  // Denominaciones y detalles de apertura
  readonly denominaciones: { valor: number, tipo: 'bill' | 'coin', etiqueta: string }[] = [
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

  // Referencia a Math para poder usarlo en la plantilla
  Math = Math;

  private syncSub: Subscription | null = null;

  constructor() {
    // Inicializar formularios
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

    // Effect para actualizar datos cuando hay una transacción
    effect(() => {
      // Leer el valor del signal para establecer la dependencia
      this.cashRegisterService.transactionOccurred();

      // Solo actualizar si la caja está abierta y no estamos en carga inicial
      if (this.isRegisterOpen() && !this.loading()) {
        this.refreshRegisterData();
      }
    });

    // Effect para debug - remover en producción
    effect(() => {
      console.log('🔍 Debug Signals State:', {
        loading: this.loading(),
        isRegisterOpen: this.isRegisterOpen(),
        currentRegister: this.currentRegister(),
        serviceLoading: this.cashRegisterService.isLoading(),
        serviceRegisterOpen: this.cashRegisterService.isRegisterOpen()
      });
    });

    // Timeout de seguridad para evitar loading infinito
    setTimeout(() => {
      if (this.cashRegisterService.isLoading() && this.currentRegister()) {
        console.log('⏰ Auto-stopping loading after 10 seconds with data present');
        this._forceNoLoading.set(true);
      }
    }, 10000); // 10 segundos
  }

  ngOnInit() {
    this.loadHistoryData();
  }

  ngOnDestroy() {
    if (this.syncSub) {
      this.syncSub.unsubscribe();
    }
  }

  // ========== MÉTODOS ACTUALIZADOS CON SIGNALS ==========

  /**
   * Alternar visibilidad del formulario de apertura
   */
  toggleOpenForm(): void {
    this._showOpenForm.update(current => !current);
  }

  /**
   * Sincronización mejorada con estado reactivo
   */
  syncOrdersWithCashRegister(): void {
    // Prevenir múltiples sincronizaciones
    if (this._isSyncing()) return;

    Swal.fire({
      title: '¿Sincronizar órdenes?',
      text: 'Esta acción verificará las órdenes pagadas que no han sido registradas en caja y las añadirá como transacciones.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, sincronizar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this._performSync();
      }
    });
  }

  /**
   * Método privado para ejecutar la sincronización
   */
  private _performSync(): void {
    this._isSyncing.set(true);

    // Mostrar indicador de carga
    Swal.fire({
      title: 'Sincronizando',
      text: 'Procesando órdenes pendientes...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.syncSub = this.cashRegisterService.syncOrdersWithTransactions().subscribe({
      next: (success) => {
        this._handleSyncResult(success);
      },
      error: (error) => {
        this._handleSyncError(error);
      }
    });
  }

  /**
   * Manejo del resultado de sincronización
   */
  private _handleSyncResult(success: boolean): void {
    this._isSyncing.set(false);
    Swal.close();

    if (success) {
      Swal.fire({
        icon: 'success',
        title: 'Sincronización completada',
        text: 'Las órdenes han sido sincronizadas correctamente con la caja.',
        confirmButtonText: 'Entendido'
      }).then(() => {
        this.cashRegisterService.loadCurrentCashRegister();
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Sincronización parcial',
        text: 'Algunas órdenes no pudieron ser sincronizadas. Intente nuevamente más tarde.',
        confirmButtonText: 'Entendido'
      });
    }
  }

  /**
   * Manejo de errores de sincronización
   */
  private _handleSyncError(error: any): void {
    this._isSyncing.set(false);
    console.error('Error durante la sincronización:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudieron sincronizar las órdenes con la caja.',
      confirmButtonText: 'Entendido'
    });
  }

  /**
   * Cargar datos del historial con estado reactivo
   */
  loadCashRegisters(): void {
    this._loadingHistory.set(true);
    this._selectedRegister.set(null);

    this.cashRegisterService.getCashRegisterHistory('all', 20).subscribe({
      next: (registers) => {
        this._updateRegistersData(registers);
      },
      error: (error) => {
        this._handleHistoryError(error);
      },
      complete: () => {
        this._loadingHistory.set(false);
      }
    });
  }

  /**
   * Actualizar datos de registros
   */
  private _updateRegistersData(registers: CashRegister[]): void {
    const openRegs = registers.filter(r => r.status === 'open');
    const closedRegs = registers.filter(r => r.status === 'closed');

    // Ordenar por fecha de apertura
    openRegs.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
    closedRegs.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

    this._openRegisters.set(openRegs);
    this._closedRegisters.set(closedRegs);
  }

  /**
   * Manejo de errores del historial
   */
  private _handleHistoryError(error: any): void {
    console.error('Error al obtener historial de cajas:', error);
    this._loadingHistory.set(false);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo cargar el historial de cajas'
    });
  }

  /**
   * Cargar historial simplificado
   */
  loadHistoryData(): void {
    this.loadCashRegisters();
  }

  /**
   * Ver detalles de registro con estado reactivo
   */
  viewRegisterDetails(registerId: string): void {
    this._loadingHistory.set(true);

    this.cashRegisterService.getCashRegisterById(registerId).subscribe({
      next: (register) => {
        this._handleRegisterDetailsResult(register);
      },
      error: (error) => {
        this._handleRegisterDetailsError(error);
      }
    });
  }

  /**
   * Manejo del resultado de detalles de registro
   */
  private _handleRegisterDetailsResult(register: CashRegister | null): void {
    this._loadingHistory.set(false);

    if (!register) {
      Swal.fire({
        icon: 'error',
        title: 'No encontrado',
        text: 'No se pudo encontrar la información de este cierre de caja'
      });
      return;
    }

    this._selectedRegister.set(register);
    // Las estadísticas se calculan automáticamente via computed signal
  }

  /**
   * Manejo de errores de detalles de registro
   */
  private _handleRegisterDetailsError(error: any): void {
    this._loadingHistory.set(false);
    console.error('Error al obtener detalles del cierre:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudieron cargar los detalles de este cierre de caja'
    });
  }

  /**
   * Volver a la lista de historial
   */
  backToHistoryList(): void {
    this._selectedRegister.set(null);
  }

  /**
   * Mostrar resumen con datos reactivos
   */
  showSummary(): void {
    // Usar computed para obtener estado de loading
    const isCurrentlyLoading = signal(true);

    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        this.cashRegisterService.getCurrentSummary().subscribe({
          next: (summary) => {
            isCurrentlyLoading.set(false);
            this._displaySummary(summary);
          },
          error: (error) => {
            this._handleSummaryError(error, isCurrentlyLoading);
          }
        });
      },
      error: (error) => {
        this._handleCashRegisterError(error, isCurrentlyLoading);
      }
    });
  }

  /**
   * Mostrar el diálogo de resumen
   */
  private _displaySummary(summary: any): void {
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
  }

  /**
   * Manejo de errores de resumen
   */
  private _handleSummaryError(error: any, loadingSignal: any): void {
    loadingSignal.set(false);
    console.error('Error al obtener resumen:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo cargar el resumen de caja'
    });
  }

  /**
   * Manejo de errores de caja registradora
   */
  private _handleCashRegisterError(error: any, loadingSignal: any): void {
    loadingSignal.set(false);
    console.error('Error al obtener datos de caja:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo acceder a los datos de la caja'
    });
  }

  // ========== MÉTODOS MANTENIDOS (sin cambios significativos) ==========

  initializeDenominationDetails() {
    this.detallesApertura = this.denominaciones.map(denom => ({
      denomination: denom.valor,
      type: denom.tipo,
      count: 0,
      subtotal: 0
    }));
  }

  updateDenominationDetail(index: number, count: number) {
    if (count < 0) count = 0;
    count = parseInt(count.toString(), 10) || 0;

    this.detallesApertura[index].count = count;
    const subtotal = this.calculateSubtotal(
      this.detallesApertura[index].denomination,
      this.detallesApertura[index].count
    );

    this.detallesApertura[index].subtotal = subtotal;
    this.calculateTotal();
    this.openForm.patchValue({ initialAmount: this.totalApertura });
  }

  calculateSubtotal(denomination: number, count: number): number {
    return parseFloat((denomination * count).toFixed(2));
  }

  calculateTotal() {
    this.totalApertura = this.detallesApertura.reduce((sum, detail) => {
      return sum + detail.subtotal;
    }, 0);
    this.totalApertura = parseFloat(this.totalApertura.toFixed(2));
  }

  formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  refreshRegisterData() {
    this.cashRegisterService.loadCurrentCashRegister();
  }

  // MÉTODO CORREGIDO: openCashRegister
  openCashRegister() {
    if (this.openForm.invalid || this.totalApertura <= 0) {
      return;
    }

    this.detallesApertura.forEach(detail => {
      detail.subtotal = this.calculateSubtotal(detail.denomination, detail.count);
    });

    // Get current user data and provide fallbacks for required fields
    const currentUser = this.authService.userData();
    
    // Ensure we have valid user data with required properties
    const openedByUser = {
      uid: currentUser?.uid || '',
      name: currentUser?.name || 'Usuario Desconocido',
      role: currentUser?.role || 'user'
    };

    const registerData: Partial<CashRegister> = {
      initialAmount: this.totalApertura,
      details: this.detallesApertura,
      openedAt: new Date(),
      status: 'open',
      openedBy: openedByUser, // Now this matches the expected type
      notes: this.openForm.value.notes
    };

    // El loading se maneja via computed signal del servicio
    this.cashRegisterService.openCashRegister(registerData).subscribe({
      next: (registerId) => {
        Swal.fire({
          icon: 'success',
          title: '¡Caja abierta!',
          text: `La caja ha sido abierta exitosamente. ID: ${registerId}`,
          confirmButtonText: 'Continuar'
        }).then(() => {
          this.cashRegisterService.loadCurrentCashRegister();
        });
      },
      error: (error) => {
        console.error('Error al abrir caja:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo abrir la caja. Verifica tus permisos o contacta al administrador.'
        });
      }
    });
  }

  registerTransaction() {
    if (this.transactionForm.invalid) {
      return;
    }

    const formData = this.transactionForm.value;
    const amount = parseFloat(formData.amount);

    if (isNaN(amount) || amount <= 0) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Por favor ingresa un monto válido mayor a cero'
      });
      return;
    }

    const transactionData: any = {
      description: formData.description
    };

    switch (formData.type) {
      case 'income':
        transactionData.amount = parseFloat(amount.toFixed(2));
        break;
      case 'expense':
        transactionData.amount = parseFloat((-amount).toFixed(2));
        break;
      default:
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Tipo de transacción no válido'
        });
        return;
    }

    this.cashRegisterService.registerTransaction(transactionData).subscribe({
      next: (success) => {
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Transacción registrada',
            text: `La transacción se ha registrado exitosamente`
          });

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
        console.error('Error al registrar transacción:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar la transacción'
        });
      }
    });
  }

  closeCashRegister() {
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

  showClosingFormDialog() {
    const currentReg = this.currentRegister();
    if (!currentReg) return;

    this.cashRegisterService.loadCurrentCashRegister();

    const formHTML = `
      <div class="text-left">
        <h3 class="text-lg font-medium mb-3">Cierre de Caja</h3>
        <p class="text-sm text-gray-500 mb-4">Ingresa el monto final contado en caja</p>
        
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">Monto Final ($)</label>
          <input type="number" id="swal-final-amount" class="w-full border rounded p-2" min="0" step="0.01" value="${currentReg.currentAmount.toFixed(2)}">
        </div>
        
        <div class="mt-4 mb-2">
          <label class="block text-sm font-medium mb-1">Notas (opcional)</label>
          <textarea id="swal-notes" class="w-full border rounded p-2 text-sm" rows="2"></textarea>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Cerrar Caja',
      html: formHTML,
      showCancelButton: true,
      confirmButtonText: 'Cerrar Caja',
      cancelButtonText: 'Cancelar',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        const finalAmountInput = document.getElementById('swal-final-amount') as HTMLInputElement;
        const notesInput = document.getElementById('swal-notes') as HTMLTextAreaElement;
        const finalAmount = parseFloat(finalAmountInput.value);
        const notes = notesInput.value;

        if (isNaN(finalAmount)) {
          Swal.showValidationMessage('Por favor, ingrese un monto final válido');
          return false;
        }
        return { finalAmount, notes };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { finalAmount, notes } = result.value || {};

        Swal.fire({
          title: 'Cerrando caja...',
          text: 'Por favor, espere',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
          const success = await this.cashRegisterService.closeCashRegister({
            finalAmount,
            details: [], // No se piden detalles de denominación al cierre
            notes
          }).toPromise();

          Swal.close();
          if (success) {
            Swal.fire('¡Caja Cerrada!', 'La caja ha sido cerrada correctamente.', 'success');
            this.cashRegisterService.loadCurrentCashRegister(); // Recargar la caja actual
            this.loadHistoryData(); // Recargar historial
          } else {
            Swal.fire('Error', 'No se pudo cerrar la caja. Intente nuevamente.', 'error');
          }
        } catch (error) {
          console.error('Error al cerrar caja:', error);
          Swal.close();
          Swal.fire('Error', 'Ocurrió un error al cerrar la caja.', 'error');
        }
      }
    });
  }

  showTransactions() {
    this.cashRegisterService.getCurrentCashRegister().subscribe({
      next: (register) => {
        if (!register || !register.transactions) {
          Swal.fire({
            icon: 'info',
            title: 'Sin transacciones',
            text: 'No hay transacciones para mostrar'
          });
          return;
        }

        const transactions = register.transactions;
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

        if (transactions.length === 0) {
          tableHTML += `
            <tr>
              <td colspan="4" class="p-2 text-center">No hay transacciones registradas</td>
            </tr>
          `;
        }

        transactions.forEach(trans => {
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

          const fecha = this.getFormattedDateTime(trans.timestamp);

          tableHTML += `
            <tr class="border-b">
              <td class="p-2 ${typeClass}">${typeLabel}</td>
              <td class="p-2 text-right ${trans.amount >= 0 ? 'text-green-600' : 'text-red-600'}">
                ${Math.abs(trans.amount).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        Swal.fire({
          title: 'Transacciones',
          html: tableHTML,
          width: '800px',
          confirmButtonText: 'Cerrar'
        });
      },
      error: (error) => {
        console.error('Error al obtener transacciones:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudieron cargar las transacciones'
        });
      }
    });
  }

  validateAllDenominations(): boolean {
    return this.detallesApertura.every(detail => {
      return detail.count >= 0 && Number.isInteger(detail.count);
    });
  }

  showTransactionDialog() {
    this.cashRegisterService.loadCurrentCashRegister();

    const options = [
      { value: 'income', label: 'Ingreso' },
      { value: 'expense', label: 'Gasto' }
    ];

    const formHTML = `
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

    Swal.fire({
      title: 'Registrar Movimiento',
      html: formHTML,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const type = (document.getElementById('transaction-type') as HTMLSelectElement).value;
        const amountStr = (document.getElementById('transaction-amount') as HTMLInputElement).value;
        const description = (document.getElementById('transaction-description') as HTMLTextAreaElement).value;

        if (!description.trim()) {
          Swal.showValidationMessage('Debe ingresar una descripción');
          return false;
        }

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          Swal.showValidationMessage('Debe ingresar un monto válido mayor a cero');
          return false;
        }

        return { type, amount, description };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const formData = result.value as any;

        if (formData.type === 'income') {
          this.registerIncome(formData.amount, formData.description);
        } else if (formData.type === 'expense') {
          this.registerExpense(formData.amount, formData.description);
        }
      }
    });
  }

  registerExpense(amount: number, description: string) {
    this.cashRegisterService.registerExpense({ amount, description }).subscribe({
      next: (success) => {
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Gasto registrado',
            text: 'El gasto se ha registrado exitosamente'
          }).then(() => {
            this.cashRegisterService.loadCurrentCashRegister();
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
        console.error('Error al registrar gasto:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar el gasto'
        });
      }
    });
  }

  registerIncome(amount: number, description: string) {
    this.cashRegisterService.registerIncome({ amount, description }).subscribe({
      next: (success) => {
        if (success) {
          Swal.fire({
            icon: 'success',
            title: 'Ingreso registrado',
            text: 'El ingreso se ha registrado exitosamente'
          }).then(() => {
            this.cashRegisterService.loadCurrentCashRegister();
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
        console.error('Error al registrar ingreso:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Ocurrió un error al registrar el ingreso'
        });
      }
    });
  }

  private calculateRegisterStats(register: CashRegister) {
    let payments = 0;
    let expenses = 0;
    let incomes = 0;
    let refunds = 0;

    let efectivo = 0;
    let transferencia = 0;
    let ahorita = 0;
    let deUna = 0;
    let otros = 0;

    (register.transactions || []).forEach((trans: any) => {
      switch (trans.type) {
        case 'payment':
          payments += trans.amount;

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

  getFormattedDate(dateInput: any): string {
    if (!dateInput) return '-';

    try {
      let date: Date;

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
  }
}