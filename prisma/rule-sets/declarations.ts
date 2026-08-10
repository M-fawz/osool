import type { RuleSetDefinition } from './types'

/**
 * DECLARATIONS — REQ-REG-040.
 * Source forms: GOEIC CR-CA-QR-07-31 (sole trader) and cr-ca-QR 07-030
 * (companies). REQ-REG-041 adds the power-of-attorney declaration on form
 * CR-CA-QR7-17.
 *
 * Each of the fifteen is a discrete, individually recorded assertion — not one
 * blanket checkbox — because each is independently falsifiable and
 * independently cross-checkable against other data the register holds.
 *
 * ── On the wording ─────────────────────────────────────────────────────────
 * 01-LEGAL-REFERENCE.md carries these declarations as English summaries; it
 * does not reproduce the Arabic as printed on the GOEIC forms. The Arabic
 * below is therefore a *working rendering* written for this system, not a
 * transcription of the official form, and every item is marked
 * `wordingStatus: 'WORKING_TRANSLATION'` to say so in the data itself.
 *
 * This matters more than usual here. The applicant is signing a binding
 * declaration with criminal exposure behind it; the wording they assert must
 * eventually be the wording the Authority printed. Replacing these strings
 * with the exact form text is a rule-set version bump — new version, new
 * effective date, no code change, and every declaration already asserted stays
 * bound to the wording that was actually shown at the time.
 */

const WORKING = 'WORKING_TRANSLATION' as const

export const declarations: RuleSetDefinition = {
  code: 'DECLARATIONS',
  version: 1,
  description: 'The fifteen binding declarations signed by a registration applicant.',
  legalSource: 'GOEIC forms CR-CA-QR-07-31 and cr-ca-QR 07-030',
  requirementIds: ['REQ-REG-040', 'REQ-REG-041'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'), // form issue 4, 1/6/2020
  effectiveTo: null,

  items: [
    {
      key: 'DECL-01',
      position: 1,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأنني لست عضواً بمجلس النواب أو مجلس الشيوخ أو أي مجلس محلي، ولا أتفرغ للعمل السياسي، وأتعهد بإخطار الجهة فور حدوث ذلك.',
        textEn:
          'I declare that I am not a member of the House of Representatives, the Senate, or any local council, and that I am not engaged full-time in political work. I undertake to notify the Authority upon becoming so.',
        crossCheckable: true,
        notifyOnChange: true,
      },
    },
    {
      key: 'DECL-02',
      position: 2,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأنني لا أشغل وظيفة في أي جهة حكومية أو هيئة من القطاع العام، وأتعهد بإخطار الجهة عند شغلي لأي منها، وبأنني لم أترك الخدمة الحكومية بالاستقالة أو لأسباب تأديبية خلال السنتين السابقتين.',
        textEn:
          'I declare that I hold no position in any government body or public-sector entity, and undertake to notify the Authority upon taking one. I have not left government service by resignation or for disciplinary reasons within the preceding two years.',
        crossCheckable: true,
        notifyOnChange: true,
        /// The company form exempts public-sector companies from this condition.
        exemptionNote: 'Public-sector companies are exempt from this condition in the company form.',
      },
    },
    {
      key: 'DECL-03',
      position: 3,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأنني غير مدرج على قوائم الإرهاب، وأنه لم يسبق شهر إفلاسي (ولا إفلاس الشركة)، وأنني محمود السيرة حسن السمعة، ولم يصدر ضدي حكم بعقوبة جناية أو بعقوبة مقيدة للحرية في جريمة مخلة بالشرف أو الأمانة، أو في جريمة منصوص عليها في القانون ١٢٠ لسنة ١٩٨٢ أو في قوانين الاستيراد والتصدير أو النقد أو الجمارك أو الضرائب أو التموين أو الشركات أو التجارة، ما لم أكن قد رُدَّ إليّ اعتباري.',
        textEn:
          'I declare that I am not listed on terrorism lists; that I have never been adjudicated bankrupt (nor has the company); that I am of good repute; and that I have no criminal conviction or custodial sentence for a crime involving honour or trust, or under Law 120/1982, or the import/export, currency, customs, tax, supply, companies, or trade laws — unless rehabilitated.',
        crossCheckable: true,
        relatedRequirements: ['REQ-CDD-016', 'REQ-CDD-017'],
      },
    },
    {
      key: 'DECL-04',
      position: 4,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأنه ليس لي قريب من الدرجة الأولى من شاغلي المناصب السياسية أو أعضاء المجالس النيابية أو المحلية أو من العاملين بدرجة مدير عام فأعلى ممن يشتركون في لجان البت أو الشراء أو البيع، وأتعهد بالإخطار حال تغير ذلك.',
        textEn:
          'I declare that I have no first-degree relative among holders of political office, members of national or local representative councils, or officials at director-general level or above serving on award, procurement, or sale committees. I undertake to notify the Authority if that changes.',
        crossCheckable: true,
        notifyOnChange: true,
      },
    },
    {
      key: 'DECL-05',
      position: 5,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أتعهد بإخطار الجهة بأي تغيير في بيانات المنشأة أو في أي عقد وساطة مقيد خلال ثلاثين يوماً.',
        textEn:
          'I undertake to notify the Authority of any change to entity data or to any registered brokerage contract within thirty days.',
        obligationDays: 30,
        relatedRequirements: ['REQ-REG-062'],
      },
    },
    {
      key: 'DECL-06',
      position: 6,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أتعهد بقيد أي عقد جديد قبل مباشرة أي عمل بمقتضاه، وبإخطار الجهة خلال ثلاثين يوماً من التوقف عن النشاط كلياً أو جزئياً بشأن أي عقد.',
        textEn:
          'I undertake to register any new contract before practising any work under it, and to notify the Authority within thirty days of ceasing activity wholly or partially in respect of a contract.',
        obligationDays: 30,
        relatedRequirements: ['REQ-REG-063', 'REQ-REG-064'],
      },
    },
    {
      key: 'DECL-07',
      position: 7,
      payload: {
        wordingStatus: WORKING,
        textAr: 'أتعهد بإثبات رقم القيد على جميع الأوراق والمكاتبات الصادرة عني.',
        textEn:
          'I undertake to state the registration number on all papers and correspondence.',
        relatedRequirements: ['REQ-REG-061'],
      },
    },
    {
      key: 'DECL-08',
      position: 8,
      payload: {
        wordingStatus: WORKING,
        textAr: 'أتعهد بعدم مزاولة أي عمل من أعمال الوساطة بعد زوال أي شرط من شروط القيد.',
        textEn:
          'I undertake not to practise any brokerage work after any registration condition ceases to be met.',
        relatedRequirements: ['REQ-REG-065'],
      },
    },
    {
      key: 'DECL-09',
      position: 9,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أتعهد بأن تمسك المنشأة دفاتر منتظمة تتضمن بيانات صحيحة، تُقيَّد فيها العمولات المستحقة والبنوك المودعة لديها.',
        textEn:
          'I undertake that the entity keeps regular books containing accurate data, recording commissions due and the banks holding them.',
      },
    },
    {
      key: 'DECL-10',
      position: 10,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأن الوكيل مقدم الطلب ليس من العاملين بالحكومة أو القطاع العام، أو أُحدد جهة عمله وأوافق على إخطارها.',
        textEn:
          'I declare that the agent submitting the application is not a government or public-sector employee, or I identify the employer and consent to that employer being notified.',
        /// The qualification field on Declaration captures the named employer.
        requiresQualificationWhenNegative: true,
      },
    },
    {
      key: 'DECL-11',
      position: 11,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أتعهد بإخطار مصلحة الضرائب بجميع المبالغ المدفوعة عن أي عمل من أعمال الوساطة خلال ثلاثين يوماً من السداد.',
        textEn:
          'I undertake to notify the Tax Authority of all sums paid for any brokerage work within thirty days of payment.',
        obligationDays: 30,
      },
    },
    {
      key: 'DECL-12',
      position: 12,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بإلمامي الكافي بأحكام القانون ١٢٠ لسنة ١٩٨٢ والقرار ٣٤٢ لسنة ١٩٨٢ وتعديلاتهما.',
        textEn:
          'I declare sufficient knowledge of Law 120/1982 and Decree 342/1982 and their amendments.',
      },
    },
    {
      key: 'DECL-13',
      position: 13,
      payload: {
        wordingStatus: WORKING,
        textAr: 'أقر بصحة ترجمة العقود الأجنبية المقدمة أو التي ستُقدَّم.',
        textEn:
          'I declare the accuracy of translations of foreign contracts submitted or to be submitted.',
      },
    },
    {
      key: 'DECL-14',
      position: 14,
      payload: {
        wordingStatus: WORKING,
        textAr: 'أقر باستلام نسخة إضافية من التعهدات.',
        textEn: 'I confirm receipt of an additional copy of the undertakings.',
      },
    },
    {
      key: 'DECL-15',
      position: 15,
      payload: {
        wordingStatus: WORKING,
        textAr:
          'أقر بأن جميع البيانات والمستندات المقدمة سليمة وصحيحة، وذلك تحت مسؤوليتي الكاملة.',
        textEn:
          'I declare that all data and documents submitted are sound and correct, under my full responsibility.',
      },
    },
  ],
}
