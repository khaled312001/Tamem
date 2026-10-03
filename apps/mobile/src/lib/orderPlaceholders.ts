/**
 * أمثلة حقل «تفاصيل الطلب» حسب نوع المتجر.
 *
 * الحقل ده واحد لكل الأقسام (خدمة «دليفري» بتاعتها حقل نصّي واحد في لوحة
 * التحكم)، فالمثال المكتوب فيه كان بتاع سوبر ماركت دايمًا — «2 كيلو سكر، زيت،
 * 3 علب تونة» وانت بتطلب من صيدلية أو مطعم. المثال الغلط بيوجّه العميل غلط:
 * بيكتب طلب مش من نوع المحل، والأدمن بيرجع يتصل يسأل.
 *
 * المطابقة بالكلمة المفتاحية مش بالمعرّف: الأقسام بتتضاف وتتسمّى من لوحة
 * التحكم، فقسم جديد اسمه «صيدلية الحياة» أو «مطعم» يلاقي مثاله من غير نشر
 * نسخة جديدة. لو مفيش أي تطابق بيرجع مثال عام بيغطي أكتر من نوع.
 */

/** المثال العام — لما القسم مش معروف (دخل من بانر مثلاً). */
export const GENERIC_ORDER_PLACEHOLDER =
  'اكتب طلبك بالتفصيل\nمثال: 2 كيلو سكر + زيت، أو علبة بنادول، أو وجبة فراخ';

interface Rule {
  /** أي كلمة من دول لو ظهرت في اسم القسم، المثال ده هو اللي يتعرض. */
  match: readonly string[];
  placeholder: string;
}

const RULES: readonly Rule[] = [
  {
    // not bare 'دوا': 'الدواجن' contains it, and poultry was getting the
    // pharmacy example.
    match: ['صيدل', 'أدوية', 'ادوية', 'دواء', 'pharmac', 'medicine'],
    placeholder: 'مثال: علبة بنادول إكسترا، شريط كونجستال، فيتامين سي\nلو الدوا بروشتة ارفق صورتها',
  },
  {
    // 'مطاعم' does not contain 'مطعم' — the alef sits between ط and ع, so the
    // one category this rule exists for was falling through to the generic example.
    match: ['مطعم', 'مطاعم', 'وجب', 'restaurant', 'food'],
    placeholder: 'مثال: وجبة فراخ مشوية + رز، 2 بيبسي\nاكتب الإضافات والحاجات اللي مش عايزها',
  },
  {
    match: ['سوبر', 'بقال', 'ماركت', 'supermarket', 'grocery'],
    placeholder: 'مثال: 2 كيلو سكر، زيت عافية 1 لتر، 3 علب تونة',
  },
  {
    match: ['مخبز', 'مخابز', 'حلوي', 'حلوى', 'bakery', 'sweet', 'dessert'],
    placeholder: 'مثال: 1 كيلو بسبوسة، 10 عيش فينو، تورتة عيد ميلاد متوسطة',
  },
  {
    match: ['لحم', 'لحوم', 'دواجن', 'فراخ', 'meat', 'chicken', 'butcher'],
    placeholder: 'مثال: 2 كيلو لحم بتلو مفروم، فرخة بلدي متقطعة\nاكتب التقطيع اللي يناسبك',
  },
  {
    match: ['خضروات', 'خضار', 'فاكهة', 'فواكه', 'vegetab', 'fruit'],
    placeholder: 'مثال: 2 كيلو طماطم، كيلو موز، نصف كيلو ليمون',
  },
  {
    match: ['عطار', 'attar', 'herb', 'spice'],
    placeholder: 'مثال: 250 جرام كمون مطحون، نصف كيلو عسل نحل، قرفة عيدان',
  },
  {
    match: ['بن', 'قهوة', 'coffee', 'cafe'],
    placeholder: 'مثال: نصف كيلو بن محوج وسط، علبة نسكافيه، 100 جرام هيل',
  },
  {
    match: ['skin', 'سكين', 'عناية', 'تجميل', 'كوزمت', 'cosmet', 'beauty', 'care'],
    placeholder: 'مثال: غسول للبشرة الدهنية، واقي شمس SPF50، كريم مرطب\nاكتب الماركة لو محددة',
  },
  {
    match: ['أون لاين', 'اون لاين', 'أونلاين', 'اونلاين', 'hand', 'online', 'منتجات'],
    placeholder: 'مثال: شنطة جلد بني مقاس وسط، أو لينك المنتج اللي عايزه',
  },
];

/**
 * المثال المناسب لاسم القسم. بيقبل الاسم العربي أو الإنجليزي أو المعرّف
 * (restaurants / pharmacies…) — كلهم بيتقارنوا بنفس الكلمات المفتاحية.
 */
export function orderPlaceholderFor(categoryName?: string | null): string {
  const n = (categoryName ?? '').trim().toLowerCase();
  if (!n) return GENERIC_ORDER_PLACEHOLDER;
  for (const r of RULES) {
    if (r.match.some((k) => n.includes(k.toLowerCase()))) return r.placeholder;
  }
  return GENERIC_ORDER_PLACEHOLDER;
}
