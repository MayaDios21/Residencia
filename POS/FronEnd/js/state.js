/*
 * ESTADO GLOBAL
 * Datos en memoria que comparten todos los módulos: catálogo, carrito,
 * configuración, sesión y caja. Se carga primero; los demás módulos lo usan.
 */

// Catálogo cargado de la API al iniciar sesión (los IDs son los del servidor).
// El menú inicial se crea en la base con `python manage.py cargar_menu`.
let products = [];

let categories = [];

// Insumos del almacén que no se venden (vasos, platos, cucharas…).
let supplies = [];
let nextSupplyId = 1;

// Carrito de compras
let cart = [];

let pendingSale = null;

// Categoría activa para filtrar productos
let activeCategory = "Todas";

// Configuración del sistema:
// TAX_RATE define el porcentaje de IVA y exchangeRate se usa para mostrar
// equivalencias en dólares sin cambiar el precio original en pesos.
// TAX_RATE ahora es una variable que puede ser modificada
let TAX_RATE = 0.08; // 8% de IVA (valor por defecto)

// Variable para almacenar el tipo de cambio
let exchangeRate = 19.50; // Tipo de cambio por defecto

// Historial de ventas
let salesHistory = [];

// Sesión activa ({ role, displayName }); se guarda en localStorage para sobrevivir recargas.
let adminSession = null;

const SESSION_STORAGE_KEY = 'pos_session';

const CURRENT_TAB_STORAGE_KEY = 'pos_current_tab';

// pendingAction guarda temporalmente la operación que se ejecutará cuando el
// usuario confirme un modal, por ejemplo borrar un registro o abrir la caja.
let pendingAction = null;

// Lista de registros de caja
let cashBoxRecords = [];

let openingCash = {
    amount: 0,
    dateKey: null
};

// ID para nuevos registros
let nextCashBoxId = 1;

// Objeto para almacenar el cálculo actual
let currentCashBoxCalculation = {
    initialFund: 0,
    dailySales: 0,
    minorExpenses: 0,
    totalInCash: 0,
    netSales: 0
};
