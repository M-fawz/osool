import type { BrokerCategory, BrokerType, Governorate } from '@prisma/client'

/**
 * The demonstration population.
 *
 * Every name, address, and number here is plausible Egyptian data rather than
 * Lorem Ipsum, because the audience for the demonstration will notice. Trade
 * names follow the conventions real Egyptian brokerage firms use; personal
 * names are ordinary Egyptian names with correct Latin transliterations;
 * addresses are real streets in Cairo and Giza; commercial register numbers are
 * five or six digits as the register issues them, and tax numbers are the
 * nine-digit `xxx-xxx-xxx` the tax card prints.
 *
 * National ID numbers are structurally valid: century digit, YYMMDD, a
 * governorate code in range, a four-digit serial, and a check digit — so they
 * pass `checkNationalIdStructure` exactly as a real card would. They belong to
 * nobody: the birth dates and serials are invented.
 *
 * The capital figures are chosen to sit across all four categories, and one of
 * them — Delta Misr — deliberately requests Category C on EGP 30,000, which is
 * below the EGP 50,000 floor. That is the refusal in the Phase 1 proof point,
 * and it has to be demonstrable rather than described.
 */

export interface DemoBroker {
  /** Sign-in address. `.test` never resolves, so no mail can escape. */
  email: string
  ownerNameEn: string
  ownerNameAr: string
  nationalId: string
  tradeNameAr: string
  tradeNameEn: string
  tradeStyleAr: string | null
  legalForm: string | null
  establishmentType: 'NATURAL_PERSON' | 'LEGAL_PERSON'
  capacity: 'SOLE_TRADER' | 'CHAIRMAN' | 'RESPONSIBLE_MANAGER' | 'GENERAL_PARTNER' | 'AGENT_UNDER_POA'
  address: string
  governorate: Governorate
  telephone: string
  poBox: string | null
  commercialRegisterNo: string
  commercialRegisterOffice: string
  commercialRegisterDate: string
  commercialRegisterRenewalDate: string
  taxRegistrationNo: string
  taxOffice: string
  capital: number
  category: BrokerCategory
  types: BrokerType[]
  poa?: { number: string; year: number; office: string; type: 'GENERAL' | 'SPECIAL' }
  contract: {
    clientNameAr: string
    clientNameEn: string
    nationality: string
    authenticationBody: 'REAL_ESTATE_PUBLICITY' | 'EMBASSY' | 'CONSULATE'
    authenticationNumber: string
    validFrom: string
    validTo: string
    capacityActedIn: BrokerType
    value: number | null
    subjectDescription: string
    subjectAddress: string
    governorate: Governorate
  }
  /** How far this file should be walked through REQ-REG-050. */
  stage:
    | 'DRAFT_INCOMPLETE'
    | 'DRAFT_CAPITAL_SHORTFALL'
    | 'SUBMITTED'
    | 'UNDER_INTAKE'
    | 'UNDER_EXAMINATION'
    | 'AWAITING_COMPLETION'
    | 'UNDER_REVIEW'
    | 'APPROVED'
    | 'AWAITING_PAYMENT'
    | 'CARD_ISSUED'
    | 'ACTIVE'
    | 'REJECTED'
}

export const DEMO_BROKERS: DemoBroker[] = [
  {
    email: 'broker@osool.test',
    ownerNameEn: 'Mahmoud Abdelrahman Hassan',
    ownerNameAr: 'محمود عبد الرحمن حسن',
    nationalId: '28501120123456',
    tradeNameAr: 'مؤسسة الأصالة للوساطة العقارية',
    tradeNameEn: 'Al-Asala Real Estate Brokerage',
    tradeStyleAr: 'الأصالة',
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '١٢ شارع التسعين الشمالي، التجمع الخامس، القاهرة الجديدة',
    governorate: 'CAIRO',
    telephone: '01001234567',
    poBox: '11835',
    commercialRegisterNo: '128476',
    commercialRegisterOffice: 'مكتب سجل تجاري القاهرة الجديدة',
    commercialRegisterDate: '2021-03-14',
    commercialRegisterRenewalDate: '2026-03-14',
    taxRegistrationNo: '512-846-397',
    taxOffice: 'مأمورية ضرائب مصر الجديدة',
    capital: 75_000,
    category: 'C',
    types: ['SELL', 'RENTAL'],
    contract: {
      clientNameAr: 'شركة أوراسكوم للتنمية العقارية',
      clientNameEn: 'Orascom Real Estate Development',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '4471/2026',
      validFrom: '2026-02-01',
      validTo: '2027-01-31',
      capacityActedIn: 'SELL',
      value: 8_500_000,
      subjectDescription: 'وحدات سكنية بالمرحلة الثالثة من مشروع الياسمين، مساحات من ١٢٠ إلى ٢١٠ متر مربع',
      subjectAddress: 'قطعة ٣٤، المنطقة الأولى، التجمع الخامس، القاهرة الجديدة',
      governorate: 'CAIRO',
    },
    stage: 'DRAFT_INCOMPLETE',
  },
  {
    email: 'nile@osool.test',
    ownerNameEn: 'Nadia Selim Abdelaziz',
    ownerNameAr: 'نادية سليم عبد العزيز',
    nationalId: '27803152167891',
    tradeNameAr: 'شركة النيل للتسويق العقاري',
    tradeNameEn: 'Nile Real Estate Marketing',
    tradeStyleAr: 'النيل العقارية',
    legalForm: 'شركة ذات مسؤولية محدودة',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'CHAIRMAN',
    address: '٤٥ شارع جامعة الدول العربية، المهندسين، الجيزة',
    governorate: 'GIZA',
    telephone: '0233456789',
    poBox: '12411',
    commercialRegisterNo: '94512',
    commercialRegisterOffice: 'مكتب سجل تجاري الجيزة',
    commercialRegisterDate: '2019-09-02',
    commercialRegisterRenewalDate: '2029-09-02',
    taxRegistrationNo: '338-215-704',
    taxOffice: 'مأمورية ضرائب الدقي',
    capital: 1_500_000,
    category: 'A',
    types: ['SELL', 'BUY', 'DUAL'],
    contract: {
      clientNameAr: 'شركة مصر الجديدة للإسكان والتعمير',
      clientNameEn: 'Heliopolis Housing and Development',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '2210/2026',
      validFrom: '2026-01-15',
      validTo: '2028-01-14',
      capacityActedIn: 'DUAL',
      value: 145_000_000,
      subjectDescription: 'أراضٍ ووحدات تجارية بمشروع هليوبوليس الجديدة، الحي السادس',
      subjectAddress: 'الحي السادس، هليوبوليس الجديدة، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'SUBMITTED',
  },
  {
    email: 'newcairo@osool.test',
    ownerNameEn: 'Tarek El Gindy Mahmoud',
    ownerNameAr: 'طارق الجندي محمود',
    nationalId: '29011051287654',
    tradeNameAr: 'شركة القاهرة الجديدة للاستثمار العقاري',
    tradeNameEn: 'New Cairo Real Estate Investment',
    tradeStyleAr: null,
    legalForm: 'شركة مساهمة مصرية',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'RESPONSIBLE_MANAGER',
    address: '٨ شارع مصدق، الدقي، الجيزة',
    governorate: 'GIZA',
    telephone: '0237601122',
    poBox: null,
    commercialRegisterNo: '203881',
    commercialRegisterOffice: 'مكتب سجل تجاري وسط القاهرة',
    commercialRegisterDate: '2020-11-23',
    commercialRegisterRenewalDate: '2030-11-23',
    taxRegistrationNo: '667-902-118',
    taxOffice: 'مأمورية ضرائب استثمار القاهرة',
    capital: 600_000,
    category: 'B',
    types: ['SELL', 'BUY'],
    contract: {
      clientNameAr: 'المجموعة المصرية للتطوير العقاري',
      clientNameEn: 'Egyptian Property Development Group',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '1908/2026',
      validFrom: '2026-03-01',
      validTo: '2027-02-28',
      capacityActedIn: 'SELL',
      value: 62_000_000,
      subjectDescription: 'عمارات سكنية بمنطقة النرجس، التجمع الخامس',
      subjectAddress: 'النرجس عمارات، التجمع الخامس، القاهرة الجديدة',
      governorate: 'CAIRO',
    },
    stage: 'UNDER_INTAKE',
  },
  {
    email: 'haramain@osool.test',
    ownerNameEn: 'Hala Mostafa Fahmy',
    ownerNameAr: 'هالة مصطفى فهمي',
    nationalId: '28206300111223',
    tradeNameAr: 'مكتب الحرمين للتسويق العقاري',
    tradeNameEn: 'Al-Haramain Property Marketing Office',
    tradeStyleAr: 'الحرمين',
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '٢٢ شارع شامبليون، وسط البلد، القاهرة',
    governorate: 'CAIRO',
    telephone: '01128889900',
    poBox: '11511',
    commercialRegisterNo: '76233',
    commercialRegisterOffice: 'مكتب سجل تجاري وسط القاهرة',
    commercialRegisterDate: '2018-05-07',
    commercialRegisterRenewalDate: '2028-05-07',
    taxRegistrationNo: '221-559-830',
    taxOffice: 'مأمورية ضرائب وسط القاهرة',
    capital: 55_000,
    category: 'C',
    types: ['RENTAL'],
    contract: {
      clientNameAr: 'أحمد سعيد الشربيني',
      clientNameEn: 'Ahmed Said El Sherbiny',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '5502/2025',
      validFrom: '2026-01-05',
      validTo: '2026-12-31',
      capacityActedIn: 'RENTAL',
      value: 2_400_000,
      subjectDescription: 'شقة سكنية بالدور الخامس، مساحة ١٦٠ متر مربع، للإيجار',
      subjectAddress: '١٤ شارع البستان، باب اللوق، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'UNDER_EXAMINATION',
  },
  {
    email: 'mohandeseen@osool.test',
    ownerNameEn: 'Karim Badawy Ismail',
    ownerNameAr: 'كريم بدوي إسماعيل',
    nationalId: '27509182144332',
    tradeNameAr: 'مؤسسة المهندسين للعقارات',
    tradeNameEn: 'Al-Mohandeseen Properties',
    tradeStyleAr: null,
    legalForm: 'شركة تضامن',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'GENERAL_PARTNER',
    address: '٣ شارع النادي، مدينة نصر، القاهرة',
    governorate: 'CAIRO',
    telephone: '0224011234',
    poBox: '11765',
    commercialRegisterNo: '150907',
    commercialRegisterOffice: 'مكتب سجل تجاري مدينة نصر',
    commercialRegisterDate: '2022-07-19',
    commercialRegisterRenewalDate: '2027-07-19',
    taxRegistrationNo: '904-133-276',
    taxOffice: 'مأمورية ضرائب مدينة نصر',
    capital: 45_000,
    category: 'D',
    types: ['SELL', 'BUY'],
    contract: {
      clientNameAr: 'منى الشاذلي عبد الفتاح',
      clientNameEn: 'Mona El Shazly Abdelfattah',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '3317/2026',
      validFrom: '2026-02-10',
      validTo: '2027-02-09',
      capacityActedIn: 'SELL',
      value: 6_800_000,
      subjectDescription: 'فيلا مستقلة بمساحة ٤٥٠ متر مربع بمنطقة الحي الثامن',
      subjectAddress: 'الحي الثامن، مدينة ٦ أكتوبر، الجيزة',
      governorate: 'GIZA',
    },
    stage: 'AWAITING_COMPLETION',
  },
  {
    email: 'zamalek@osool.test',
    ownerNameEn: 'Yasmin Fouad Ragab',
    ownerNameAr: 'ياسمين فؤاد رجب',
    nationalId: '30107220234567',
    tradeNameAr: 'شركة الزمالك للوساطة والتسويق العقاري',
    tradeNameEn: 'Zamalek Brokerage and Property Marketing',
    tradeStyleAr: 'الزمالك العقارية',
    legalForm: 'شركة ذات مسؤولية محدودة',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'AGENT_UNDER_POA',
    address: '١٩ شارع أحمد حشمت، الزمالك، القاهرة',
    governorate: 'CAIRO',
    telephone: '0227351234',
    poBox: '11211',
    commercialRegisterNo: '182044',
    commercialRegisterOffice: 'مكتب سجل تجاري القاهرة',
    commercialRegisterDate: '2023-01-30',
    commercialRegisterRenewalDate: '2028-01-30',
    taxRegistrationNo: '745-618-092',
    taxOffice: 'مأمورية ضرائب الزمالك',
    capital: 520_000,
    category: 'B',
    types: ['SELL', 'BUY', 'RENTAL'],
    poa: { number: '1183', year: 2026, office: 'مكتب توثيق الزمالك', type: 'SPECIAL' },
    contract: {
      clientNameAr: 'المهندس سامي وديع جرجس',
      clientNameEn: 'Sami Wadie Guirguis',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '6018/2026',
      validFrom: '2026-04-01',
      validTo: '2028-03-31',
      capacityActedIn: 'BUY',
      value: 54_000_000,
      subjectDescription: 'مبنى إداري بمساحة ١٢٠٠ متر مربع، ست طوابق، مؤجر بالكامل',
      subjectAddress: '٧ شارع البرازيل، الزمالك، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'ACTIVE',
  },
  {
    email: 'alex@osool.test',
    ownerNameEn: 'Sherif Kamal Abdelnour',
    ownerNameAr: 'شريف كمال عبد النور',
    nationalId: '28011240221145',
    tradeNameAr: 'شركة الإسكندرية للاستثمار والوساطة العقارية',
    tradeNameEn: 'Alexandria Investment and Property Brokerage',
    tradeStyleAr: 'الإسكندرية العقارية',
    legalForm: 'شركة مساهمة مصرية',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'CHAIRMAN',
    address: '٦٠ طريق الحرية، سموحة، الإسكندرية',
    governorate: 'ALEXANDRIA',
    telephone: '0334256677',
    poBox: '21615',
    commercialRegisterNo: '61980',
    commercialRegisterOffice: 'مكتب سجل تجاري الإسكندرية',
    commercialRegisterDate: '2017-10-11',
    commercialRegisterRenewalDate: '2027-10-11',
    taxRegistrationNo: '150-772-643',
    taxOffice: 'مأمورية ضرائب سموحة',
    capital: 1_200_000,
    category: 'A',
    types: ['SELL', 'DUAL'],
    contract: {
      clientNameAr: 'شركة الساحل الشمالي للتنمية السياحية',
      clientNameEn: 'North Coast Tourism Development',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '7742/2026',
      validFrom: '2026-01-20',
      validTo: '2029-01-19',
      capacityActedIn: 'DUAL',
      value: 210_000_000,
      subjectDescription: 'شاليهات ووحدات فندقية بالمرحلة الثانية من قرية بحري',
      subjectAddress: 'الكيلو ١٣٥ طريق الإسكندرية مطروح، الساحل الشمالي',
      governorate: 'MATROUH',
    },
    stage: 'ACTIVE',
  },
  {
    email: 'giza@osool.test',
    ownerNameEn: 'Amany Rashad Sobhy',
    ownerNameAr: 'أماني رشاد صبحي',
    nationalId: '28409092134567',
    tradeNameAr: 'مؤسسة الجيزة للتسويق العقاري',
    tradeNameEn: 'Giza Property Marketing',
    tradeStyleAr: null,
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '٣١ شارع الهرم، الجيزة',
    governorate: 'GIZA',
    telephone: '01223344556',
    poBox: null,
    commercialRegisterNo: '88104',
    commercialRegisterOffice: 'مكتب سجل تجاري الجيزة',
    commercialRegisterDate: '2022-02-08',
    commercialRegisterRenewalDate: '2027-02-08',
    taxRegistrationNo: '419-336-500',
    taxOffice: 'مأمورية ضرائب الهرم',
    capital: 28_000,
    category: 'D',
    types: ['RENTAL'],
    contract: {
      clientNameAr: 'ورثة المرحوم عبد الحميد الطوخي',
      clientNameEn: 'Heirs of the late Abdelhamid El Tokhy',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '2984/2025',
      validFrom: '2026-01-02',
      validTo: '2026-12-31',
      capacityActedIn: 'RENTAL',
      value: 1_150_000,
      subjectDescription: 'عمارة سكنية من خمسة أدوار، اثنتا عشرة شقة، للإيجار',
      subjectAddress: '٤٤ شارع فيصل، الجيزة',
      governorate: 'GIZA',
    },
    stage: 'AWAITING_PAYMENT',
  },
  {
    email: 'maadi@osool.test',
    ownerNameEn: 'Hossam El Din Zaki',
    ownerNameAr: 'حسام الدين زكي',
    nationalId: '27612050112298',
    tradeNameAr: 'شركة المعادي للوساطة العقارية',
    tradeNameEn: 'Maadi Real Estate Brokerage',
    tradeStyleAr: 'المعادي العقارية',
    legalForm: 'شركة ذات مسؤولية محدودة',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'RESPONSIBLE_MANAGER',
    address: '٩ شارع ٢٣٣، دجلة المعادي، القاهرة',
    governorate: 'CAIRO',
    telephone: '0225198877',
    poBox: '11431',
    commercialRegisterNo: '117620',
    commercialRegisterOffice: 'مكتب سجل تجاري المعادي',
    commercialRegisterDate: '2020-04-16',
    commercialRegisterRenewalDate: '2030-04-16',
    taxRegistrationNo: '830-224-961',
    taxOffice: 'مأمورية ضرائب المعادي',
    capital: 540_000,
    category: 'B',
    types: ['SELL', 'BUY'],
    contract: {
      clientNameAr: 'شركة كايرو للتطوير العمراني',
      clientNameEn: 'Cairo Urban Development',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '4106/2026',
      validFrom: '2026-02-15',
      validTo: '2027-02-14',
      capacityActedIn: 'SELL',
      value: 58_000_000,
      subjectDescription: 'وحدات سكنية وإدارية بمشروع دجلة بلازا',
      subjectAddress: 'كورنيش المعادي، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'CARD_ISSUED',
  },
  {
    email: 'shorouk@osool.test',
    ownerNameEn: 'Rania Adel Mansour',
    ownerNameAr: 'رانيا عادل منصور',
    nationalId: '28707140134489',
    tradeNameAr: 'شركة الشروق للتسويق والوساطة العقارية',
    tradeNameEn: 'El Shorouk Property Marketing and Brokerage',
    tradeStyleAr: 'الشروق العقارية',
    legalForm: 'شركة ذات مسؤولية محدودة',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'CHAIRMAN',
    address: '١٧ شارع الأمل، مدينة الشروق، القاهرة',
    governorate: 'CAIRO',
    telephone: '0226870044',
    poBox: '11837',
    commercialRegisterNo: '139455',
    commercialRegisterOffice: 'مكتب سجل تجاري مدينة الشروق',
    commercialRegisterDate: '2021-08-25',
    commercialRegisterRenewalDate: '2026-08-25',
    taxRegistrationNo: '562-408-137',
    taxOffice: 'مأمورية ضرائب مدينة نصر',
    capital: 950_000,
    category: 'B',
    types: ['SELL', 'BUY', 'DUAL', 'RENTAL'],
    contract: {
      clientNameAr: 'شركة الشروق الجديدة للتعمير',
      clientNameEn: 'New Shorouk Development',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '8823/2025',
      validFrom: '2026-01-10',
      validTo: '2028-01-09',
      capacityActedIn: 'DUAL',
      value: 47_500_000,
      subjectDescription: 'مجمع سكني من ثمانية مبانٍ، ٩٦ وحدة، بيعاً وشراءً',
      subjectAddress: 'الحي الثالث، مدينة الشروق، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'ACTIVE',
  },
  {
    email: 'delta@osool.test',
    ownerNameEn: 'Ayman Fathy Selim',
    ownerNameAr: 'أيمن فتحي سليم',
    nationalId: '28303110125577',
    tradeNameAr: 'شركة دلتا مصر للوساطة العقارية',
    tradeNameEn: 'Delta Misr Real Estate Brokerage',
    tradeStyleAr: 'دلتا مصر',
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '٢٧ شارع الجيش، المنصورة، الدقهلية',
    governorate: 'DAKAHLIA',
    telephone: '0502334455',
    poBox: null,
    commercialRegisterNo: '52117',
    commercialRegisterOffice: 'مكتب سجل تجاري المنصورة',
    commercialRegisterDate: '2023-06-12',
    commercialRegisterRenewalDate: '2028-06-12',
    taxRegistrationNo: '277-651-084',
    taxOffice: 'مأمورية ضرائب المنصورة',
    // Below the Category C floor of EGP 50,000. This is the refusal in the
    // Phase 1 proof point, and it must be demonstrable rather than described.
    capital: 30_000,
    category: 'C',
    types: ['SELL'],
    contract: {
      clientNameAr: 'مصنع الدلتا للغزل والنسيج',
      clientNameEn: 'Delta Spinning and Weaving Factory',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '1745/2026',
      validFrom: '2026-03-05',
      validTo: '2027-03-04',
      capacityActedIn: 'SELL',
      value: 12_000_000,
      subjectDescription: 'أرض صناعية بمساحة ٣ أفدنة بالمنطقة الصناعية',
      subjectAddress: 'المنطقة الصناعية، طلخا، الدقهلية',
      governorate: 'DAKAHLIA',
    },
    stage: 'DRAFT_CAPITAL_SHORTFALL',
  },
  {
    email: 'aswan@osool.test',
    ownerNameEn: 'Mostafa Gaber Hussein',
    ownerNameAr: 'مصطفى جابر حسين',
    nationalId: '27905220124478',
    tradeNameAr: 'مكتب أسوان للخدمات العقارية',
    tradeNameEn: 'Aswan Property Services Office',
    tradeStyleAr: null,
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '٥ شارع كورنيش النيل، أسوان',
    governorate: 'ASWAN',
    telephone: '0972302211',
    poBox: null,
    commercialRegisterNo: '31402',
    commercialRegisterOffice: 'مكتب سجل تجاري أسوان',
    commercialRegisterDate: '2024-01-18',
    commercialRegisterRenewalDate: '2029-01-18',
    taxRegistrationNo: '108-994-352',
    taxOffice: 'مأمورية ضرائب أسوان',
    capital: 22_000,
    category: 'D',
    types: ['RENTAL'],
    contract: {
      clientNameAr: 'شركة النوبة للفنادق والمنتجعات',
      clientNameEn: 'Nubia Hotels and Resorts',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '990/2026',
      validFrom: '2026-02-20',
      validTo: '2027-02-19',
      capacityActedIn: 'RENTAL',
      value: 3_100_000,
      subjectDescription: 'وحدات إقامة موسمية بجزيرة أمون، للإيجار',
      subjectAddress: 'جزيرة أمون، أسوان',
      governorate: 'ASWAN',
    },
    stage: 'REJECTED',
  },
  {
    email: 'heliopolis@osool.test',
    ownerNameEn: 'Ghada Sameh Riad',
    ownerNameAr: 'غادة سامح رياض',
    nationalId: '28602180119923',
    tradeNameAr: 'شركة مصر الجديدة للوساطة العقارية',
    tradeNameEn: 'Heliopolis Real Estate Brokerage',
    tradeStyleAr: 'مصر الجديدة العقارية',
    legalForm: 'شركة ذات مسؤولية محدودة',
    establishmentType: 'LEGAL_PERSON',
    capacity: 'CHAIRMAN',
    address: '٢٨ شارع بغداد، الكوربة، مصر الجديدة، القاهرة',
    governorate: 'CAIRO',
    telephone: '0224156600',
    poBox: '11341',
    commercialRegisterNo: '166820',
    commercialRegisterOffice: 'مكتب سجل تجاري مصر الجديدة',
    commercialRegisterDate: '2022-04-27',
    commercialRegisterRenewalDate: '2027-04-27',
    taxRegistrationNo: '683-147-925',
    taxOffice: 'مأمورية ضرائب مصر الجديدة',
    capital: 480_000,
    category: 'C',
    types: ['SELL', 'RENTAL'],
    contract: {
      clientNameAr: 'شركة الكوربة للاستثمار العقاري',
      clientNameEn: 'Korba Real Estate Investment',
      nationality: 'مصرية',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: '3390/2026',
      validFrom: '2026-03-10',
      validTo: '2027-03-09',
      capacityActedIn: 'SELL',
      value: 24_000_000,
      subjectDescription: 'محال تجارية بالدور الأرضي لعمارات الكوربة، ست وحدات',
      subjectAddress: '١١ شارع الأهرام، الكوربة، مصر الجديدة، القاهرة',
      governorate: 'CAIRO',
    },
    stage: 'UNDER_REVIEW',
  },
  {
    email: 'october@osool.test',
    ownerNameEn: 'Wael Fahmy Abdelmalek',
    ownerNameAr: 'وائل فهمي عبد الملك',
    nationalId: '28109300216654',
    tradeNameAr: 'مؤسسة أكتوبر للتسويق العقاري',
    tradeNameEn: 'October Property Marketing',
    tradeStyleAr: null,
    legalForm: null,
    establishmentType: 'NATURAL_PERSON',
    capacity: 'SOLE_TRADER',
    address: '٤٠ المحور المركزي، الحي المتميز، ٦ أكتوبر، الجيزة',
    governorate: 'GIZA',
    telephone: '01554433221',
    poBox: null,
    commercialRegisterNo: '97341',
    commercialRegisterOffice: 'مكتب سجل تجاري ٦ أكتوبر',
    commercialRegisterDate: '2023-09-05',
    commercialRegisterRenewalDate: '2028-09-05',
    taxRegistrationNo: '394-870-216',
    taxOffice: 'مأمورية ضرائب ٦ أكتوبر',
    capital: 21_000,
    category: 'D',
    types: ['BUY'],
    contract: {
      clientNameAr: 'عائلة الشناوي للاستثمار',
      clientNameEn: 'El Shennawy Family Investments',
      nationality: 'مصرية',
      authenticationBody: 'CONSULATE',
      authenticationNumber: '512/2026',
      validFrom: '2026-02-25',
      validTo: '2027-02-24',
      capacityActedIn: 'BUY',
      value: 4_600_000,
      subjectDescription: 'أرض سكنية بمساحة ٦٠٠ متر مربع بالحي المتميز',
      subjectAddress: 'قطعة ١١٤، الحي المتميز، ٦ أكتوبر، الجيزة',
      governorate: 'GIZA',
    },
    stage: 'APPROVED',
  },
]

/**
 * The government staff who process the demonstration files.
 *
 * Two examiners and two reviewers rather than one of each, because REQ-REG-052
 * only becomes visible when there is somebody else to pass a file to — a single
 * examiner and a single reviewer make segregation of duties look like a rule
 * about two job titles rather than about two people.
 */
export const DEMO_OFFICIALS: Array<{
  email: string
  name: string
  nameAr: string
  role:
    | 'REGISTRY_CLERK'
    | 'EXAMINER'
    | 'REVIEWER'
    | 'CARD_ISSUER'
    | 'DATA_MANAGER'
    | 'FILES_HEAD'
    | 'AUDITOR'
    | 'AML_SUPERVISOR'
  note: string
}> = [
  {
    email: 'clerk@osool.test',
    name: 'Samia Roushdy Attia',
    nameAr: 'سامية رشدي عطية',
    role: 'REGISTRY_CLERK',
    note: 'Intake — temporary numbers and page counts.',
  },
  {
    email: 'examiner@osool.test',
    name: 'Ahmed Abdelrahman Sayed',
    nameAr: 'أحمد عبد الرحمن سيد',
    role: 'EXAMINER',
    note: 'Examination — the internal review form.',
  },
  {
    email: 'examiner2@osool.test',
    name: 'Dalia Mounir Habib',
    nameAr: 'داليا منير حبيب',
    role: 'EXAMINER',
    note: 'A second examiner, so files can be spread.',
  },
  {
    email: 'reviewer@osool.test',
    name: 'Nadia Selim Farag',
    nameAr: 'نادية سليم فرج',
    role: 'REVIEWER',
    note: 'Review — approve or refuse.',
  },
  {
    email: 'reviewer2@osool.test',
    name: 'Mohamed Sabry Kamel',
    nameAr: 'محمد صبري كامل',
    role: 'REVIEWER',
    note: 'A second reviewer, so REQ-REG-052 has somewhere to send a file.',
  },
  {
    email: 'issuer@osool.test',
    name: 'Reham Adel Nassar',
    nameAr: 'ريهام عادل نصار',
    role: 'CARD_ISSUER',
    note: 'Fees, card issuance, and delivery.',
  },
  {
    email: 'data@osool.test',
    name: 'Ihab Mounir Rizk',
    nameAr: 'إيهاب منير رزق',
    role: 'DATA_MANAGER',
    note: 'Data extraction, step 7.',
  },
  {
    email: 'files@osool.test',
    name: 'Magdy Anwar Shaker',
    nameAr: 'مجدي أنور شاكر',
    role: 'FILES_HEAD',
    note: 'Archiving, step 8.',
  },
  {
    email: 'auditor@osool.test',
    name: 'Laila Hosny Ibrahim',
    nameAr: 'ليلى حسني إبراهيم',
    role: 'AUDITOR',
    note: 'Reads everything, changes nothing.',
  },
  {
    email: 'aml@osool.test',
    name: 'Sameh Naguib Boutros',
    nameAr: 'سامح نجيب بطرس',
    role: 'AML_SUPERVISOR',
    note: 'AML supervision — screens arrive in Phase 3.',
  },
]

/** The completions the examiner requests on the AWAITING_COMPLETION file. */
export const DEMO_COMPLETIONS = [
  {
    checklistItemKey: 'PROOF_OF_PAID_UP_CAPITAL',
    descriptionAr:
      'المستند المرفق لإثبات رأس المال المدفوع غير واضح ولا يظهر به خاتم البنك. يُرجى رفع صورة أوضح تتضمن الخاتم والتاريخ.',
    descriptionEn:
      'The proof of paid-up capital is not legible and the bank stamp is not visible. Please upload a clearer copy showing the stamp and the date.',
  },
  {
    checklistItemKey: 'COMMERCIAL_REGISTER_EXTRACT',
    descriptionAr:
      'مستخرج السجل التجاري المرفق منتهي الصلاحية. يُرجى تقديم مستخرج ساري بتاريخ حديث.',
    descriptionEn:
      'The commercial register extract supplied has expired. Please provide a currently valid extract.',
  },
]
