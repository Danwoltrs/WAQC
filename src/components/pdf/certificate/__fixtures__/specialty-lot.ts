/**
 * Certificate fixtures for render tests: a specialty (CVA) lot as it reached
 * the printed page on 2026-09-17 (SAN-00940/26, Blaser / Ipanema), and the
 * descriptor set that fills all four flavour-wheel groups.
 */
import type { CertificateData, CuppingAttribute } from '@/lib/certificate-data'

export const attr = (name: string, score = 6): CuppingAttribute => ({
  name, score, allowedMin: null, allowedMax: null, scaleMin: 1, scaleMax: 9,
})
export const defect = (name: string, rawCount: number, weight: number) => ({
  name, rawCount, weight, weightedCount: rawCount * weight,
})
export const party = (name: string | null, country = 'Brazil', contract: string | null = null) => ({
  id: null, name, country, contract, address: null,
})

// The lot behind the report: SAN-00940/26 (Blaser / Ipanema), scored 85.5
// against a minimum of 84, a two-line quality description, four screens, four
// secondary defects, chocolate and cocoa on both wheels, no comments.
export function specialtyLot(over: Partial<CertificateData> = {}): CertificateData {
  return {
    sample: {
      id: 's-940', lab_source_sample_id: null, tracking_number: 'SAN-00940/26', origin: 'Brazil',
      origin_display: 'Brazil', micro_origin: 'Sul de Minas', sample_type: 'pss', processing_method: 'Washed',
      quality_name: "Brazilian Washed Coffee from 'Capoeirinha Farm' - Sul de Minas NY 2, Screen 16/18, S. Soft, Fine Cup, Fine Roast, Greenish, EUDR, Crop 26/27",
      bags: 320, bag_type: 'jute_bag', bag_weight_kg: 60, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320,
      container_count: null, shipment_month: '2026-10', ico_number: '002/1234/5678', container_nr: null,
      exporter_sample_number: 'IPA-2026-0107', created_at: '2026-09-10T12:00:00Z', status: 'approved',
      certifications: ['EUDR', 'Rainforest Alliance'], crop_year: '26/27',
    },
    supplyChain: {
      supplier: party('Capoeirinha Farm'),
      exporter: party('Ipanema', 'Brazil', '027/26'),
      shipper: party(null),
      importer: party('Blaser', 'Switzerland', '107048'),
      roaster: party('Blaser Café AG', 'Switzerland'),
      endClient: party(null),
      qcClient: party('Blaser', 'Switzerland'),
      wolthersContract: '42611/26',
    },
    client: {
      id: 'co-blaser', name: 'Blaser Trading AG', company: 'Blaser', fantasy_name: 'Blaser', logo_url: null,
      certificate_validity_enabled: false, certificate_validity_months: null, client_types: ['importer'],
    },
    laboratory: {
      id: 'lab-1', name: 'WOLTHERS & ASSOCIATES CORRETORA DE MERCADORIAS LTDA', location: 'Santos, Brazil',
      address: 'Rua XV de Novembro, 96', city: 'Santos', state: 'SP', country: 'Brazil', vat_number: '58.148.232/0001-06',
    },
    greenBeanAnalysis: {
      moisture_percentage: 11.8, density: null, humidity: null, green_aspect: 'Greenish',
      screen_sizes: null, issued: false,
      screen_percentages: { '18': 17, '17': 60, '16': 21, 'B': 2 },
      defects: {
        primary: [],
        secondary: [
          defect('Broken', 15, 0.2), defect('Bad Formed', 5, 0.2),
          defect('Unripe/Immature', 5, 0.2), defect('Minor Broca', 5, 0.1),
        ],
        total_primary: 0, total_secondary: 5.5,
      },
    },
    roastAnalysis: { agtron_score: null, quaker_count: null, roast_date: null, roast_level: null, roast_aspect: 'Fine' },
    cuppingData: {
      attributes: ['Fragrance', 'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall'].map((n) => attr(n)),
      overallScore: 85.5, comments: null, isSpecialty: true, taints: null, faults: null,
      taintDetails: [], faultDetails: [], cleanCup: null, uniformCup: null, flavorDescriptor: null,
      cvaVerdict: { minScore: 84, passed: true },
      cvaDescriptors: {
        aroma: ['Chocolate', 'Cocoa'], flavor: ['Chocolate', 'Cocoa'], mouthfeel: ['Smooth'], mainTastes: [],
        paths: [['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Nutty/Cocoa', 'Cocoa']],
      },
    },
    cuppingComments: null,
    gradingComments: null,
    certificate: {
      id: 'cert-940', certificate_number: 'SAN-00940/26', issued_date: '2026-09-16', valid_until: null,
      status: 'issued', override_comment: null, is_rejected: false,
    },
    qualitySpec: { name: 'Specialty 84+', template_name: 'CVA Specialty', description: null, is_specialty: true, has_validation: true },
    specLimits: {
      moisture_max: 12.5,
      screen_size_constraints: [{ screen_size: '16', constraint_type: 'minimum', min_value: 90 }],
    },
    ...over,
  }
}

export const fourGroups = {
  aroma: ['Chocolate', 'Cocoa', 'Brown Sugar', 'Caramelized', 'Vanilla', 'Molasses', 'Hazelnut'],
  flavor: ['Chocolate', 'Cocoa', 'Dark Chocolate', 'Nutty', 'Almond', 'Red Apple', 'Citrus Fruit', 'Honey'],
  // The describe form allows two mouthfeel options (types/cva.ts).
  mouthfeel: ['Smooth', 'Mouth-Drying'],
  mainTastes: ['Sweet', 'Sour'],
  paths: [
    ['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Nutty/Cocoa', 'Cocoa', 'Dark Chocolate'], ['Nutty/Cocoa', 'Nutty', 'Almond'],
    ['Nutty/Cocoa', 'Nutty', 'Hazelnut'], ['Sweet', 'Brown Sugar', 'Caramelized'], ['Sweet', 'Brown Sugar', 'Molasses'],
    ['Sweet', 'Vanilla'], ['Fruity', 'Other Fruit', 'Apple'], ['Fruity', 'Citrus Fruit', 'Orange'], ['Sweet', 'Brown Sugar', 'Honey'],
  ],
}
