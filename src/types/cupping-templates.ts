import { AttributeScaleType } from './attribute-scales'

export interface AttributeWithScale {
  attribute: string
  scale: AttributeScaleType
}

export interface CuppingAttributeTemplate {
  id: string
  name: string
  description: string
  attributes: AttributeWithScale[]
}

// SCA (Specialty Coffee Association) Standard Cupping Form
const SCA_TEMPLATE: CuppingAttributeTemplate = {
  id: 'sca-standard',
  name: 'SCA Standard',
  description: 'Specialty Coffee Association cupping protocol',
  attributes: [
    {
      attribute: 'Fragrance/Aroma',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Flavor',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Aftertaste',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Acidity',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Body',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Balance',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    },
    {
      attribute: 'Uniformity',
      scale: { type: 'numeric', min: 0, max: 10, increment: 2 }
    },
    {
      attribute: 'Clean Cup',
      scale: { type: 'numeric', min: 0, max: 10, increment: 2 }
    },
    {
      attribute: 'Sweetness',
      scale: { type: 'numeric', min: 0, max: 10, increment: 2 }
    },
    {
      attribute: 'Overall',
      scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }
    }
  ]
}

// COE (Cup of Excellence) Cupping Form
const COE_TEMPLATE: CuppingAttributeTemplate = {
  id: 'coe-standard',
  name: 'COE Standard',
  description: 'Cup of Excellence cupping protocol',
  attributes: [
    {
      attribute: 'Clean Cup',
      scale: { type: 'numeric', min: 0, max: 8, increment: 2 }
    },
    {
      attribute: 'Sweetness',
      scale: { type: 'numeric', min: 0, max: 8, increment: 2 }
    },
    {
      attribute: 'Acidity',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    },
    {
      attribute: 'Mouthfeel',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    },
    {
      attribute: 'Flavor',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    },
    {
      attribute: 'Aftertaste',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    },
    {
      attribute: 'Balance',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    },
    {
      attribute: 'Overall',
      scale: { type: 'numeric', min: 0, max: 8, increment: 0.25 }
    }
  ]
}

// Brazil Traditional (Classic Brazilian Cupping with Numeric)
const BRAZIL_TRADITIONAL_TEMPLATE: CuppingAttributeTemplate = {
  id: 'brazil-traditional',
  name: 'Brazil Traditional (Numeric)',
  description: 'Classic Brazilian coffee cupping with numeric scales',
  attributes: [
    {
      attribute: 'Bebida (Beverage)',
      scale: {
        type: 'wording',
        options: [
          { label: 'Strictly Soft', value: 10, display_order: 0 },
          { label: 'Soft', value: 9, display_order: 1 },
          { label: 'Softish', value: 8, display_order: 2 },
          { label: 'Hard', value: 7, display_order: 3 },
          { label: 'Rioy', value: 6, display_order: 4 },
          { label: 'Rio', value: 5, display_order: 5 }
        ]
      }
    },
    {
      attribute: 'Fragrance/Aroma',
      scale: { type: 'numeric', min: 1, max: 7, increment: 0.5 }
    },
    {
      attribute: 'Flavor',
      scale: { type: 'numeric', min: 1, max: 7, increment: 0.5 }
    },
    {
      attribute: 'Acidity',
      scale: { type: 'numeric', min: 1, max: 7, increment: 0.5 }
    },
    {
      attribute: 'Body',
      scale: { type: 'numeric', min: 1, max: 7, increment: 0.5 }
    },
    {
      attribute: 'Balance',
      scale: { type: 'numeric', min: 1, max: 7, increment: 0.5 }
    }
  ]
}

// Brazil Wording (Brazilian Cupping with Wording Scales)
const BRAZIL_WORDING_TEMPLATE: CuppingAttributeTemplate = {
  id: 'brazil-wording',
  name: 'Brazil Wording',
  description: 'Brazilian coffee cupping with wording-based scales (7-level for attributes, 10-level for Flavor)',
  attributes: [
    {
      attribute: 'Fragrance/Aroma',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    },
    {
      attribute: 'Flavor',
      scale: {
        type: 'wording',
        options: [
          { label: 'Special', value: 10, display_order: 0 },
          { label: 'S.Soft', value: 9, display_order: 1 },
          { label: 'Soft', value: 8, display_order: 2 },
          { label: 'Softish', value: 7, display_order: 3 },
          { label: 'Hard', value: 6, display_order: 4 },
          { label: 'Hardish', value: 5, display_order: 5 },
          { label: 'Rioy', value: 4, display_order: 6 },
          { label: 'Rioy/Rio', value: 3, display_order: 7 },
          { label: 'Rio', value: 2, display_order: 8 },
          { label: 'Strong Rio', value: 1, display_order: 9 }
        ]
      }
    },
    {
      attribute: 'Aftertaste',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    },
    {
      attribute: 'Acidity',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    },
    {
      attribute: 'Body',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    },
    {
      attribute: 'Balance',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    },
    {
      attribute: 'Overall',
      scale: {
        type: 'wording',
        options: [
          { label: 'Outstanding', value: 7, display_order: 0 },
          { label: 'Excellent', value: 6, display_order: 1 },
          { label: 'Very Good', value: 5, display_order: 2 },
          { label: 'Good', value: 4, display_order: 3 },
          { label: 'Fair', value: 3, display_order: 4 },
          { label: 'Below Average', value: 2, display_order: 5 },
          { label: 'Poor', value: 1, display_order: 6 }
        ]
      }
    }
  ]
}

// Simple 5-Point Scale Template
const SIMPLE_5_POINT_TEMPLATE: CuppingAttributeTemplate = {
  id: 'simple-5-point',
  name: 'Simple 5-Point',
  description: 'Basic 5-point scale for quick evaluations',
  attributes: [
    {
      attribute: 'Aroma',
      scale: { type: 'numeric', min: 1, max: 5, increment: 0.5 }
    },
    {
      attribute: 'Flavor',
      scale: { type: 'numeric', min: 1, max: 5, increment: 0.5 }
    },
    {
      attribute: 'Acidity',
      scale: { type: 'numeric', min: 1, max: 5, increment: 0.5 }
    },
    {
      attribute: 'Body',
      scale: { type: 'numeric', min: 1, max: 5, increment: 0.5 }
    },
    {
      attribute: 'Overall',
      scale: { type: 'numeric', min: 1, max: 5, increment: 0.5 }
    }
  ]
}

export const CUPPING_ATTRIBUTE_TEMPLATES: CuppingAttributeTemplate[] = [
  SCA_TEMPLATE,
  COE_TEMPLATE,
  BRAZIL_TRADITIONAL_TEMPLATE,
  BRAZIL_WORDING_TEMPLATE,
  SIMPLE_5_POINT_TEMPLATE
]
