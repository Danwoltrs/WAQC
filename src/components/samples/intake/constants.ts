import { Step } from './types'

export const STEPS: Step[] = [
  { id: 1, name: 'Basic Info', description: 'Sample identification and origin' },
  { id: 2, name: 'Tracking Numbers', description: 'Contract and shipment details' },
  { id: 3, name: 'Quantity', description: 'Bag quantities and specifications' },
  { id: 4, name: 'Sample Details', description: 'Arrival and additional information' }
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
