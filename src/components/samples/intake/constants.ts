import { Step } from './types'

export const STEPS: Step[] = [
  { id: 1, name: 'Contract search', description: 'Find an existing contract or skip to enter manually' },
  { id: 2, name: 'Supply chain and contract references', description: '' },
  { id: 3, name: 'Quality, micro-origins, post harvest processes and certificates', description: '' },
  { id: 4, name: 'Quantity and shipment', description: '' },
  { id: 5, name: 'Sample photo and review', description: '' },
  { id: 6, name: 'Sub-contracts', description: '' }
]

// Certifications available for selection
export const CERTIFICATIONS = [
  'Rainforest Alliance',
  'Fair Trade',
  'FLO Fair Trade',
  'Organic',
  'EUDR'
]

export const ORIGINS = [
  'Brazil', 'Colombia', 'Ethiopia', 'Kenya', 'Guatemala',
  'Costa Rica', 'Peru', 'Honduras', 'Nicaragua', 'Mexico',
  'El Salvador', 'Panama', 'Bolivia', 'Ecuador', 'Rwanda',
  'Burundi', 'Tanzania', 'Uganda', 'Vietnam', 'Indonesia'
]

export const PROCESSING_METHODS = [
  'Natural', 'Washed', 'Honey', 'Semi-Washed', 'Wet Hulled',
  'Anaerobic', 'Carbonic Maceration', 'Other'
]

// Micro-origins (regions) by country
export const MICRO_ORIGINS: Record<string, string[]> = {
  'Brazil': [
    'Sul de Minas', 'Cerrado Mineiro', 'Mogiana', 'Alta Mogiana',
    'Matas de Minas', 'Chapada de Minas', 'Mantiqueira de Minas',
    'Norte Pioneiro do Paraná', 'Planalto da Bahia', 'Chapada Diamantina',
    'Espírito Santo', 'Montanhas do Espírito Santo', 'Caparaó',
    'Rio de Janeiro', 'São Paulo', 'Paraná', 'Bahia', 'Rondônia'
  ],
  'Colombia': [
    'Huila', 'Nariño', 'Cauca', 'Tolima', 'Antioquia', 'Santander',
    'Norte de Santander', 'Caldas', 'Quindío', 'Risaralda', 'Valle del Cauca',
    'Cundinamarca', 'Boyacá', 'Meta', 'Caquetá', 'Cesar', 'Magdalena', 'Sierra Nevada'
  ],
  'Ethiopia': [
    'Yirgacheffe', 'Sidamo', 'Guji', 'Limu', 'Djimmah', 'Harrar',
    'Lekempti', 'Kaffa', 'Illubabor', 'Bench Maji', 'Gedeo',
    'Bale', 'West Arsi', 'Shakiso', 'Uraga', 'Gelana Abaya', 'Kochere'
  ],
  'Kenya': [
    'Nyeri', 'Kirinyaga', 'Murang\'a', 'Kiambu', 'Embu', 'Meru',
    'Machakos', 'Nakuru', 'Kisii', 'Bungoma', 'Trans Nzoia',
    'Mt. Kenya', 'Aberdare Range', 'Thika'
  ],
  'Guatemala': [
    'Antigua', 'Huehuetenango', 'Cobán', 'Atitlán', 'Fraijanes',
    'San Marcos', 'Acatenango', 'Nuevo Oriente', 'Volcán de Fuego'
  ],
  'Costa Rica': [
    'Tarrazú', 'West Valley', 'Central Valley', 'Tres Ríos', 'Orosi',
    'Brunca', 'Turrialba', 'Guanacaste'
  ],
  'Peru': [
    'Cajamarca', 'San Martín', 'Amazonas', 'Junín', 'Cusco',
    'Puno', 'Ayacucho', 'Piura', 'Lambayeque', 'Chanchamayo',
    'Jaén', 'San Ignacio', 'Villa Rica', 'Oxapampa'
  ],
  'Honduras': [
    'Copán', 'Montecillos', 'Comayagua', 'Opalaca', 'Agalta',
    'El Paraíso', 'Santa Bárbara', 'Lempira', 'Ocotepeque'
  ],
  'Nicaragua': [
    'Jinotega', 'Matagalpa', 'Nueva Segovia', 'Madriz', 'Estelí',
    'Boaco', 'Carazo', 'Granada'
  ],
  'Mexico': [
    'Chiapas', 'Veracruz', 'Oaxaca', 'Puebla', 'Guerrero',
    'Hidalgo', 'San Luis Potosí', 'Nayarit', 'Colima', 'Jalisco'
  ],
  'El Salvador': [
    'Apaneca-Ilamatepec', 'Alotepec-Metapán', 'El Bálsamo-Quezaltepec',
    'Chichontepec', 'Tecapa-Chinameca', 'Cacahuatique'
  ],
  'Panama': [
    'Boquete', 'Volcán', 'Renacimiento', 'Santa Clara', 'Chiriquí Highlands'
  ],
  'Bolivia': [
    'Yungas', 'Caranavi', 'Coroico', 'Nor Yungas', 'Sud Yungas',
    'Larecaja', 'Bautista Saavedra'
  ],
  'Ecuador': [
    'Loja', 'Zamora-Chinchipe', 'El Oro', 'Pichincha', 'Manabí',
    'Galápagos', 'Imbabura', 'Carchi'
  ],
  'Rwanda': [
    'Nyamasheke', 'Huye', 'Gakenke', 'Rulindo', 'Karongi',
    'Nyamagabe', 'Ngoma', 'Western Province', 'Southern Province'
  ],
  'Burundi': [
    'Kayanza', 'Ngozi', 'Muyinga', 'Kirundo', 'Gitega',
    'Bubanza', 'Bururi', 'Makamba'
  ],
  'Tanzania': [
    'Kilimanjaro', 'Arusha', 'Mbeya', 'Ruvuma', 'Kigoma',
    'Songwe', 'Mbinga', 'Tarime'
  ],
  'Uganda': [
    'Mt. Elgon', 'Rwenzori', 'West Nile', 'Bugisu', 'Bushenyi',
    'Kasese', 'Kapchorwa', 'Sironko'
  ],
  'Vietnam': [
    'Đắk Lắk', 'Lâm Đồng', 'Gia Lai', 'Đắk Nông', 'Kon Tum',
    'Đồng Nai', 'Bình Phước', 'Sơn La', 'Điện Biên'
  ],
  'Indonesia': [
    'Sumatra', 'Aceh', 'Gayo', 'Mandheling', 'Lintong', 'Sidikalang',
    'Java', 'Sulawesi', 'Toraja', 'Flores', 'Bali', 'Papua'
  ]
}
