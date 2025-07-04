import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  DocumentReference,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, of, map, catchError, switchMap, forkJoin } from 'rxjs';
import { AuthService } from './auth.service';
import { Order } from '../models/data.model';

export interface CashRegisterTransaction {
  type: 'income' | 'expense' | 'payment' | 'refund';
  amount: number;
  description: string;
  orderId?: string;
  paymentMethod?: string;
  timestamp: Date;
  registeredBy: {
    uid: string;
    name: string;
    role: string;
  };
}

export interface DenominationDetail {
  denomination: number;
  type: 'bill' | 'coin';
  count: number;
  subtotal: number;
}

export interface CashRegister {
  id?: string;
  initialAmount: number;
  currentAmount: number;
  details: DenominationDetail[];
  openedBy: {
    uid: string;
    name: string;
    role: string;
  };
  openedAt: Date;
  closedAt?: Date | null;
  closedBy?: {
    uid: string;
    name: string;
    role: string;
  } | null;
  finalAmount?: number;
  finalDetails?: DenominationDetail[];
  difference?: number;
  notes?: string;
  status: 'open' | 'closed';
  transactions: CashRegisterTransaction[];
}

@Injectable({
  providedIn: 'root'
})
export class CashRegisterService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private currentUserData: any = null;
  transactionOccurred = signal<boolean>(false);

  constructor() {
    // Suscribirse a los datos del usuario actual
    this.authService.userData$.subscribe(userData => {
      this.currentUserData = userData;
    });
  }


  /**
   * Abre una nueva caja registradora
   * @param data Datos de apertura de caja
   * @returns Observable<string> ID de la caja abierta
   */
  openCashRegister(data: Partial<CashRegister>): Observable<string> {
    const cashRegisterCollection = collection(this.firestore, 'cash_registers');

    // Agregar fecha de servidor para consistencia
    const registerData = {
      ...data,
      currency: 'USD', // Dólar de Ecuador
      serverTimestamp: serverTimestamp(),
      currentAmount: data.initialAmount, // El monto actual inicia igual al inicial
      status: 'open',
      closedAt: null,
      closedBy: null,
      transactions: []
    };

    return from(addDoc(cashRegisterCollection, registerData)).pipe(
      map(docRef => docRef.id),
      catchError(error => {
        console.error('Error al abrir caja:', error);
        throw new Error('No se pudo abrir la caja registradora');
      })
    );
  }



  /**
   * Verifica si ya existe una caja abierta hoy
   * @returns Observable<boolean>
   */
  isCashRegisterOpenToday(): Observable<boolean> {
    const cashRegisterCollection = collection(this.firestore, 'cash_registers');

    // Calcular fecha de inicio y fin del día actual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const q = query(
      cashRegisterCollection,
      where('openedAt', '>=', today),
      where('openedAt', '<', tomorrow),
      where('status', '==', 'open')
    );

    return from(getDocs(q)).pipe(
      map(snapshot => !snapshot.empty),
      catchError(error => {
        console.error('Error al verificar estado de caja:', error);
        return of(false);
      })
    );
  }

  /**
   * Obtiene la caja abierta actualmente
   * @returns Observable con datos de la caja o null
   */
  getCurrentCashRegister(): Observable<CashRegister | null> {
    const cashRegisterCollection = collection(this.firestore, 'cash_registers');
    const q = query(
      cashRegisterCollection,
      where('status', '==', 'open'),
      orderBy('openedAt', 'desc'),
      limit(1)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as CashRegister;
      }),
      catchError(error => {
        console.error('Error al obtener caja actual:', error);
        return of(null);
      })
    );
  }

  /**
   * Registra una transacción en la caja actual
   * @param transactionData Datos de la transacción
   * @returns Observable<boolean> Éxito de la operación
   */
  registerTransaction(transactionData: Partial<CashRegisterTransaction>): Observable<boolean> {
    return this.getCurrentCashRegister().pipe(
      map(register => {
        if (!register) throw new Error('No hay una caja abierta');
        return register;
      }),
      switchMap(register => {
        const registerRef = doc(this.firestore, `cash_registers/${register.id}`);

        // Redondear a dos decimales para dólares (precisión de centavos)
        const amount = parseFloat((transactionData.amount || 0).toFixed(2));
        const newAmount = parseFloat((register.currentAmount + amount).toFixed(2));

        // Preparar transacción
        const transaction = {
          ...transactionData,
          amount: amount,
          currency: 'USD', // Dólar de Ecuador
          timestamp: new Date(),
          registeredBy: this.getUserInfo(),
        } as CashRegisterTransaction;

        // Actualizar caja con nueva transacción y monto
        return from(updateDoc(registerRef, {
          currentAmount: newAmount,
          transactions: [...(register.transactions || []), transaction]
        })).pipe(map(() => {
          // Notificar que ocurrió una nueva transacción
          this.transactionOccurred.update(val => !val); // Toggle para disparar cambio
          return true;
        }));
      }),
      catchError(error => {
        console.error('Error al registrar transacción:', error);
        return of(false);
      })
    );
  }

  /**
   * Cierra la caja registradora actual
   * @param closeData Datos de cierre de caja
   * @returns Observable<boolean> Éxito de la operación
   */
  closeCashRegister(closeData: {
    finalAmount: number;
    details: DenominationDetail[];
    notes?: string;
  }): Observable<boolean> {
    return this.getCurrentCashRegister().pipe(
      map(register => {
        if (!register) throw new Error('No hay una caja abierta para cerrar');
        return register;
      }),
      switchMap(register => {
        const registerRef = doc(this.firestore, `cash_registers/${register.id}`);

        // Datos de cierre
        const closingData = {
          status: 'closed',
          closedAt: new Date(),
          closedBy: this.getUserInfo(),
          finalAmount: closeData.finalAmount,
          finalDetails: closeData.details,
          difference: closeData.finalAmount - register.currentAmount,
          notes: closeData.notes || ''
        };

        // Actualizar documento
        return from(updateDoc(registerRef, closingData)).pipe(
          map(() => true)
        );
      }),
      catchError(error => {
        console.error('Error al cerrar caja:', error);
        return of(false);
      })
    );
  }

  /**
   * Registra un pago de pedido en la caja
   * @param paymentData Datos del pago
   * @returns Observable<boolean>
   */
  registerPayment(paymentData: {
    orderId: string;
    amount: number;
    paymentMethod: string;
    description: string;
  }): Observable<boolean> {
    const transaction: Partial<CashRegisterTransaction> = {
      type: 'payment',
      amount: paymentData.amount,
      description: paymentData.description,
      orderId: paymentData.orderId,
      paymentMethod: paymentData.paymentMethod
    };

    return this.registerTransaction(transaction);
  }

  /**
   * Registra un gasto en la caja
   * @param expenseData Datos del gasto
   * @returns Observable<boolean>
   */
  registerExpense(expenseData: {
    amount: number;
    description: string;
  }): Observable<boolean> {
    const transaction: Partial<CashRegisterTransaction> = {
      type: 'expense',
      // Convertir a negativo ya que es un gasto
      amount: -Math.abs(expenseData.amount),
      description: expenseData.description
    };

    return this.registerTransaction(transaction);
  }

  /**
   * Registra un ingreso adicional en la caja
   * @param incomeData Datos del ingreso
   * @returns Observable<boolean>
   */
  registerIncome(incomeData: {
    amount: number;
    description: string;
  }): Observable<boolean> {
    const transaction: Partial<CashRegisterTransaction> = {
      type: 'income',
      amount: Math.abs(incomeData.amount),
      description: incomeData.description
    };

    return this.registerTransaction(transaction);
  }

  /**
   * Registra un reembolso en la caja
   * @param refundData Datos del reembolso
   * @returns Observable<boolean>
   */
  registerRefund(refundData: {
    orderId: string;
    amount: number;
    description: string;
  }): Observable<boolean> {
    const transaction: Partial<CashRegisterTransaction> = {
      type: 'refund',
      // Convertir a negativo ya que es un reembolso
      amount: -Math.abs(refundData.amount),
      description: refundData.description,
      orderId: refundData.orderId
    };

    return this.registerTransaction(transaction);
  }

  /**
   * Obtiene información del usuario actual
   */
  private getUserInfo() {
    return {
      uid: this.currentUserData?.uid || '',
      name: this.currentUserData?.name || 'Usuario Desconocido',
      role: this.currentUserData?.role || ''
    };
  }

  /**
   * Obtiene historial de cajas
   * @param limit Límite de registros (default 10)
   * @returns Observable con historial
   */
  getCashRegisterHistory(limitCount: number = 10): Observable<CashRegister[]> {
    const cashRegisterCollection = collection(this.firestore, 'cash_registers');
    const q = query(
      cashRegisterCollection,
      orderBy('openedAt', 'desc'),
      limit(limitCount)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }) as CashRegister)),
      catchError(error => {
        console.error('Error al obtener historial:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene las transacciones de la caja actual
   * @returns Observable con las transacciones
   */
  getCurrentTransactions(): Observable<CashRegisterTransaction[]> {
    return this.getCurrentCashRegister().pipe(
      map(register => {
        if (!register) return [];
        return register.transactions || [];
      })
    );
  }

  /**
   * Obtiene el balance actual de la caja
   * @returns Observable con el monto actual
   */
  getCurrentBalance(): Observable<number> {
    return this.getCurrentCashRegister().pipe(
      map(register => {
        if (!register) return 0;
        return register.currentAmount || 0;
      })
    );
  }

  /**
   * Obtiene el resumen de la caja actual con totales por tipo de transacción
   * @returns Observable con el resumen
   */
  getCurrentSummary(): Observable<{
    totalPayments: number;
    totalExpenses: number;
    totalIncomes: number;
    totalRefunds: number;
    initialAmount: number;
    currentAmount: number;
    paymentMethods: {
      efectivo: number;
      transferencia: number;
      ahorita: number;
      deUna: number;
      otros: number;
    }
  }> {
    return this.getCurrentCashRegister().pipe(
      map(register => {
        if (!register) {
          return {
            totalPayments: 0,
            totalExpenses: 0,
            totalIncomes: 0,
            totalRefunds: 0,
            initialAmount: 0,
            currentAmount: 0,
            paymentMethods: {
              efectivo: 0,
              transferencia: 0,
              ahorita: 0,
              deUna: 0,
              otros: 0
            }
          };
        }

        // Calcular totales por tipo
        let totalPayments = 0;
        let totalExpenses = 0;
        let totalIncomes = 0;
        let totalRefunds = 0;

        // Inicializar contadores por método de pago
        let efectivo = 0;
        let transferencia = 0;
        let ahorita = 0;
        let deUna = 0;
        let otros = 0;

        (register.transactions || []).forEach(transaction => {
          switch (transaction.type) {
            case 'payment':
              totalPayments += transaction.amount;

              // Sumar según el método de pago (case insensitive)
              const method = (transaction.paymentMethod || '').toLowerCase();
              if (method === 'efectivo') {
                efectivo += transaction.amount;
              } else if (method === 'transferencia') {
                transferencia += transaction.amount;
              } else if (method === 'ahorita') {
                ahorita += transaction.amount;
              } else if (method === 'de una') {
                deUna += transaction.amount;
              } else {
                otros += transaction.amount;
              }
              break;
            case 'expense':
              totalExpenses += Math.abs(transaction.amount);
              break;
            case 'income':
              totalIncomes += transaction.amount;
              break;
            case 'refund':
              totalRefunds += Math.abs(transaction.amount);
              break;
          }
        });

        return {
          totalPayments,
          totalExpenses,
          totalIncomes,
          totalRefunds,
          initialAmount: register.initialAmount,
          currentAmount: register.currentAmount,
          paymentMethods: {
            efectivo,
            transferencia,
            ahorita,
            deUna,
            otros
          }
        };
      })
    );
  }
  /**
  * Sincroniza las órdenes con las transacciones de caja
  * @returns Observable<boolean> Éxito de la operación
  */
  /**
 * Sincroniza las órdenes con las transacciones de caja
 * @param cashRegisterId ID opcional de la caja registradora para asociar
 * @returns Observable<boolean> Éxito de la operación
 */
  syncOrdersWithTransactions(cashRegisterId: string = 'oEDiI6A372Oz4mP3Ojjr'): Observable<boolean> {
    // Obtener la caja específica por ID
    return this.getCashRegisterById(cashRegisterId).pipe(
      switchMap(register => {
        if (!register) {
          throw new Error(`No se encontró la caja con ID ${cashRegisterId}`);
        }

        // Obtener todas las órdenes con estado "Cobrado"
        const ordersCollection = collection(this.firestore, 'orders');
        const ordersQuery = query(
          ordersCollection,
          where('status', '==', 'Cobrado')
        );

        return from(getDocs(ordersQuery)).pipe(
          switchMap(snapshot => {
            if (snapshot.empty) {
              return of(true); // No hay órdenes para sincronizar
            }

            // Recolectar todas las órdenes cobradas
            const orders = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            } as Order));

            console.log(`Se encontraron ${orders.length} órdenes para sincronizar`);

            // Crear transacciones para cada orden y actualizar con el ID de caja
            const orderTransactions = orders.map(order => {
              return this.registerPayment({
                orderId: order.id,
                amount: order.total,
                paymentMethod: order.paymentMethod || 'efectivo',
                description: `Pago de orden #${order.id} - Mesa(s): ${order.tables?.join(', ')}`
              }).pipe(
                switchMap(success => {
                  if (success) {
                    // Marcar la orden como sincronizada y asociarla con esta caja
                    const orderRef = doc(this.firestore, `orders/${order.id}`);
                    return from(updateDoc(orderRef, {
                      syncedWithCashRegister: true,
                      cashRegisterId: cashRegisterId
                    })).pipe(map(() => true));
                  }
                  return of(false);
                })
              );
            });

            // Si no hay transacciones para procesar, retornar éxito
            if (orderTransactions.length === 0) {
              return of(true);
            }

            // Ejecutar todas las transacciones en paralelo
            return forkJoin(orderTransactions).pipe(
              map(results => results.every(result => result === true))
            );
          })
        );
      }),
      catchError(error => {
        console.error('Error al sincronizar órdenes con caja:', error);
        return of(false);
      })
    );
  }

  /**
   * Obtiene detalles de una caja específica por ID
   * @param registerId ID de la caja
   * @returns Observable con los detalles de la caja
   */
  getCashRegisterById(registerId: string): Observable<CashRegister | null> {
    const registerRef = doc(this.firestore, `cash_registers/${registerId}`);

    return from(getDocs(query(collection(this.firestore, `cash_registers`), where('__name__', '==', registerId)))).pipe(
      map(snapshot => {
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as CashRegister;
      }),
      catchError(error => {
        console.error(`Error al obtener caja con ID ${registerId}:`, error);
        return of(null);
      })
    );
  }
}