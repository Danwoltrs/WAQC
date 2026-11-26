import { describe, expect, it } from 'vitest'
import { decideCompanyMatch, longestNameToken, nameTokensPattern, normalizeCompanyName, type MatchCandidate } from './match'

const c = (over: Partial<MatchCandidate> & { id: string; name: string }): MatchCandidate => ({
  fantasy_name: null, document_cnpj: null, vat_number: null, ...over,
})

describe('normalizeCompanyName', () => {
  it('lowercases, strips accents and punctuation, collapses spaces and drops trailing legal suffixes', () => {
    expect(normalizeCompanyName('AHOLD DELHAIZE COFFEE COMPANY B.V.')).toBe('ahold delhaize coffee company')
    expect(normalizeCompanyName('  Ahold   Delhaize Coffee Company BV ')).toBe('ahold delhaize coffee company')
    expect(normalizeCompanyName('Café Brasileiro S/A')).toBe('cafe brasileiro')
    expect(normalizeCompanyName('Café Brasileiro S.A.')).toBe('cafe brasileiro')
    expect(normalizeCompanyName('Comércio de Café Ltda.')).toBe('comercio de cafe')
    expect(normalizeCompanyName('Kaffee Röster GmbH')).toBe('kaffee roster')
    expect(normalizeCompanyName('Smith & Sons, Inc.')).toBe('smith sons')
    expect(normalizeCompanyName('Blue Bottle LLC')).toBe('blue bottle')
    expect(normalizeCompanyName('Tokyo Coffee Co. Ltd')).toBe('tokyo coffee co')
  })

  it('keeps a suffix word inside the name, and empty input stays empty', () => {
    expect(normalizeCompanyName('Fazenda Sá Ribeiro')).toBe('fazenda sa ribeiro')
    expect(normalizeCompanyName('')).toBe('')
    expect(normalizeCompanyName(null)).toBe('')
    expect(normalizeCompanyName('---')).toBe('')
  })
})

describe('longestNameToken / nameTokensPattern', () => {
  it('picks the longest normalized token, the first on a tie', () => {
    expect(longestNameToken('Ahold Delhaize Coffee Company B.V.')).toBe('delhaize')
    expect(longestNameToken('Café Brasil Ltda')).toBe('brasil')
    expect(longestNameToken('abc def')).toBe('abc')
    expect(longestNameToken('S.A.')).toBe('sa')
    expect(longestNameToken('...')).toBeNull()
  })

  it('joins every token in order, for a selective ilike', () => {
    expect(nameTokensPattern('Ahold Delhaize Coffee Company B.V.')).toBe('%ahold%delhaize%coffee%company%')
    expect(nameTokensPattern('')).toBeNull()
  })
})

describe('decideCompanyMatch', () => {
  it('links on equal tax-id digits, formatted or bare', () => {
    expect(
      decideCompanyMatch({ name: 'Ahold', taxId: '12.345.678/0001-90' }, [c({ id: 'a', name: 'Something else', document_cnpj: '12345678000190' })]),
    ).toEqual({ kind: 'link', companyId: 'a' })
  })

  it('links on a tax id stored in vat_number', () => {
    expect(
      decideCompanyMatch({ name: 'Cafe Colombia', taxId: '900.123.456-7' }, [c({ id: 'n', name: 'Other', vat_number: '9001234567' })]),
    ).toEqual({ kind: 'link', companyId: 'n' })
  })

  it('links one candidate whose normalized name is equal', () => {
    expect(
      decideCompanyMatch(
        { name: 'AHOLD DELHAIZE COFFEE COMPANY B.V.', taxId: null },
        [c({ id: 'a', name: 'Ahold Delhaize Coffee Company BV' }), c({ id: 'x', name: 'Ahold Delhaize Coffee Trading' })],
      ),
    ).toEqual({ kind: 'link', companyId: 'a' })
  })

  it('matches the name against the candidate fantasy name too', () => {
    expect(
      decideCompanyMatch({ name: 'Ahold', taxId: null }, [c({ id: 'a', name: 'Ahold Delhaize Coffee Company BV', fantasy_name: 'Ahold' })]),
    ).toEqual({ kind: 'link', companyId: 'a' })
  })

  it('creates when two candidates have the same normalized name', () => {
    expect(
      decideCompanyMatch(
        { name: 'Ahold Delhaize', taxId: null },
        [c({ id: 'a', name: 'Ahold Delhaize' }), c({ id: 'b', name: 'AHOLD DELHAIZE B.V.' })],
      ),
    ).toEqual({ kind: 'create' })
  })

  it('creates when the name is the same but the CNPJ differs', () => {
    expect(
      decideCompanyMatch(
        { name: 'Ahold Delhaize', taxId: '11.222.333/0001-81' },
        [c({ id: 'a', name: 'Ahold Delhaize', document_cnpj: '12.345.678/0001-90' })],
      ),
    ).toEqual({ kind: 'create' })
  })

  it('links by name when only the candidate has no tax id, or only the input has none', () => {
    expect(
      decideCompanyMatch({ name: 'Ahold Delhaize', taxId: '11.222.333/0001-81' }, [c({ id: 'a', name: 'Ahold Delhaize' })]),
    ).toEqual({ kind: 'link', companyId: 'a' })
    expect(
      decideCompanyMatch({ name: 'Ahold Delhaize', taxId: null }, [c({ id: 'a', name: 'Ahold Delhaize', document_cnpj: '12.345.678/0001-90' })]),
    ).toEqual({ kind: 'link', companyId: 'a' })
  })

  it('several companies with the tax id: the name decides, otherwise create', () => {
    const twins = [
      c({ id: 'a', name: 'Ahold Delhaize', document_cnpj: '12.345.678/0001-90' }),
      c({ id: 'b', name: 'Ahold Coffee', document_cnpj: '12345678000190' }),
    ]
    expect(decideCompanyMatch({ name: 'Ahold Coffee', taxId: '12345678000190' }, twins)).toEqual({ kind: 'link', companyId: 'b' })
    expect(decideCompanyMatch({ name: 'Ahold', taxId: '12345678000190' }, twins)).toEqual({ kind: 'create' })
  })

  it('counts a candidate returned twice once', () => {
    const a = c({ id: 'a', name: 'Ahold Delhaize' })
    expect(decideCompanyMatch({ name: 'Ahold Delhaize', taxId: null }, [a, { ...a }])).toEqual({ kind: 'link', companyId: 'a' })
  })

  it('ignores a tax id too short to identify a company', () => {
    expect(
      decideCompanyMatch({ name: 'New Co', taxId: '123' }, [c({ id: 'a', name: 'Old Co', vat_number: '123' })]),
    ).toEqual({ kind: 'create' })
  })

  it('creates with no candidates, or when the name normalizes to nothing', () => {
    expect(decideCompanyMatch({ name: 'Ahold', taxId: null }, [])).toEqual({ kind: 'create' })
    expect(decideCompanyMatch({ name: '...', taxId: null }, [c({ id: 'a', name: '!!!' })])).toEqual({ kind: 'create' })
  })
})
