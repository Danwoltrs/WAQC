import type { CertificateData } from '@/lib/certificate-data'
import { specialtyLot } from './specialty-lot'

/**
 * The densest commodity certificate the sensory feature can produce: ten
 * attributes, taints, six wheel notes, a regional profile with three notes and
 * a description, and two comment paragraphs. Used by the page-fit test.
 */
export function denseCommoditySensoryLot(): CertificateData {
  const lot = specialtyLot({
    cuppingComments:
      'Standard Santos profile, slightly harsh on the finish. Sweet start with a nutty centre; the cup opens up as it cools.\n\nBody holds through the cool-down, acidity is soft and rounded, and the aftertaste is clean with a short cocoa note.',
    gradingComments: 'Slightly uneven bean size; a few broken beans in the pan fraction.',
    qualitySpec: { name: 'NY 2/3 17/18 FC', template_name: 'Commodity', description: null, is_specialty: false, has_validation: true },
  })
  lot.cuppingData = {
    attributes: ['Fragrance', 'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Uniformity', 'Clean Cup', 'Sweetness', 'Overall']
      .map((n) => ({ name: n, score: 7, allowedMin: 6, allowedMax: 8, scaleMin: 1, scaleMax: 10 })),
    overallScore: 78.5, comments: null, isSpecialty: false, taints: 1, faults: 0,
    taintDetails: [{ name: 'Rioy', intensity: 1, cups_affected: 1 }], faultDetails: [],
    cleanCup: true, uniformCup: true, flavorDescriptor: 'Soft', cvaVerdict: null, cvaDescriptors: null,
    sensory: {
      version: 1,
      notes: [
        ['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Nutty/Cocoa', 'Nutty', 'Hazelnut'], ['Nutty/Cocoa', 'Nutty', 'Almond'],
        ['Sweet', 'Brown Sugar', 'Caramelized'], ['Sweet', 'Vanilla'], ['Sweet', 'Brown Sugar', 'Molasses'],
      ],
      profile: {
        id: 'profile-cerrado', name: 'Cerrado Mineiro', region: 'Minas Gerais',
        notes: [['Nutty/Cocoa', 'Cocoa', 'Chocolate'], ['Sweet', 'Brown Sugar', 'Caramelized'], ['Nutty/Cocoa', 'Nutty', 'Hazelnut']],
        description: 'Chocolate and caramel sweetness with a nutty finish and a round, medium body.',
        match: true,
      },
      resolved_by: null, resolved_at: '2026-11-13T00:00:00Z', source: 'validation',
    },
  }
  return lot
}
