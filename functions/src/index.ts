import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  generateInvoice,
  generateInvoiceXml,
  signXml,
  documentReception,
  documentAuthorization,
  InvoiceInput,
  TotalWithTax,
  Detail,
} from "open-factura";
import * as fs from "fs";
import * as path from "path";

// Inicializar Firebase Admin
admin.initializeApp();

// Interfaces para tipado
interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOption?: string;
  status?: string;
}

interface Order {
  id: string;
  customer: {
    idNumber: string;
    name: string;
  };
  date: Date;
  status: string;
  total: number;
  items: OrderItem[];
  tables?: number[];
}

interface CustomerInfo {
  identificacion: string;
  razonSocial: string;
  direccion: string;
  email: string;
  telefono: string;
}

interface InvoiceResult {
  success: boolean;
  invoiceKey?: string;
  status?: string;
  error?: string;
  xmlData?: string;
}

/**
 * Cloud Function para generar facturas electrónicas
 */
export const generateElectronicInvoice = functions.https.onCall(
  async (request) => {
    try {
      const data = request.data;
      const orderId = data.orderId;
      const customerInfo = data.customerInfo;

      if (!orderId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "El ID del pedido es requerido"
        );
      }

      functions.logger.info("Generando factura para el pedido:", orderId);

      const orderRef = admin.firestore().collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Pedido no encontrado"
        );
      }

      const order = orderDoc.data() as Order;
      order.id = orderDoc.id;

      // Obtener información de la empresa desde Firebase Config
      const companyInfo = functions.config().company || {
        razonSocial: "EMPRESA DEMO S.A.",
        nombreComercial: "EMPRESA DEMO",
        ruc: "9999999999001",
        estab: "001",
        ptoEmi: "001",
        dirMatriz: "Dirección matriz",
        dirEstablecimiento: "Dirección establecimiento",
        obligadoContabilidad: "SI",
      };

      // Leer el certificado desde un archivo local (para desarrollo/pruebas)
      let p12Buffer: ArrayBuffer;

      try {
        // Usar Uint8Array como intermediario para asegurar que siempre sea ArrayBuffer
        const certificatePath = path.resolve(__dirname, "../certificates/certificate.p12");
        const fileBuffer = fs.readFileSync(certificatePath);
        const uint8Array = new Uint8Array(fileBuffer);
        p12Buffer = uint8Array.buffer;
      } catch (error) {
        console.error("Error leyendo certificado:", error instanceof Error ? error.message : "Error desconocido");
        throw new functions.https.HttpsError(
          "internal",
          "No se pudo leer el certificado digital"
        );
      }

      // Obtener contraseña del certificado
      const password = functions.config().certificate?.password || "password123";

      // Determinar el ambiente SRI (producción o pruebas)
      const isProduction = functions.config().sri?.production === "true";
      const ambiente = isProduction ? "2" as const : "1" as const; // 1: Pruebas, 2: Producción

      // Obtener el siguiente número secuencial para la factura
      const counterRef = admin.firestore().collection("counters").doc("invoices");
      const counterDoc = await admin.firestore().runTransaction(async (transaction) => {
        const doc = await transaction.get(counterRef);
        const currentCounter = doc.exists ? doc.data()?.current || 0 : 0;
        const nextCounter = currentCounter + 1;

        transaction.set(counterRef, {current: nextCounter}, {merge: true});

        return nextCounter;
      });

      // Formatear el número secuencial (9 dígitos)
      const secuencial = counterDoc.toString().padStart(9, "0");

      // Fecha actual formateada para factura (DD/MM/YYYY)
      const today = new Date();
      const fechaEmision = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`;

      // Preparar los detalles para la factura
      const detalleItems: Detail[] = order.items.map((item) => ({
        codigoPrincipal: item.id.toString(),
        codigoAuxiliar: item.id.toString(), // Agregado campo requerido
        descripcion: item.selectedOption ?
          `${item.name} (${item.selectedOption})` :
          item.name,
        cantidad: item.quantity.toString(),
        precioUnitario: item.price.toFixed(2),
        descuento: "0.00",
        precioTotalSinImpuesto: (item.quantity * item.price).toFixed(2),
        impuestos: {
          impuesto: [{
            codigo: "2", // IVA
            codigoPorcentaje: "2", // IVA 12%
            tarifa: "12.00",
            baseImponible: (item.quantity * item.price).toFixed(2),
            valor: (item.quantity * item.price * 0.12).toFixed(2),
          }],
        },
      }));

      // Calcular totales
      const subtotal = order.items.reduce(
        (sum, item) => sum + item.price * item.quantity, 0
      );
      const iva = subtotal * 0.12;
      const total = subtotal + iva;

      // Obtener tipo de identificación válido según los tipos definidos
      const tipoId = getTipoIdentificacion(customerInfo.identificacion) as "04" | "05" | "06" | "07" | "08";

      // Crear objeto para impuestos con todos los campos requeridos
      const totalImpuesto: TotalWithTax = {
        codigo: "2" as const,
        codigoPorcentaje: "2" as const,
        baseImponible: subtotal.toFixed(2),
        valor: iva.toFixed(2),
        descuentoAdicional: "0.00",
      };

      // Generar factura con open-factura
      const invoiceData: InvoiceInput = {
        infoTributaria: {
          ambiente,
          tipoEmision: "1",
          razonSocial: companyInfo.razonSocial,
          nombreComercial: companyInfo.nombreComercial,
          ruc: companyInfo.ruc,
          codDoc: "01", // Factura
          estab: companyInfo.estab,
          ptoEmi: companyInfo.ptoEmi,
          secuencial,
          dirMatriz: companyInfo.dirMatriz,
        },
        infoFactura: {
          fechaEmision,
          dirEstablecimiento: companyInfo.dirEstablecimiento,
          obligadoContabilidad: companyInfo.obligadoContabilidad as "SI" | "NO",
          tipoIdentificacionComprador: tipoId,
          razonSocialComprador: customerInfo.razonSocial,
          identificacionComprador: customerInfo.identificacion,
          direccionComprador: customerInfo.direccion,
          totalSinImpuestos: subtotal.toFixed(2),
          totalDescuento: "0.00",
          totalConImpuestos: {
            totalImpuesto: [totalImpuesto],
          },
          propina: "0.00",
          importeTotal: total.toFixed(2),
          moneda: "DOLAR",
          pagos: {
            pago: [{
              formaPago: "01", // Efectivo
              total: total.toFixed(2),
              plazo: "0",
              unidadTiempo: "dias",
            }],
          },
        },
        detalles: {
          detalle: detalleItems,
        },
        infoAdicional: {
          campoAdicional: [
            {"@nombre": "Email", "#": customerInfo.email || "cliente@ejemplo.com"},
            {"@nombre": "Teléfono", "#": customerInfo.telefono || "N/A"},
            {"@nombre": "OrderId", "#": order.id},
          ],
        },
      };

      const {invoice, accessKey} = generateInvoice(invoiceData);
      functions.logger.info("Factura generada con clave de acceso:", accessKey);

      // Generar XML
      const invoiceXml = generateInvoiceXml(invoice);

      // Firmar XML
      const signedXml = await signXml(p12Buffer, password, invoiceXml);

      // Obtener URLs del SRI
      const receptionUrl = isProduction ?
        "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl" :
        "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl";

      const authorizationUrl = isProduction ?
        "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl" :
        "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl";

      // Código para pruebas (simular respuesta exitosa)
      const mockAuthResult = {
        estado: "AUTORIZADO",
        numeroAutorizacion: accessKey,
        fechaAutorizacion: new Date().toISOString(),
      };

      // Guardar factura en Firestore
      const invoiceRef = admin.firestore().collection("invoices").doc(accessKey);
      await invoiceRef.set({
        orderId: order.id,
        customerId: order.customer.idNumber,
        customerName: order.customer.name,
        invoiceNumber: `${companyInfo.estab}-${companyInfo.ptoEmi}-${secuencial}`,
        accessKey: accessKey,
        date: admin.firestore.FieldValue.serverTimestamp(),
        total: total,
        status: mockAuthResult.estado,
        items: order.items,
        signedXml: signedXml,
      });

      // Actualizar estado en la orden
      await orderRef.update({
        hasInvoice: true,
        invoiceAccessKey: accessKey,
        invoiceStatus: mockAuthResult.estado,
        invoiceDate: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        invoiceKey: accessKey,
        status: mockAuthResult.estado,
        xmlData: signedXml,
      } as InvoiceResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      const errorStack = error instanceof Error ? error.stack : undefined;

      functions.logger.error("Error generando factura:", errorMessage);

      // Registrar el error para análisis
      await admin.firestore().collection("errors").add({
        type: "INVOICE_GENERATION",
        date: admin.firestore.FieldValue.serverTimestamp(),
        error: errorMessage,
        stack: errorStack,
        orderId: request.data.orderId,
      });

      throw new functions.https.HttpsError(
        "internal",
        "Error al generar factura: " + errorMessage
      );
    }
  }
);

/**
 * Determina el tipo de identificación según el formato del número
 */
function getTipoIdentificacion(identificacion: string): string {
  if (!identificacion) return "07"; // Consumidor final

  // Limpiar cualquier caracter no numérico
  const cleaned = identificacion.replace(/\D/g, "");

  if (cleaned.length === 13 && cleaned.endsWith("001")) {
    return "04"; // RUC
  } else if (cleaned.length === 10) {
    return "05"; // Cédula
  } else {
    return "07"; // Consumidor final u otro
  }
}

/**
 * Endpoint para consultar el estado de una factura
 */
export const getInvoiceStatus = functions.https.onCall(
  async (request) => {
    try {
      const data = request.data;
      const accessKey = data.accessKey;

      if (!accessKey) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "La clave de acceso es requerida"
        );
      }

      const invoiceRef = admin.firestore().collection("invoices").doc(accessKey);
      const invoiceDoc = await invoiceRef.get();

      if (!invoiceDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Factura no encontrada"
        );
      }

      return {
        success: true,
        invoice: invoiceDoc.data(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";

      functions.logger.error("Error al consultar factura:", errorMessage);
      throw new functions.https.HttpsError(
        "internal",
        "Error al consultar factura: " + errorMessage
      );
    }
  }
);
