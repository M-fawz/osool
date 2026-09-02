import { getTranslations } from 'next-intl/server'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'

/**
 * The register's filter bar.
 *
 * A plain `GET` form, and that is the whole design. Three things follow, and
 * all three matter for a screen officials use every day:
 *
 *   · every search has an address, so "the twelve Cairo registrations that
 *     lapse this quarter" is a link somebody can paste into a report;
 *   · the browser's back button walks back through searches, which is what
 *     people actually expect it to do;
 *   · it works with JavaScript unavailable, which is not a hypothetical on a
 *     government network with an aggressive proxy.
 *
 * No debounced live search. Typing three characters and watching the table
 * re-query on every keystroke is pleasant on a fast connection and unusable on
 * a slow one, and it makes the audit trail — which records every search under
 * REQ-DPA-002 — an unreadable stream of prefixes.
 *
 * `page` is deliberately not carried through: changing a filter must land on
 * page one, and the absent field is what makes that happen without any code.
 */
export async function RegisterFilterBar({
  current,
  governorates,
}: {
  current: {
    q: string
    status: string
    category: string
    type: string
    governorate: string
  }
  governorates: Array<{ value: string; label: string }>
}) {
  const t = await getTranslations('register')

  return (
    <Panel>
      <form method="get" className="space-y-4">
        <Field label={t('searchLabel')} htmlFor="register-q" hint={t('searchHint')}>
          <Input
            id="register-q"
            name="q"
            type="search"
            defaultValue={current.q}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('filterStatus')} htmlFor="register-status">
            <Select id="register-status" name="status" defaultValue={current.status}>
              <option value="">{t('filterAny')}</option>
              <option value="ACTIVE">{t('statusACTIVE')}</option>
              <option value="RENEWAL_DUE">{t('statusRENEWAL_DUE')}</option>
              <option value="LAPSED">{t('statusLAPSED')}</option>
              <option value="SUSPENDED">{t('statusSUSPENDED')}</option>
              <option value="CANCELLED">{t('statusCANCELLED')}</option>
            </Select>
          </Field>

          <Field label={t('filterCategory')} htmlFor="register-category">
            <Select id="register-category" name="category" defaultValue={current.category}>
              <option value="">{t('filterAny')}</option>
              {['A', 'B', 'C', 'D'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('filterType')} htmlFor="register-type">
            <Select id="register-type" name="type" defaultValue={current.type}>
              <option value="">{t('filterAny')}</option>
              <option value="SELL">{t('typeSELL')}</option>
              <option value="BUY">{t('typeBUY')}</option>
              <option value="DUAL">{t('typeDUAL')}</option>
              <option value="RENTAL">{t('typeRENTAL')}</option>
            </Select>
          </Field>

          <Field label={t('filterGovernorate')} htmlFor="register-governorate">
            <Select id="register-governorate" name="governorate" defaultValue={current.governorate}>
              <option value="">{t('filterAny')}</option>
              {governorates.map((governorate) => (
                <option key={governorate.value} value={governorate.value}>
                  {governorate.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">{t('applyFilters')}</Button>
          {/* A link, not a reset button: `reset` restores the *rendered*
              defaults, which after a search are the current filters — so the
              control would appear to do nothing. */}
          <a
            href="?"
            className="inline-flex h-9 items-center rounded-xs border border-rule bg-paper px-3.5 text-sm text-ink transition-colors hover:border-rule-strong hover:bg-navy-50"
          >
            {t('clearFilters')}
          </a>
        </div>
      </form>
    </Panel>
  )
}
