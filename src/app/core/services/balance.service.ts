import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, collectionData, query, orderBy } from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { BalanceTransaction, InventoryBalance } from '../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class BalanceService {
  private firestore = inject(Firestore);
  private balanceDocId = 'global_balance'; // ID fijo para el documento de saldo

  constructor() { }

  /**
   * Obtiene el saldo actual
   */
  getBalance(): Observable<InventoryBalance> {
    const balanceRef = doc(this.firestore, `balance/${this.balanceDocId}`);

    return from(getDoc(balanceRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as InventoryBalance;
          // Convertir timestamps a Date si es necesario
          return {
            ...data,
            lastUpdated: data.lastUpdated instanceof Date ? data.lastUpdated : (data.lastUpdated as any).toDate()
          };
        } else {
          // Si no existe, devolver un valor predeterminado
          return {
            id: this.balanceDocId,
            currentBalance: 0,
            initialBalance: 0,
            lastUpdated: new Date(),
            updatedBy: 'Sistema'
          };
        }
      }),
      catchError(error => {
        console.error('Error al obtener el saldo:', error);
        return of({
          id: this.balanceDocId,
          currentBalance: 0,
          initialBalance: 0,
          lastUpdated: new Date(),
          updatedBy: 'Sistema'
        });
      })
    );
  }

  /**
   * Inicializa o actualiza el saldo inicial
   */
  async setInitialBalance(amount: number, userName: string): Promise<void> {
    const balanceRef = doc(this.firestore, `balance/${this.balanceDocId}`);
    const balanceSnap = await getDoc(balanceRef);

    if (balanceSnap.exists()) {
      // Actualizar el saldo existente
      const currentData = balanceSnap.data() as InventoryBalance;
      const difference = amount - currentData.initialBalance;

      await updateDoc(balanceRef, {
        initialBalance: amount,
        currentBalance: currentData.currentBalance + difference,
        lastUpdated: new Date(),
        updatedBy: userName
      });

      // Registrar la transacción como un ajuste
      await this.registerTransaction({
        previousBalance: currentData.currentBalance,
        newBalance: currentData.currentBalance + difference,
        amount: difference,
        type: 'ajuste',
        description: 'Ajuste de saldo inicial',
        createdAt: new Date(),
        createdBy: userName
      });
    } else {
      // Crear nuevo documento de saldo
      await setDoc(balanceRef, {
        id: this.balanceDocId,
        currentBalance: amount,
        initialBalance: amount,
        lastUpdated: new Date(),
        updatedBy: userName
      });

      // Registrar la transacción inicial
      await this.registerTransaction({
        previousBalance: 0,
        newBalance: amount,
        amount: amount,
        type: 'entrada',
        description: 'Configuración inicial de saldo',
        createdAt: new Date(),
        createdBy: userName
      });
    }
  }

  /**
   * Registra una nueva transacción y actualiza el saldo
   */
  async registerTransaction(transaction: Omit<BalanceTransaction, 'id'>): Promise<void> {
    // Añadir la transacción a la colección de transacciones
    const transactionsCollection = collection(this.firestore, 'balance_transactions');
    await addDoc(transactionsCollection, transaction);
  }

  /**
   * Efectúa un movimiento en el saldo (entrada o salida)
   */
  async updateBalance(amount: number, type: 'entrada' | 'salida', description: string, userName: string, relatedItemId?: string, relatedItemName?: string): Promise<boolean> {
    try {
      const balanceRef = doc(this.firestore, `balance/${this.balanceDocId}`);
      const balanceSnap = await getDoc(balanceRef);

      if (!balanceSnap.exists()) {
        throw new Error('No existe un saldo configurado');
      }

      const currentData = balanceSnap.data() as InventoryBalance;
      let newBalance: number;

      if (type === 'entrada') {
        // Agregar al saldo (ingreso de dinero)
        newBalance = currentData.currentBalance + amount;
      } else {
        // Restar del saldo (gasto)
        newBalance = currentData.currentBalance - amount;

        // Opcional: verificar si hay saldo suficiente
        if (newBalance < 0) {
          return false; // Saldo insuficiente
        }
      }

      // Actualizar saldo
      await updateDoc(balanceRef, {
        currentBalance: newBalance,
        lastUpdated: new Date(),
        updatedBy: userName
      });

      // Registrar transacción
      await this.registerTransaction({
        previousBalance: currentData.currentBalance,
        newBalance: newBalance,
        amount: type === 'entrada' ? amount : -amount,
        type: type,
        description: description,
        relatedItemId: relatedItemId,
        relatedItemName: relatedItemName,
        createdAt: new Date(),
        createdBy: userName
      });

      return true;
    } catch (error) {
      console.error('Error al actualizar el saldo:', error);
      return false;
    }
  }

  /**
   * Obtiene historial de transacciones
   */
  getTransactions(limit = 20): Observable<BalanceTransaction[]> {
    const transactionsCollection = collection(this.firestore, 'balance_transactions');
    const transactionsQuery = query(
      transactionsCollection,
      orderBy('createdAt', 'desc')
    );

    return collectionData(transactionsQuery, { idField: 'id' }).pipe(
      map((data: any[]) => data.slice(0, limit).map(transaction => ({
        ...transaction,
        createdAt: transaction.createdAt instanceof Date ? transaction.createdAt : transaction.createdAt.toDate()
      })))
    );
  }
}