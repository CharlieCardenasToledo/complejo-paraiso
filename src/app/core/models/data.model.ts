// data.interface.ts - Archivo centralizado de interfaces para la aplicación

import { Timestamp } from "@angular/fire/firestore";
import { UserRole } from "../../core/services/auth.service";


/**
 * Interfaces para Opciones de Productos
 */
export interface DishOption {
    name: string;
    price?: number;
}

/**
 * Interfaces para Items en Órdenes
 */
export interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    description?: string;
    options?: (string | DishOption)[];
    selectedOption?: string;
    status?: 'En espera' | 'En preparación' | 'Listos para servir' | 'Servido';
    isTracked?: boolean;
    stockQuantity?: number;
    originalQuantity?: number;
    categoryId?: string;
    categoryName?: string;
    orderId?: string;
    orderDate?: Date;
    customerName?: string;
    tableInfo?: string;
    // Para división de cuenta
    splitAmount?: number;
    splitAssigned?: boolean;
    originalId?: string;
}

/**
 * Interfaces para Categorías
 */
export interface Category {
    id: string;
    name: string;
    description?: string;
    items: OrderItem[];
    order?: number;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Interfaces para Órdenes y Pedidos
 */
export interface Order {
    id: string;
    customer: {
        idNumber: string;
        name: string;
    };
    date: Date;
    status: 'En espera' | 'En preparación' | 'Listos para servir' | 'Servido' | 'Cobrado';
    total: number;
    items: OrderItem[];
    tables?: (number | string)[];
    isConsumidorFinal?: boolean;
    hasInvoice?: boolean;
    paidAt?: Date;
    paymentMethod?: string;
    updatedAt?: Date;
    paymentDetails?: Payment[];
    syncedWithCashRegister?: boolean;
}

/**
 * Interfaces para Usuarios
 */
export interface User {
    uid: string;
    email: string;
    displayName: string;
    name?: string;
    role: UserRole;
    createdAt: Date;
    updatedAt?: Date;
}

/**
 * Interfaces para Dashboard y Estadísticas
 */
export interface DashboardStats {
    totalRevenue: number;
    orderCount: number;
    totalItems: number;
    averageTicket: number;
    topProducts: { name: string; quantity: number; revenue: number; }[];
    statusCounts: Record<string, number>;
    storeRevenue: number;
    storeOrderCount: number;
    storeItems: number;
}

/**
 * Interfaces para Inventario
 */
export interface InventoryItem {
    id?: string;
    name: string;
    description?: string;
    quantity: number;
    unit: string;
    minStock?: number;
    cost?: number;
    category?: string;
    location?: string;
    supplier?: string;
    lastRestocked?: Date;
    active: boolean;
    createdAt?: Date;
    updatedAt?: Date;

}

export interface InventoryMovement {
    id?: string;
    itemId: string;
    itemName: string;
    previousQuantity: number;
    newQuantity: number;
    quantity: number;
    type: 'entrada' | 'salida' | 'ajuste';
    reason: string;
    createdBy: string;
    createdAt: Date;
    monetaryValue?: number;
}
export interface UserData {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    emailVerified: boolean;
    name?: string;
    role?: UserRole;
    active?: boolean;
    phone?: string;
    createdAt?: Timestamp | Date;
    lastLogin?: Timestamp | Date;
    permissions?: string[];
}
export interface InventoryBalance {
    id?: string;
    currentBalance: number;
    initialBalance: number;
    lastUpdated: Date;
    updatedBy: string;
}

export interface BalanceTransaction {
    id?: string;
    previousBalance: number;
    newBalance: number;
    amount: number;
    type: 'entrada' | 'salida' | 'ajuste';
    description: string;
    relatedItemId?: string;
    relatedItemName?: string;
    createdAt: Date;
    createdBy: string;
}
/**
 * Interfaces para Pagos
 */
export interface Payment {
    id?: string;
    partName: string;
    amount: number;
    amountReceived?: number;
    change?: number;
    paymentMethod: string;
    timestamp: Date;
    splitMode: 'items' | 'equal' | 'complete';
    items?: {
        id: string;
        name: string;
        price: number;
        quantity: number;
        selectedOption?: string | null;
    }[];
    isEqualSplit?: boolean;
    totalParts?: number;
}

export interface SplitPart {
    name: string;
    items: OrderItem[];
    total: number;
    amountReceived?: number;
    change?: number;
}

/**
 * Interfaces para Tienda
 */
export interface StoreItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    isTracked?: boolean;
    stockQuantity?: number;
}

export interface CartItem extends StoreItem {
    subtotal: number;
}

/**
 * Interfaces para Facturas
 */
export interface InvoiceDetails {
    id?: string;
    invoiceNumber: string;
    customer: {
        idNumber: string;
        name: string;
    };
    items: OrderItem[];
    total: number;
    date: Date;
    status: string;
    paymentMethod: string;
}

/**
 * Interfaces para migración y transformación de datos
 */
export interface MigrationData {
    sourceType: string;
    targetType: string;
    mappings: { source: string; target: string }[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    createdAt: Date;
    completedAt?: Date;
}

/**
 * Interfaces para configuración de aplicación
 */
export interface AppConfig {
    restaurantName: string;
    address: string;
    phone: string;
    taxRate: number;
    currencySymbol: string;
    allowedCategoryIds?: string[];
    enabledModules: {
        kitchen: boolean;
        inventory: boolean;
        payments: boolean;
        store: boolean;
        reports: boolean;
    };
}

/**
 * Interfaces para Clientes
 */
export interface Customer {
    idNumber: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    isConsumidorFinal?: boolean;
    lastVisit?: Date;
    createdAt: Date;
    updatedAt?: Date;
}

/**
 * Interfaces para Productos
 */
export interface Dish {
    id?: string;
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    categoryName?: string;
    image?: string;
    options?: DishOption[];
    ingredients?: DishIngredient[];
    isTracked: boolean;
    stockQuantity?: number;
    active: boolean;
    featured?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface DishIngredient {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    isTracked: boolean;
}
export interface TableGroup {
    name: string;
    tables: Table[];
}

export interface Table {
    id: string | number;
    type: 'regular' | 'special';
}
