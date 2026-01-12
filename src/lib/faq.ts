export type FaqItem = { question: string; answer: string };

export function getMarketplaceFaq(locale: 'en' | 'ar' | 'ku' = 'en'): FaqItem[] {
  const faqs: Record<string, FaqItem[]> = {
    en: [
      {
        question: 'How do I contact a seller?',
        answer:
          "Use the ‘Chat’ button on a listing or on the seller’s profile to message them directly.",
      },
      {
        question: 'Can I negotiate the price?',
        answer:
          'Yes. Agree on the price, meeting place and payment method in chat before you meet.',
      },
      {
        question: 'What if the item isn’t as described?',
        answer:
          "Don’t complete the deal. Don’t pay. Report the listing with details and we’ll review it.",
      },
      {
        question: 'Does KU BAZAR offer delivery or shipping?',
        answer:
          'No. KU BAZAR doesn’t ship. Buyers and sellers arrange pickup or delivery directly at their own responsibility.',
      },
      {
        question: 'How can I avoid scams?',
        answer:
          'Meet in public, inspect the item before paying, avoid untraceable methods and deposits, and only pay once you’re satisfied.',
      },
    ],
    ar: [
      {
        question: 'كيف أتواصل مع البائع؟',
        answer:
          'استخدم زر «الدردشة» في الإعلان أو في صفحة البائع للتواصل مباشرة معه.',
      },
      {
        question: 'هل يمكنني التفاوض على السعر؟',
        answer:
          'نعم. اتفقوا على السعر ومكان اللقاء وطريقة الدفع في الدردشة قبل اللقاء.',
      },
      {
        question: 'ماذا لو لم تكن السلعة مطابقة للوصف؟',
        answer:
          'لا تُكمل الصفقة ولا تدفع. أبلغ عن الإعلان مع التفاصيل لنراجع ونتخذ الإجراء.',
      },
      {
        question: 'هل يوفر KU BAZAR الشحن؟',
        answer:
          'لا. المنصة لا تشحن. يتفق البائع والمشتري على الاستلام أو التوصيل مباشرة وعلى مسؤوليتهما.',
      },
      {
        question: 'كيف أتجنب الاحتيال؟',
        answer:
          'التقِ في مكان عام، افحص السلعة قبل الدفع، تجنب التحويلات غير القابلة للتتبع والدفعات المسبقة، وادفع فقط عند التأكد.',
      },
    ],
    ku: [
      {
        question: 'چۆن پەیوەندیم پێوە بکەم بە فرۆشیار؟',
        answer:
          'دوگمەی «چات/دیالۆگ» لەسەر ڕیکلام یان لە پەیجی فرۆشیار بەکاربهێنە بۆ نامە ناردن بەڕاستی.',
      },
      {
        question: 'دەتوانم لەسەر نرخ گفتوگۆ بکەم؟',
        answer:
          'بەڵێ. لە چاتدا سەرباری نرخ، شوێنی کۆبوونەوە و شێوازی پارەدان ڕێکبخەن پێش بینین.',
      },
      {
        question: 'ئەگەر کاڵا وەك وەسف نەبوو چی بكەم؟',
        answer:
          'مامەڵەکە تەواو مەکە و پارە مەدە. ڕیکلامەکە ڕاپۆرت بکە و وردەکاری بنووسە بۆ پشکنین.',
      },
      {
        question: 'KU BAZAR گەیاندن یان شیپینگ پێشکەش دەکات؟',
        answer:
          'نەخێر. پلاتفۆرمەکە هیچ گەیاندنێک ناکات. کڕیار و فرۆشیار خۆیان ڕێکدەخەن بۆ وەرگرتن یان گەیاندن بە ئەرکی خۆیان.',
      },
      {
        question: 'چۆن دژ بە فیرەیبەری ببمەوە؟',
        answer:
          'لە شوێنی گشتی بینن، پێش پارەدان کاڵاکە تاقی بکەوە، شێوازە نادیارەکان و پێشکەوتاندن مە بەکاربهێنە، و تەنیا کاتێ پارە بدە کە دڵنیایت.',
      },
    ],
  };

  return (faqs[locale] ?? faqs.en) as FaqItem[];
}
