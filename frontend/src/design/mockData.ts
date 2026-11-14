// Tasarım önizlemesi için örnek veri. Tutarlar backend'in döndüreceği biçimde (metin) yazılmıştır.

export interface MockProduct {
  id: string
  name: string
  barcode: string
  group: string
  caseQuantity: number
  listPrice: string
  price: string
  discountPercent?: string
  inStock: boolean
}

export const groups = ['Tümü', 'Bardak', 'Tabak', 'Tencere', 'Saklama', 'Çatal-Kaşık']

export const products: MockProduct[] = [
  {
    id: 'p1',
    name: "Çay Bardağı 6'lı Set, İnce Belli",
    barcode: '8690000000017',
    group: 'Bardak',
    caseQuantity: 12,
    listPrice: '48.90',
    price: '41.57',
    discountPercent: '15',
    inStock: true,
  },
  {
    id: 'p2',
    name: 'Porselen Yemek Tabağı 27 cm',
    barcode: '8690000000024',
    group: 'Tabak',
    caseQuantity: 24,
    listPrice: '36.50',
    price: '32.85',
    discountPercent: '10',
    inStock: true,
  },
  {
    id: 'p3',
    name: 'Granit Tencere 24 cm, Kapaklı',
    barcode: '8690000000031',
    group: 'Tencere',
    caseQuantity: 6,
    listPrice: '389.00',
    price: '389.00',
    inStock: false,
  },
  {
    id: 'p4',
    name: "Cam Saklama Kabı 3'lü Set",
    barcode: '8690000000048',
    group: 'Saklama',
    caseQuantity: 8,
    listPrice: '154.90',
    price: '139.41',
    discountPercent: '10',
    inStock: true,
  },
  {
    id: 'p5',
    name: "Paslanmaz Çatal 12'li",
    barcode: '8690000000055',
    group: 'Çatal-Kaşık',
    caseQuantity: 10,
    listPrice: '129.00',
    price: '129.00',
    inStock: true,
  },
  {
    id: 'p6',
    name: "Su Bardağı 6'lı, Desenli",
    barcode: '8690000000062',
    group: 'Bardak',
    caseQuantity: 12,
    listPrice: '64.90',
    price: '55.17',
    discountPercent: '15',
    inStock: false,
  },
]

export interface MockCartLine {
  product: MockProduct
  quantity: number
  netAmount: string
}

export const cartLines: MockCartLine[] = [
  { product: products[0], quantity: 24, netAmount: '997.68' },
  { product: products[2], quantity: 6, netAmount: '2334.00' },
  { product: products[3], quantity: 16, netAmount: '2230.56' },
]

export const cartTotals = {
  grossTotal: '5986.00',
  discountTotal: '423.76',
  netTotal: '5562.24',
  vatTotal: '1112.45',
  grandTotal: '6674.69',
}

export const dealerAddress = 'Atatürk Cad. No:12, Merkez / Kayseri'
