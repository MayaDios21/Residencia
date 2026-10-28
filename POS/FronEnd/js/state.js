/*
 * ESTADO GLOBAL
 * Datos en memoria que comparten todos los módulos: catálogo, carrito,
 * configuración, sesión y caja. Se carga primero; los demás módulos lo usan.
 */

// Base de datos de productos en memoria
let products = [];

// Base de datos de categorías
let categories = [];

// Insumos del almacén que no se venden (vasos, platos, cucharas…).
let supplies = [];
let nextSupplyId = 1;

// Productos por defecto (solo se cargan la primera vez)
const defaultProducts = [
    { id: 1, name: "Taco de Birria", price: 30.00, category: "Tacos", image: "../Public/assets/imagenes/Taco Birria.jpg" },
    { id: 2, name: "Taco de Birria Harina", price: 35.00, category: "Tacos", image: "../Public/assets/imagenes/Taco Birria Harina.jpg" },
    { id: 3, name: "Quesabirria", price: 55.00, category: "Quesadillas", image: "../Public/assets/imagenes/Quesabirria.jpg" },
    { id: 4, name: "Quesabirria Harina", price: 60.00, category: "Quesadillas", image: "../Public/assets/imagenes/Quesabirria Harina.jpg" },
    { id: 5, name: "Consomé", price: 25.00, category: "Extras", image: "../Public/assets/imagenes/Consome.jpg" },
    { id: 6, name: "Consomé con Carne", price: 35.00, category: "Extras", image: "../Public/assets/imagenes/Consome Con Carne.jpg" },
    { id: 7, name: "Agua Grande", price: 20.00, category: "Bebidas", image: "../Public/assets/imagenes/Agua Grande.jpg", track_inventory: true },
    { id: 8, name: "Coca Cola 600ml", price: 25.00, category: "Bebidas", image: "../Public/assets/imagenes/Cocacola-lata.png", track_inventory: true }
];

const defaultProductImages = {
    "Taco de Birria": "../Public/assets/imagenes/Taco Birria.jpg",
    "Taco de Birria Harina": "../Public/assets/imagenes/Taco Birria Harina.jpg",
    "Quesabirria": "../Public/assets/imagenes/Quesabirria.jpg",
    "Quesabirria Harina": "../Public/assets/imagenes/Quesabirria Harina.jpg",
    "Consomé": "../Public/assets/imagenes/Consome.jpg",
    "Consomé con Carne": "../Public/assets/imagenes/Consome Con Carne.jpg",
    "Agua Grande": "../Public/assets/imagenes/Agua Grande.jpg",
    "Coca Cola 600ml": "../Public/assets/imagenes/Cocacola-lata.png"
};

// Categorías por defecto
const defaultCategories = [
    { id: 1, name: "Tacos", color: "#d35400" },
    { id: 2, name: "Quesadillas", color: "#8e44ad" },
    { id: 3, name: "Bebidas", color: "#3498db" },
    { id: 4, name: "Extras", color: "#27ae60" }
];

// Carrito de compras
let cart = [];

let pendingSale = null;

// ID para nuevos productos y categorías
let nextProductId = 9;

let nextCategoryId = 5;

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
